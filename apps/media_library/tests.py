"""Tests for the Module 4 media gallery and local generation flow.

Generation tests use real ``JournalEntry`` and ``Summary`` rows and a stub
ComfyUI client. No network or GPU is required.
"""

import tempfile
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

import requests
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError, models
from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import Resolver404, resolve, reverse
from PIL import Image
from PIL.PngImagePlugin import PngInfo
from rest_framework import status
from rest_framework.test import APITestCase

from .comfyui import (
    MAX_DOWNLOAD_BYTES,
    ComfyUIClient,
    ComfyUIConfigurationError,
    ComfyUIGenerationError,
    ComfyUIInvalidOutputError,
    ComfyUITimeoutError,
    ComfyUIUnavailableError,
    GeneratedImage,
)
from apps.journal.models import JournalEntry
from apps.summaries.models import Summary

from .journal_context import (
    JournalEntryNotFound,
    build_journal_prompt,
    get_journal_entry,
)
from .models import MediaCollection, MediaFile

User = get_user_model()


def image_bytes(image_format="PNG", size=(8, 8)):
    buffer = BytesIO()
    Image.new("RGB", size, (30, 120, 180)).save(buffer, format=image_format)
    return buffer.getvalue()


def image_upload(
    name="photo.png",
    image_format="PNG",
    size=(8, 8),
    content_type="image/png",
):
    return SimpleUploadedFile(
        name,
        image_bytes(image_format=image_format, size=size),
        content_type=content_type,
    )


def png_with_metadata(size=(8, 8)):
    buffer = BytesIO()
    metadata = PngInfo()
    metadata.add_text("prompt", "private workflow metadata")
    Image.new("RGB", size, (30, 120, 180)).save(
        buffer,
        format="PNG",
        pnginfo=metadata,
    )
    return buffer.getvalue()


def jpeg_with_metadata(size=(8, 8)):
    exif = Image.Exif()
    exif[0x0112] = 6  # Orientation: rotate 90 degrees.
    buffer = BytesIO()
    Image.new("RGB", size, (30, 120, 180)).save(
        buffer,
        format="JPEG",
        exif=exif,
        dpi=(300, 300),
    )
    return buffer.getvalue()


def stored_files(root):
    return [path for path in Path(root).rglob("*") if path.is_file()]


class FakeHTTPResponse:
    def __init__(
        self,
        status_code=200,
        payload=None,
        content=b"",
        headers=None,
        json_error=None,
    ):
        self.status_code = status_code
        self.payload = payload
        self.content = content
        self.headers = headers or {}
        self.json_error = json_error
        self.closed = False

    def json(self):
        if isinstance(self.json_error, Exception):
            raise self.json_error
        return self.payload

    def iter_content(self, chunk_size=1):
        for start in range(0, len(self.content), chunk_size):
            yield self.content[start : start + chunk_size]

    def close(self):
        self.closed = True


class FakeSession:
    def __init__(
        self,
        *,
        post_response,
        history_responses=None,
        view_response=None,
    ):
        self.post_response = post_response
        self.history_responses = list(history_responses or [])
        self.view_response = view_response
        self.calls = []

    def post(self, url, **kwargs):
        self.calls.append(("POST", url, kwargs))
        if isinstance(self.post_response, Exception):
            raise self.post_response
        return self.post_response

    def get(self, url, **kwargs):
        self.calls.append(("GET", url, kwargs))
        if url.endswith("/view"):
            if isinstance(self.view_response, Exception):
                raise self.view_response
            return self.view_response
        if not self.history_responses:
            return FakeHTTPResponse(payload={})
        response = self.history_responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


class FakeClock:
    def __init__(self):
        self.value = 0.0

    def __call__(self):
        return self.value

    def sleep(self, seconds):
        self.value += seconds


def submit_response(prompt_id="job-1"):
    return FakeHTTPResponse(
        payload={
            "prompt_id": prompt_id,
            "number": 1,
            "node_errors": {},
        }
    )


def history_response(
    prompt_id="job-1",
    *,
    filename="memora_00001_.png",
    subfolder="",
    status_str="success",
    completed=True,
    outputs=None,
):
    entry = {
        "prompt": [],
        "outputs": outputs
        if outputs is not None
        else {
            "7": {
                "images": [
                    {
                        "filename": filename,
                        "subfolder": subfolder,
                        "type": "output",
                    }
                ]
            }
        },
        "status": {
            "status_str": status_str,
            "completed": completed,
            "messages": [],
        },
    }
    return FakeHTTPResponse(payload={prompt_id: entry})


def image_response(content, content_type="image/png"):
    return FakeHTTPResponse(
        content=content,
        headers={
            "Content-Type": content_type,
            "Content-Length": str(len(content)),
        },
    )


class ComfyUIClientTests(TestCase):
    def make_client(self, session, **overrides):
        options = {
            "base_url": "http://127.0.0.1:8188",
            "workflow_path": (
                settings.BASE_DIR
                / "apps/media_library/workflows/stable_diffusion_1_5_text_to_image.json"
            ),
            "checkpoint": "test-model.safetensors",
            "timeout": 5,
            "request_timeout": 1,
            "poll_interval": 0.0,
            "session": session,
            "sleep_func": lambda seconds: None,
        }
        options.update(overrides)
        return ComfyUIClient(**options)

    def test_submits_workflow_polls_and_returns_sanitized_png(self):
        source = png_with_metadata((512, 768))
        session = FakeSession(
            post_response=submit_response(),
            history_responses=[history_response()],
            view_response=image_response(source),
        )
        prompt = "A quiet lake at dawn, watercolor"

        generated = self.make_client(session).generate(
            prompt=prompt,
            width=512,
            height=768,
            steps=20,
            seed=42,
        )

        self.assertEqual(generated.content_type, "image/png")
        self.assertNotEqual(generated.data, source)
        with Image.open(BytesIO(generated.data)) as image:
            self.assertEqual(image.format, "PNG")
            self.assertEqual(image.size, (512, 768))
            self.assertEqual(image.info, {})

        submit_call = session.calls[0]
        self.assertEqual(submit_call[1], "http://127.0.0.1:8188/prompt")
        workflow = submit_call[2]["json"]["prompt"]
        self.assertEqual(workflow["1"]["inputs"]["ckpt_name"], "test-model.safetensors")
        self.assertEqual(workflow["2"]["inputs"]["text"], prompt)
        self.assertEqual(workflow["5"]["inputs"]["seed"], 42)
        self.assertEqual(workflow["4"]["inputs"]["width"], 512)
        self.assertEqual(workflow["4"]["inputs"]["height"], 768)
        self.assertEqual(workflow["5"]["inputs"]["steps"], 20)

        history_calls = [call for call in session.calls if "/history/" in call[1]]
        self.assertEqual(len(history_calls), 1)
        view_call = next(call for call in session.calls if call[1].endswith("/view"))
        self.assertEqual(
            view_call[2]["params"],
            {
                "filename": "memora_00001_.png",
                "subfolder": "",
                "type": "output",
            },
        )

    def test_output_metadata_is_stripped_for_other_image_formats(self):
        source = jpeg_with_metadata((512, 512))
        session = FakeSession(
            post_response=submit_response(),
            history_responses=[history_response()],
            view_response=image_response(source, content_type="image/jpeg"),
        )

        generated = self.make_client(session).generate(
            prompt="A quiet lake at dawn",
            width=512,
            height=512,
            steps=20,
        )

        with Image.open(BytesIO(generated.data)) as image:
            self.assertEqual(image.format, "PNG")
            self.assertEqual(image.size, (512, 512))
            # EXIF, DPI, and ICC blocks from the provider are all dropped.
            self.assertEqual(image.info, {})

    def test_pending_history_is_polled_until_complete(self):
        source = image_bytes(size=(512, 512))
        session = FakeSession(
            post_response=submit_response(),
            history_responses=[
                FakeHTTPResponse(payload={}),
                history_response(),
            ],
            view_response=image_response(source),
        )

        generated = self.make_client(session).generate(
            prompt="A garden",
            width=512,
            height=512,
            steps=10,
        )

        self.assertTrue(generated.data)
        history_calls = [call for call in session.calls if "/history/" in call[1]]
        self.assertEqual(len(history_calls), 2)

    def test_polling_is_bounded_by_the_total_timeout(self):
        clock = FakeClock()
        session = FakeSession(post_response=submit_response())
        client = self.make_client(
            session,
            timeout=2,
            poll_interval=1,
            sleep_func=clock.sleep,
            clock=clock,
        )

        with self.assertRaises(ComfyUITimeoutError):
            client.generate(prompt="A garden", width=512, height=512, steps=10)

        history_calls = [call for call in session.calls if "/history/" in call[1]]
        self.assertLessEqual(len(history_calls), 3)

    def test_generation_parameters_are_rejected_before_any_request(self):
        cases = (
            {"width": 320, "height": 320, "steps": 10},
            {"width": 512, "height": 512, "steps": 31},
        )

        for params in cases:
            with self.subTest(params=params):
                session = FakeSession(post_response=submit_response())
                with self.assertRaises(ComfyUIGenerationError):
                    self.make_client(session).generate(
                        prompt="A garden",
                        **params,
                    )
                self.assertEqual(session.calls, [])

    def test_over_long_prompt_is_rejected_before_any_request(self):
        session = FakeSession(post_response=submit_response())

        with self.assertRaises(ComfyUIGenerationError):
            self.make_client(session).generate(
                prompt="x" * (settings.MEDIA_GENERATION_MAX_PROMPT_LENGTH + 1),
                width=512,
                height=512,
                steps=10,
            )

        self.assertEqual(session.calls, [])

    def test_connection_error_maps_to_unavailable(self):
        session = FakeSession(post_response=requests.ConnectionError("offline"))

        with self.assertRaises(ComfyUIUnavailableError):
            self.make_client(session).generate(
                prompt="A garden",
                width=512,
                height=512,
                steps=10,
            )

    def test_rejected_workflow_maps_to_generation_error(self):
        session = FakeSession(
            post_response=FakeHTTPResponse(
                status_code=400,
                payload={"error": "invalid prompt"},
            )
        )

        with self.assertRaises(ComfyUIGenerationError):
            self.make_client(session).generate(
                prompt="A garden",
                width=512,
                height=512,
                steps=10,
            )

    def test_comfyui_error_status_maps_to_generation_error(self):
        session = FakeSession(
            post_response=submit_response(),
            history_responses=[history_response(status_str="error")],
        )

        with self.assertRaises(ComfyUIGenerationError):
            self.make_client(session).generate(
                prompt="A garden",
                width=512,
                height=512,
                steps=10,
            )

    def test_unsafe_output_path_is_rejected_before_download(self):
        session = FakeSession(
            post_response=submit_response(),
            history_responses=[history_response(filename="../secret.png")],
            view_response=image_response(image_bytes()),
        )

        with self.assertRaises(ComfyUIInvalidOutputError):
            self.make_client(session).generate(
                prompt="A garden",
                width=512,
                height=512,
                steps=10,
            )

        self.assertFalse(any(call[1].endswith("/view") for call in session.calls))

    def test_missing_output_is_rejected(self):
        session = FakeSession(
            post_response=submit_response(),
            history_responses=[history_response(outputs={})],
        )

        with self.assertRaises(ComfyUIInvalidOutputError):
            self.make_client(session).generate(
                prompt="A garden",
                width=512,
                height=512,
                steps=10,
            )

    def test_unsupported_content_type_is_rejected(self):
        session = FakeSession(
            post_response=submit_response(),
            history_responses=[history_response()],
            view_response=image_response(image_bytes(), content_type="text/plain"),
        )

        with self.assertRaises(ComfyUIInvalidOutputError):
            self.make_client(session).generate(
                prompt="A garden",
                width=512,
                height=512,
                steps=10,
            )

    def test_invalid_image_bytes_are_rejected(self):
        session = FakeSession(
            post_response=submit_response(),
            history_responses=[history_response()],
            view_response=image_response(b"not an image"),
        )

        with self.assertRaises(ComfyUIInvalidOutputError):
            self.make_client(session).generate(
                prompt="A garden",
                width=512,
                height=512,
                steps=10,
            )

    def test_declared_and_actual_image_types_must_match(self):
        session = FakeSession(
            post_response=submit_response(),
            history_responses=[history_response()],
            view_response=image_response(
                image_bytes("JPEG", size=(512, 512)),
                content_type="image/png",
            ),
        )

        with self.assertRaises(ComfyUIInvalidOutputError):
            self.make_client(session).generate(
                prompt="A garden",
                width=512,
                height=512,
                steps=10,
            )

    def test_output_dimensions_must_match_the_request(self):
        session = FakeSession(
            post_response=submit_response(),
            history_responses=[history_response()],
            view_response=image_response(image_bytes(size=(512, 512))),
        )

        with self.assertRaises(ComfyUIInvalidOutputError):
            self.make_client(session).generate(
                prompt="A garden",
                width=512,
                height=768,
                steps=10,
            )

    def test_oversized_download_is_rejected(self):
        session = FakeSession(
            post_response=submit_response(),
            history_responses=[history_response()],
            view_response=FakeHTTPResponse(
                content=image_bytes(),
                headers={
                    "Content-Type": "image/png",
                    "Content-Length": str(MAX_DOWNLOAD_BYTES + 1),
                },
            ),
        )

        with self.assertRaises(ComfyUIInvalidOutputError):
            self.make_client(session).generate(
                prompt="A garden",
                width=512,
                height=512,
                steps=10,
            )

    def test_missing_checkpoint_is_a_configuration_error(self):
        session = FakeSession(post_response=submit_response())

        with self.assertRaises(ComfyUIConfigurationError):
            self.make_client(session, checkpoint="").generate(
                prompt="A garden",
                width=512,
                height=512,
                steps=10,
            )


class StubComfyUIClient:
    def __init__(self, result=None, error=None):
        self.result = result or GeneratedImage(
            data=image_bytes(),
            content_type="image/png",
        )
        self.error = error
        self.calls = []

    def generate(self, **kwargs):
        self.calls.append(kwargs)
        if self.error is not None:
            raise self.error
        return self.result


class GenerateImageApiTests(APITestCase):
    def setUp(self):
        self._media_root = tempfile.TemporaryDirectory()
        self.addCleanup(self._media_root.cleanup)
        self._override = override_settings(MEDIA_ROOT=self._media_root.name)
        self._override.enable()
        self.addCleanup(self._override.disable)
        self.owner = User.objects.create_user(username="owner", password="test-pass-123")
        self.other = User.objects.create_user(username="other", password="test-pass-123")
        self.entry = JournalEntry.objects.create(
            user=self.owner,
            title="Morning walk",
            text="A private body that must never reach ComfyUI.",
            summary_text="A calm walk before breakfast.",
        )
        self.other_entry = JournalEntry.objects.create(
            user=self.other,
            title="Other user's private entry",
            text="Do not expose this to the owner.",
        )
        self.summary = Summary.objects.create(
            owner=self.owner,
            journal_entry=self.entry,
            summary_text="A calm walk before breakfast.",
            mood="calm",
            themes=["nature"],
            illustration_prompt="A quiet park path at sunrise.",
        )
        self.url = reverse("media-generate")

    def post_generate(self, payload=None, client=None):
        client = client or StubComfyUIClient()
        with patch("apps.media_library.views.build_client", return_value=client):
            response = self.client.post(
                self.url,
                {"prompt": "A quiet lake at dawn"} if payload is None else payload,
                format="json",
            )
        return response, client

    def authenticate(self, user=None):
        self.client.force_authenticate(user=user or self.owner)

    def test_generation_stores_ai_media_with_server_owned_fields(self):
        self.authenticate()
        client = StubComfyUIClient()

        response, _ = self.post_generate(
            {
                "prompt": "A quiet lake at dawn",
                "width": 512,
                "height": 512,
                "steps": 20,
                "seed": 7,
                "owner": self.other.pk,
                "media_type": MediaFile.MediaType.ORIGINAL,
                "status": MediaFile.Status.FAILED,
            },
            client=client,
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        media = MediaFile.objects.get(pk=response.data["id"])
        self.assertEqual(media.owner, self.owner)
        self.assertEqual(media.media_type, MediaFile.MediaType.AI_GENERATED)
        self.assertEqual(media.status, MediaFile.Status.SUCCEEDED)
        self.assertEqual(media.prompt, "A quiet lake at dawn")
        self.assertEqual(media.provider, "comfyui")
        self.assertTrue(media.model)
        self.assertIsNone(media.summary)
        self.assertFalse(media.journal_entries.exists())
        self.assertIsNone(response.data["journal_entry_id"])
        self.assertIsNone(response.data["summary_id"])
        self.assertEqual(response.data["provider"], "comfyui")
        self.assertEqual(response.data["status"], MediaFile.Status.SUCCEEDED)
        self.assertIn("/media/users/", response.data["file"])
        self.assertNotIn(str(self._media_root.name), response.data["file"])
        with media.file.open("rb") as stored:
            self.assertEqual(stored.read(), client.result.data)
        self.assertEqual(client.calls[0]["seed"], 7)

    def test_journal_prompt_uses_title_and_recap_but_not_the_body(self):
        self.authenticate()
        client = StubComfyUIClient()

        response, _ = self.post_generate(
            {
                "journal_entry_id": self.entry.pk,
                "title": "CLIENT TITLE MUST BE IGNORED",
                "text": "CLIENT TEXT MUST BE IGNORED",
            },
            client=client,
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        prompt = client.calls[0]["prompt"]
        self.assertIn(self.entry.title, prompt)
        self.assertIn(self.entry.summary_text, prompt)
        self.assertNotIn(self.entry.text, prompt)
        self.assertNotIn("CLIENT TITLE", prompt)
        self.assertNotIn("CLIENT TEXT", prompt)
        media = MediaFile.objects.get(pk=response.data["id"])
        self.assertEqual(list(media.journal_entries.all()), [self.entry])
        self.assertEqual(response.data["journal_entry_id"], self.entry.pk)
        self.assertEqual(
            response.data["journal_entries"],
            [{"id": self.entry.pk, "title": self.entry.title}],
        )

    def test_explicit_prompt_wins_and_is_stored_with_the_journal_link(self):
        self.authenticate()
        client = StubComfyUIClient()

        response, _ = self.post_generate(
            {
                "prompt": "A custom approved prompt",
                "journal_entry_id": self.entry.pk,
            },
            client=client,
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(client.calls[0]["prompt"], "A custom approved prompt")
        media = MediaFile.objects.get(pk=response.data["id"])
        self.assertEqual(media.prompt, "A custom approved prompt")
        self.assertEqual(list(media.journal_entries.all()), [self.entry])

    def test_summary_uses_its_stored_illustration_prompt(self):
        self.authenticate()
        client = StubComfyUIClient()

        response, _ = self.post_generate(
            {"summary_id": self.summary.pk},
            client=client,
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            client.calls[0]["prompt"],
            self.summary.illustration_prompt,
        )
        media = MediaFile.objects.get(pk=response.data["id"])
        self.assertEqual(media.summary, self.summary)
        self.assertEqual(list(media.journal_entries.all()), [self.entry])
        self.assertEqual(response.data["summary_id"], self.summary.pk)
        self.assertEqual(response.data["journal_entry_id"], self.entry.pk)

    def test_manual_prompt_wins_over_the_summary_prompt(self):
        self.authenticate()
        client = StubComfyUIClient()

        response, _ = self.post_generate(
            {"prompt": "Manual prompt", "summary_id": self.summary.pk},
            client=client,
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(client.calls[0]["prompt"], "Manual prompt")
        media = MediaFile.objects.get(pk=response.data["id"])
        self.assertEqual(media.summary, self.summary)
        self.assertEqual(media.prompt, "Manual prompt")

    def test_summary_without_an_illustration_prompt_is_rejected(self):
        self.authenticate()
        summary = Summary.objects.create(
            owner=self.owner,
            journal_entry=self.entry,
            summary_text="No illustration prompt yet.",
            illustration_prompt="",
        )

        response, client = self.post_generate({"summary_id": summary.pk})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("summary_id", response.data)
        self.assertEqual(client.calls, [])
        self.assertEqual(MediaFile.objects.count(), 0)

    def test_summary_must_match_the_supplied_journal_entry(self):
        self.authenticate()
        other_owner_entry = JournalEntry.objects.create(
            user=self.owner,
            title="A different memory",
            text="A different private body.",
        )

        response, client = self.post_generate(
            {
                "summary_id": self.summary.pk,
                "journal_entry_id": other_owner_entry.pk,
            }
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("summary_id", response.data)
        self.assertEqual(client.calls, [])
        self.assertEqual(MediaFile.objects.count(), 0)

    def test_foreign_journal_and_summary_ids_do_not_leak_records(self):
        self.authenticate()
        foreign_summary = Summary.objects.create(
            owner=self.other,
            journal_entry=self.other_entry,
            summary_text="Private summary.",
            illustration_prompt="Private illustration prompt.",
        )

        entry_response, entry_client = self.post_generate(
            {"journal_entry_id": self.other_entry.pk}
        )
        summary_response, summary_client = self.post_generate(
            {"summary_id": foreign_summary.pk}
        )

        self.assertEqual(entry_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(entry_response.data["journal_entry_id"], ["Journal entry not found."])
        self.assertNotIn(self.other_entry.title, str(entry_response.data))
        self.assertEqual(summary_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(summary_response.data["summary_id"], ["Summary not found."])
        self.assertNotIn(foreign_summary.summary_text, str(summary_response.data))
        self.assertEqual(entry_client.calls, [])
        self.assertEqual(summary_client.calls, [])
        self.assertEqual(MediaFile.objects.count(), 0)

    def test_prompt_or_context_is_required(self):
        self.authenticate()

        response, client = self.post_generate({})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("prompt", response.data)
        self.assertEqual(client.calls, [])
        self.assertEqual(MediaFile.objects.count(), 0)

    def test_unknown_journal_reference_is_rejected(self):
        self.authenticate()

        response, client = self.post_generate({"journal_entry_id": 999})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("journal_entry_id", response.data)
        self.assertEqual(client.calls, [])
        self.assertEqual(MediaFile.objects.count(), 0)

    def test_prompt_length_is_capped(self):
        self.authenticate()

        response, client = self.post_generate(
            {"prompt": "x" * (settings.MEDIA_GENERATION_MAX_PROMPT_LENGTH + 1)}
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("prompt", response.data)
        self.assertEqual(client.calls, [])

    def test_blank_prompt_without_a_journal_reference_is_rejected(self):
        self.authenticate()

        response, client = self.post_generate({"prompt": "   "})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("prompt", response.data)
        self.assertEqual(client.calls, [])

    def test_only_supported_dimensions_are_accepted(self):
        self.authenticate()

        response, client = self.post_generate(
            {"prompt": "A lake", "width": 1024, "height": 1024}
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("non_field_errors", response.data)
        self.assertEqual(client.calls, [])

    def test_partial_dimensions_are_rejected(self):
        self.authenticate()

        response, client = self.post_generate({"prompt": "A lake", "width": 512})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("width", response.data)
        self.assertEqual(client.calls, [])

    def test_steps_and_seed_are_bounded(self):
        self.authenticate()

        too_many_steps, _ = self.post_generate(
            {
                "prompt": "A lake",
                "steps": settings.MEDIA_GENERATION_MAX_STEPS + 1,
            }
        )
        self.assertEqual(too_many_steps.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("steps", too_many_steps.data)

        bad_seed, _ = self.post_generate({"prompt": "A lake", "seed": 2**63})
        self.assertEqual(bad_seed.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("seed", bad_seed.data)

    def test_safe_defaults_are_used_and_unknown_parameters_are_not_forwarded(self):
        self.authenticate()
        client = StubComfyUIClient()

        response, _ = self.post_generate(
            {
                "prompt": "A lake",
                "cfg_scale": 9,
                "negative_prompt": "unsupported",
                "sampler": "unsupported",
            },
            client=client,
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        call = client.calls[0]
        self.assertEqual(
            (call["width"], call["height"]),
            settings.MEDIA_GENERATION_ALLOWED_SIZES[0],
        )
        self.assertEqual(call["steps"], settings.MEDIA_GENERATION_DEFAULT_STEPS)
        self.assertEqual(
            set(call),
            {"prompt", "width", "height", "steps", "seed"},
        )

    def test_generation_limits_are_configurable(self):
        self.authenticate()
        options = {
            "MEDIA_GENERATION_ALLOWED_SIZES": ((640, 640),),
            "MEDIA_GENERATION_MIN_STEPS": 5,
            "MEDIA_GENERATION_MAX_STEPS": 9,
            "MEDIA_GENERATION_DEFAULT_STEPS": 7,
            "MEDIA_GENERATION_MAX_PROMPT_LENGTH": 20,
        }

        with override_settings(**options):
            allowed, allowed_client = self.post_generate(
                {"prompt": "A lake", "width": 640, "height": 640}
            )
            defaulted, default_client = self.post_generate({"prompt": "A lake"})
            too_long, too_long_client = self.post_generate({"prompt": "x" * 21})
            wrong_size, wrong_size_client = self.post_generate(
                {"prompt": "A lake", "width": 512, "height": 512}
            )
            wrong_steps, wrong_steps_client = self.post_generate(
                {"prompt": "A lake", "steps": 10}
            )

        self.assertEqual(allowed.status_code, status.HTTP_201_CREATED)
        self.assertEqual(defaulted.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            (default_client.calls[0]["width"], default_client.calls[0]["height"]),
            (640, 640),
        )
        self.assertEqual(default_client.calls[0]["steps"], 7)
        self.assertEqual(too_long.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(too_long_client.calls, [])
        self.assertEqual(wrong_size.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(wrong_size_client.calls, [])
        self.assertEqual(wrong_steps.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(wrong_steps_client.calls, [])
        self.assertEqual(allowed_client.calls[0]["steps"], 7)

    def test_prompts_are_not_written_to_application_logs(self):
        self.authenticate()
        sensitive_prompt = "A private detail that must never be logged"

        with self.assertLogs("apps.media_library.views", level="INFO") as logs:
            response, _ = self.post_generate({"prompt": sensitive_prompt})

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        output = "\n".join(logs.output)
        self.assertIn("user_id=", output)
        self.assertNotIn(sensitive_prompt, output)
        self.assertNotIn("must never be logged", output)

    def test_provider_error_details_are_not_logged(self):
        self.authenticate()
        sensitive_detail = "provider body with SECRET-TOKEN"

        with self.assertLogs("apps.media_library.views", level="INFO") as logs:
            response, _ = self.post_generate(
                client=StubComfyUIClient(
                    error=ComfyUIGenerationError(sensitive_detail)
                )
            )

        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)
        self.assertNotIn(sensitive_detail, "\n".join(logs.output))
        self.assertNotIn("SECRET-TOKEN", "\n".join(logs.output))

    def test_provider_error_details_are_not_exposed(self):
        self.authenticate()
        sensitive_detail = "provider body with SECRET-TOKEN"

        response, _ = self.post_generate(
            client=StubComfyUIClient(
                error=ComfyUIGenerationError(sensitive_detail)
            )
        )

        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)
        self.assertEqual(response.data["detail"], "Image generation failed.")
        self.assertNotIn("SECRET-TOKEN", str(response.data))

    def test_anonymous_generation_is_forbidden(self):
        response, client = self.post_generate()

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(client.calls, [])
        self.assertEqual(MediaFile.objects.count(), 0)

    def test_provider_failures_map_to_safe_api_errors(self):
        self.authenticate()
        cases = (
            (ComfyUIConfigurationError(), status.HTTP_503_SERVICE_UNAVAILABLE),
            (ComfyUIUnavailableError(), status.HTTP_503_SERVICE_UNAVAILABLE),
            (ComfyUITimeoutError(), status.HTTP_504_GATEWAY_TIMEOUT),
            (ComfyUIGenerationError(), status.HTTP_502_BAD_GATEWAY),
            (ComfyUIInvalidOutputError(), status.HTTP_502_BAD_GATEWAY),
        )

        for error, expected_status in cases:
            with self.subTest(error=type(error).__name__):
                response, _ = self.post_generate(
                    client=StubComfyUIClient(error=error)
                )
                self.assertEqual(response.status_code, expected_status)
                self.assertNotIn("Traceback", str(response.data))
                self.assertEqual(MediaFile.objects.count(), 0)

    def test_storage_failure_returns_safe_error_without_a_row(self):
        self.authenticate()

        with patch(
            "django.core.files.storage.FileSystemStorage.save",
            side_effect=OSError("disk full"),
        ):
            response, _ = self.post_generate()

        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.assertIn("detail", response.data)
        self.assertNotIn("disk full", str(response.data))
        self.assertEqual(MediaFile.objects.count(), 0)

    def test_database_failure_removes_the_generated_file_without_a_row(self):
        self.authenticate()

        with patch.object(
            MediaFile,
            "save",
            side_effect=IntegrityError("database unavailable"),
        ):
            response, _ = self.post_generate()

        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.assertIn("detail", response.data)
        self.assertNotIn("database unavailable", str(response.data))
        self.assertEqual(MediaFile.objects.count(), 0)
        self.assertEqual(stored_files(self._media_root.name), [])

    @override_settings(COMFYUI_CHECKPOINT="")
    def test_missing_checkpoint_is_reported_without_a_network_call(self):
        self.authenticate()

        with patch("requests.Session.post") as post:
            response = self.client.post(
                self.url,
                {"prompt": "A quiet lake at dawn"},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(response.data["detail"], "Image generation is not configured.")
        post.assert_not_called()
        self.assertEqual(MediaFile.objects.count(), 0)


class MediaFileModelTests(TestCase):
    def setUp(self):
        self._media_root = tempfile.TemporaryDirectory()
        self.addCleanup(self._media_root.cleanup)
        self._override = override_settings(MEDIA_ROOT=self._media_root.name)
        self._override.enable()
        self.addCleanup(self._override.disable)
        self.user = User.objects.create_user(username="owner", password="test-pass-123")

    def create_media(self, **overrides):
        fields = {"owner": self.user, "file": image_upload()}
        fields.update(overrides)
        return MediaFile.objects.create(**fields)

    def test_upload_is_stored_on_media_storage_with_per_user_path(self):
        media = self.create_media()

        self.assertRegex(
            media.file.name,
            rf"^users/{self.user.pk}/\d{{4}}/\d{{2}}/[0-9a-f]{{32}}\.png$",
        )
        self.assertTrue(Path(media.file.path).is_file())
        stored_name = MediaFile.objects.values_list("file", flat=True).get(pk=media.pk)
        self.assertEqual(stored_name, media.file.name)

    def test_upload_defaults_to_original_without_prompt_or_journal_link(self):
        media = self.create_media()

        self.assertEqual(media.media_type, MediaFile.MediaType.ORIGINAL)
        self.assertEqual(media.status, MediaFile.Status.SUCCEEDED)
        self.assertEqual(media.prompt, "")
        self.assertEqual(media.provider, "")
        self.assertEqual(media.model, "")
        self.assertIsNone(media.summary)
        self.assertFalse(media.journal_entries.exists())

    def test_ai_generated_media_stores_prompt_and_real_provenance(self):
        entry = JournalEntry.objects.create(
            user=self.user,
            title="Morning walk",
            text="Private body.",
        )
        summary = Summary.objects.create(
            owner=self.user,
            journal_entry=entry,
            summary_text="A calm walk.",
            illustration_prompt="A quiet park at sunrise.",
        )
        media = self.create_media(
            media_type=MediaFile.MediaType.AI_GENERATED,
            prompt="A quiet lake at sunrise, watercolor.",
            summary=summary,
            provider="comfyui",
            model="test-model.safetensors",
            status=MediaFile.Status.SUCCEEDED,
        )
        entry.photos.add(media)

        self.assertEqual(media.media_type, "ai_generated")
        self.assertEqual(media.prompt, "A quiet lake at sunrise, watercolor.")
        self.assertEqual(media.summary, summary)
        self.assertEqual(media.provider, "comfyui")
        self.assertEqual(media.model, "test-model.safetensors")
        self.assertEqual(list(media.journal_entries.all()), [entry])
        self.assertEqual(media.status, "succeeded")

    def test_exposes_all_ai_processing_states(self):
        self.assertEqual(
            [choice[0] for choice in MediaFile.Status.choices],
            ["pending", "processing", "succeeded", "failed"],
        )

    def test_journal_provenance_uses_the_existing_photos_many_to_many(self):
        field = JournalEntry._meta.get_field("photos")

        self.assertIsInstance(field, models.ManyToManyField)
        self.assertEqual(field.related_model, MediaFile)
        self.assertEqual(field.remote_field.related_name, "journal_entries")
        self.assertFalse(
            any(
                item.name == "journal_entry_id"
                for item in MediaFile._meta.get_fields()
            )
        )

    def test_removing_the_journal_link_keeps_the_media(self):
        entry = JournalEntry.objects.create(
            user=self.user,
            title="Morning walk",
            text="Private body.",
        )
        media = self.create_media()
        entry.photos.add(media)

        entry.photos.remove(media)

        self.assertTrue(MediaFile.objects.filter(pk=media.pk).exists())
        self.assertFalse(media.journal_entries.exists())

    def test_summary_provenance_is_a_set_null_foreign_key(self):
        field = MediaFile._meta.get_field("summary")

        self.assertTrue(field.is_relation)
        self.assertTrue(field.null)
        self.assertEqual(field.remote_field.on_delete, models.SET_NULL)

    def test_deleting_a_summary_keeps_the_media(self):
        summary = Summary.objects.create(
            owner=self.user,
            summary_text="A calm walk.",
            illustration_prompt="A quiet park.",
        )
        media = self.create_media(summary=summary)

        summary.delete()

        media.refresh_from_db()
        self.assertIsNone(media.summary)
        self.assertTrue(MediaFile.objects.filter(pk=media.pk).exists())

    def test_deleting_a_journal_entry_keeps_the_media(self):
        entry = JournalEntry.objects.create(
            user=self.user,
            title="Morning walk",
            text="Private body.",
        )
        media = self.create_media()
        entry.photos.add(media)

        entry.delete()

        self.assertTrue(MediaFile.objects.filter(pk=media.pk).exists())
        self.assertFalse(media.journal_entries.exists())

    def test_owner_is_the_configured_user_model(self):
        field = MediaFile._meta.get_field("owner")

        self.assertTrue(field.is_relation)
        self.assertEqual(field.remote_field.model, User)

    def test_owner_cascade_deletes_media_rows(self):
        media = self.create_media()

        self.user.delete()

        self.assertFalse(MediaFile.objects.filter(pk=media.pk).exists())

    def test_media_is_ordered_newest_first(self):
        first = self.create_media()
        second = self.create_media()

        self.assertEqual(
            [media.pk for media in MediaFile.objects.all()],
            [second.pk, first.pk],
        )

    def test_same_filename_gets_a_unique_stored_path(self):
        first = self.create_media(file=image_upload("same.png"))
        second = self.create_media(file=image_upload("same.png"))

        self.assertNotEqual(first.file.name, second.file.name)


class JournalContextTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username="owner", password="test-pass-123")
        self.other = User.objects.create_user(username="other", password="test-pass-123")
        self.entry = JournalEntry.objects.create(
            user=self.owner,
            title="Morning walk",
            text="A private body that must never reach ComfyUI.",
            summary_text="A calm walk before breakfast.",
        )
        self.other_entry = JournalEntry.objects.create(
            user=self.other,
            title="Other entry",
            text="Other private body.",
        )

    def test_get_journal_entry_returns_the_owners_entry(self):
        self.assertEqual(
            get_journal_entry(self.owner, self.entry.pk),
            self.entry,
        )

    def test_get_journal_entry_hides_another_users_entry(self):
        with self.assertRaises(JournalEntryNotFound):
            get_journal_entry(self.owner, self.other_entry.pk)

    def test_get_journal_entry_hides_missing_entries(self):
        with self.assertRaises(JournalEntryNotFound):
            get_journal_entry(self.owner, 999999)

    def test_build_journal_prompt_uses_title_and_recap_but_not_the_body(self):
        prompt = build_journal_prompt(self.entry)

        self.assertIn(self.entry.title, prompt)
        self.assertIn(self.entry.summary_text, prompt)
        self.assertNotIn(self.entry.text, prompt)

    def test_build_journal_prompt_normalizes_whitespace(self):
        entry = JournalEntry.objects.create(
            user=self.owner,
            title="  Morning\n walk  ",
            text="Private body.",
            summary_text="  A calm\t walk.  ",
        )

        prompt = build_journal_prompt(entry)

        self.assertIn("Morning walk", prompt)
        self.assertIn("A calm walk.", prompt)
        self.assertNotIn("\n", prompt)
        self.assertNotIn("\t", prompt)

    def test_build_journal_prompt_is_capped(self):
        entry = JournalEntry.objects.create(
            user=self.owner,
            title="T" * 100,
            text="Private body.",
            summary_text="R" * 2000,
        )

        prompt = build_journal_prompt(entry)

        self.assertLessEqual(
            len(prompt),
            settings.MEDIA_GENERATION_MAX_PROMPT_LENGTH,
        )

    def test_build_journal_prompt_is_empty_without_title_or_recap(self):
        entry = JournalEntry.objects.create(
            user=self.owner,
            title="",
            text="Private body only.",
        )

        self.assertEqual(build_journal_prompt(entry), "")


class MediaUploadApiTests(APITestCase):
    def setUp(self):
        self._media_root = tempfile.TemporaryDirectory()
        self.addCleanup(self._media_root.cleanup)
        self._override = override_settings(
            MEDIA_ROOT=self._media_root.name,
            MEDIA_IMAGE_MAX_BYTES=10 * 1024 * 1024,
            MEDIA_IMAGE_MAX_PIXELS=40_000_000,
        )
        self._override.enable()
        self.addCleanup(self._override.disable)
        self.owner = User.objects.create_user(username="owner", password="test-pass-123")
        self.other = User.objects.create_user(username="other", password="test-pass-123")
        self.url = reverse("media-list")

    def authenticate(self, user=None):
        self.client.force_authenticate(user=user or self.owner)

    def test_authenticated_upload_returns_safe_url_and_persists_metadata(self):
        self.authenticate()
        raw = image_bytes()

        response = self.client.post(
            self.url,
            {"file": SimpleUploadedFile("holiday.png", raw, content_type="image/png")},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        media = MediaFile.objects.get(pk=response.data["id"])
        self.assertEqual(media.owner, self.owner)
        self.assertEqual(media.media_type, MediaFile.MediaType.ORIGINAL)
        self.assertEqual(media.status, MediaFile.Status.SUCCEEDED)
        self.assertEqual(media.prompt, "")
        self.assertIsNone(media.summary)
        self.assertFalse(media.journal_entries.exists())
        self.assertEqual(response.data["status"], MediaFile.Status.SUCCEEDED)
        self.assertIsNone(response.data["journal_entry_id"])
        self.assertIsNone(response.data["summary_id"])
        self.assertIn("/media/users/", response.data["file"])
        self.assertNotIn(str(self._media_root.name), response.data["file"])
        with media.file.open("rb") as stored:
            self.assertEqual(stored.read(), raw)

    def test_client_filename_and_mime_type_are_not_trusted(self):
        self.authenticate()

        response = self.client.post(
            self.url,
            {
                "file": SimpleUploadedFile(
                    "photo.jpg",
                    image_bytes("PNG"),
                    content_type="image/jpeg",
                )
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["file"].endswith(".png"))
        media = MediaFile.objects.get(pk=response.data["id"])
        self.assertTrue(media.file.name.endswith(".png"))

    def test_invalid_image_is_rejected(self):
        self.authenticate()

        response = self.client.post(
            self.url,
            {
                "file": SimpleUploadedFile(
                    "notes.png",
                    b"not an image",
                    content_type="image/png",
                )
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("file", response.data)
        self.assertEqual(MediaFile.objects.count(), 0)

    def test_disallowed_image_format_is_rejected(self):
        self.authenticate()

        response = self.client.post(
            self.url,
            {
                "file": image_upload(
                    "photo.gif",
                    image_format="GIF",
                    content_type="image/gif",
                )
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("file", response.data)
        self.assertIn("Unsupported image format", response.data["file"][0])
        self.assertEqual(MediaFile.objects.count(), 0)

    def test_empty_file_is_rejected(self):
        self.authenticate()

        response = self.client.post(
            self.url,
            {"file": SimpleUploadedFile("empty.png", b"", content_type="image/png")},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("file", response.data)
        self.assertEqual(MediaFile.objects.count(), 0)

    @override_settings(MEDIA_IMAGE_MAX_BYTES=10)
    def test_oversized_file_is_rejected(self):
        self.authenticate()

        response = self.client.post(
            self.url,
            {"file": image_upload()},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("file", response.data)
        self.assertIn("too large", response.data["file"][0])
        self.assertEqual(MediaFile.objects.count(), 0)

    @override_settings(MEDIA_IMAGE_MAX_PIXELS=100)
    def test_image_dimensions_are_capped(self):
        self.authenticate()

        response = self.client.post(
            self.url,
            {"file": image_upload(size=(100, 100))},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("file", response.data)
        self.assertIn("dimensions", response.data["file"][0])
        self.assertEqual(MediaFile.objects.count(), 0)

    def test_missing_file_is_rejected(self):
        self.authenticate()

        response = self.client.post(
            self.url,
            {"journal_entry_id": 1},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("file", response.data)
        self.assertEqual(MediaFile.objects.count(), 0)

    def test_anonymous_upload_is_forbidden(self):
        response = self.client.post(
            self.url,
            {"file": image_upload()},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(MediaFile.objects.count(), 0)

    def test_owner_and_media_type_come_from_the_server(self):
        self.authenticate()

        response = self.client.post(
            self.url,
            {
                "file": image_upload(),
                "owner": self.other.pk,
                "media_type": MediaFile.MediaType.AI_GENERATED,
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        media = MediaFile.objects.get(pk=response.data["id"])
        self.assertEqual(media.owner, self.owner)
        self.assertEqual(media.media_type, MediaFile.MediaType.ORIGINAL)

    def test_upload_ignores_client_supplied_provenance(self):
        entry = JournalEntry.objects.create(
            user=self.owner,
            title="Morning walk",
            text="Private body.",
        )
        summary = Summary.objects.create(
            owner=self.owner,
            journal_entry=entry,
            summary_text="A calm walk.",
            illustration_prompt="A quiet park.",
        )
        self.authenticate()

        response = self.client.post(
            self.url,
            {
                "file": image_upload(),
                "journal_entry_id": entry.pk,
                "summary_id": summary.pk,
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        media = MediaFile.objects.get(pk=response.data["id"])
        self.assertIsNone(media.summary)
        self.assertFalse(media.journal_entries.exists())
        self.assertIsNone(response.data["journal_entry_id"])
        self.assertIsNone(response.data["summary_id"])

    def test_database_failure_removes_the_stored_upload(self):
        self.authenticate()
        self.client.raise_request_exception = False

        def save_then_fail(instance, *args, **kwargs):
            instance.file.save(instance.file.name, instance.file.file, save=False)
            raise IntegrityError("database unavailable")

        with patch.object(MediaFile, "save", new=save_then_fail):
            response = self.client.post(
                self.url,
                {"file": image_upload()},
                format="multipart",
            )

        self.assertEqual(
            response.status_code,
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
        self.assertEqual(MediaFile.objects.count(), 0)
        self.assertEqual(stored_files(self._media_root.name), [])

    def test_list_only_returns_the_callers_media(self):
        owner_media = MediaFile.objects.create(owner=self.owner, file=image_upload())
        MediaFile.objects.create(owner=self.other, file=image_upload())
        self.authenticate(self.owner)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([item["id"] for item in response.data], [owner_media.pk])

    def test_list_requires_authentication(self):
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class MediaFileDetailApiTests(APITestCase):
    def setUp(self):
        self._media_root = tempfile.TemporaryDirectory()
        self.addCleanup(self._media_root.cleanup)
        self._override = override_settings(MEDIA_ROOT=self._media_root.name)
        self._override.enable()
        self.addCleanup(self._override.disable)
        self.owner = User.objects.create_user(username="owner", password="test-pass-123")
        self.other = User.objects.create_user(username="other", password="test-pass-123")

    def authenticate(self, user=None):
        self.client.force_authenticate(user=user or self.owner)

    def create_media(self, owner=None):
        return MediaFile.objects.create(
            owner=owner or self.owner,
            file=image_upload(),
        )

    def detail_url(self, media):
        return reverse("media-detail", args=[media.pk])

    def test_retrieve_returns_owner_media_with_a_safe_url(self):
        media = self.create_media()
        self.authenticate()

        response = self.client.get(self.detail_url(media))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], media.pk)
        self.assertEqual(response.data["media_type"], MediaFile.MediaType.ORIGINAL)
        self.assertIn("/media/users/", response.data["file"])
        self.assertNotIn(str(self._media_root.name), response.data["file"])

    def test_retrieve_of_another_owners_media_is_not_found(self):
        media = self.create_media(owner=self.other)
        self.authenticate()

        response = self.client.get(self.detail_url(media))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_detail_requires_authentication(self):
        media = self.create_media()

        get_response = self.client.get(self.detail_url(media))
        patch_response = self.client.patch(
            self.detail_url(media),
            {"prompt": "Anonymous edit"},
            format="json",
        )

        self.assertEqual(get_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(patch_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(MediaFile.objects.get(pk=media.pk).prompt, "")

    def test_patch_updates_prompt_and_ignores_protected_fields(self):
        media = self.create_media()
        original_file = media.file.name
        self.authenticate()

        response = self.client.patch(
            self.detail_url(media),
            {
                "prompt": "A memory rewritten in watercolor.",
                "owner": self.other.pk,
                "file": "users/other/stolen.png",
                "media_type": MediaFile.MediaType.AI_GENERATED,
                "status": MediaFile.Status.FAILED,
                "journal_entry_id": 3,
                "summary_id": 5,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        media.refresh_from_db()
        self.assertEqual(media.prompt, "A memory rewritten in watercolor.")
        self.assertEqual(media.owner, self.owner)
        self.assertEqual(media.file.name, original_file)
        self.assertEqual(media.media_type, MediaFile.MediaType.ORIGINAL)
        self.assertEqual(media.status, MediaFile.Status.SUCCEEDED)
        self.assertIsNone(media.summary)
        self.assertFalse(media.journal_entries.exists())

    def test_put_requires_a_prompt_and_accepts_an_empty_one(self):
        media = self.create_media()
        self.authenticate()

        missing = self.client.put(
            self.detail_url(media),
            {},
            format="json",
        )
        cleared = self.client.put(
            self.detail_url(media),
            {"prompt": ""},
            format="json",
        )

        self.assertEqual(missing.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("prompt", missing.data)
        self.assertEqual(cleared.status_code, status.HTTP_200_OK)
        self.assertEqual(MediaFile.objects.get(pk=media.pk).prompt, "")

    def test_prompt_length_is_capped_on_update(self):
        media = self.create_media()
        self.authenticate()

        response = self.client.patch(
            self.detail_url(media),
            {"prompt": "x" * 1001},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("prompt", response.data)
        self.assertEqual(MediaFile.objects.get(pk=media.pk).prompt, "")

    def test_update_is_scoped_to_the_owner(self):
        media = self.create_media(owner=self.other)
        self.authenticate()

        response = self.client.patch(
            self.detail_url(media),
            {"prompt": "Stolen prompt"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(MediaFile.objects.get(pk=media.pk).prompt, "")

    def test_delete_removes_the_row_and_stored_file(self):
        media = self.create_media()
        path = Path(media.file.path)
        self.authenticate()

        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.delete(self.detail_url(media))

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(MediaFile.objects.filter(pk=media.pk).exists())
        self.assertFalse(path.exists())

    def test_delete_of_another_owners_media_keeps_the_row_and_file(self):
        media = self.create_media(owner=self.other)
        path = Path(media.file.path)
        self.authenticate()

        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.delete(self.detail_url(media))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(MediaFile.objects.filter(pk=media.pk).exists())
        self.assertTrue(path.exists())

    def test_delete_keeps_a_file_still_referenced_by_another_row(self):
        first = self.create_media()
        second = self.create_media()
        second.file.name = first.file.name
        second.save(update_fields=["file"])
        path = Path(first.file.path)
        self.authenticate()

        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.delete(self.detail_url(first))

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(MediaFile.objects.filter(pk=first.pk).exists())
        self.assertTrue(MediaFile.objects.filter(pk=second.pk).exists())
        self.assertTrue(path.exists())

    def test_database_failure_during_delete_keeps_the_row_and_file(self):
        media = self.create_media()
        path = Path(media.file.path)
        self.authenticate()
        self.client.raise_request_exception = False

        with patch.object(
            MediaFile,
            "delete",
            side_effect=IntegrityError("database unavailable"),
        ):
            response = self.client.delete(self.detail_url(media))

        self.assertEqual(
            response.status_code,
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
        self.assertTrue(MediaFile.objects.filter(pk=media.pk).exists())
        self.assertTrue(path.exists())

    def test_storage_failure_during_cleanup_keeps_the_deleted_row_gone_and_logs(self):
        media = self.create_media()
        path = Path(media.file.path)
        self.authenticate()

        with self.assertLogs("apps.media_library.views", level="WARNING") as logs:
            with patch(
                "django.core.files.storage.FileSystemStorage.delete",
                side_effect=OSError("file is locked"),
            ):
                with self.captureOnCommitCallbacks(execute=True):
                    response = self.client.delete(self.detail_url(media))

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(MediaFile.objects.filter(pk=media.pk).exists())
        self.assertTrue(path.exists())
        self.assertIn("cleanup failed", "\n".join(logs.output))


class MediaRouteTests(SimpleTestCase):
    def test_static_routes_are_not_captured_by_the_detail_route(self):
        self.assertEqual(
            resolve("/api/media/generate/").url_name,
            "media-generate",
        )
        self.assertEqual(resolve("/api/media/").url_name, "media-list")

    def test_mock_journal_endpoint_is_gone(self):
        with self.assertRaises(Resolver404):
            resolve("/api/media/mock-journal-entries/")

    def test_detail_route_only_accepts_integer_ids(self):
        match = resolve("/api/media/7/")

        self.assertEqual(match.url_name, "media-detail")
        self.assertEqual(match.kwargs, {"pk": 7})
        with self.assertRaises(Resolver404):
            resolve("/api/media/not-an-id/")

    def test_collection_and_favorite_routes_resolve(self):
        self.assertEqual(
            resolve("/api/media/collections/").url_name,
            "media-collection-list",
        )
        self.assertEqual(
            resolve("/api/media/collections/3/").url_name,
            "media-collection-detail",
        )
        self.assertEqual(
            resolve("/api/media/collections/3/items/").url_name,
            "media-collection-items",
        )
        self.assertEqual(
            resolve("/api/media/collections/3/items/8/").url_name,
            "media-collection-item",
        )
        self.assertEqual(
            resolve("/api/media/8/favorite/").url_name,
            "media-favorite",
        )


class FavoriteApiTests(APITestCase):
    def setUp(self):
        self._media_root = tempfile.TemporaryDirectory()
        self.addCleanup(self._media_root.cleanup)
        self._override = override_settings(MEDIA_ROOT=self._media_root.name)
        self._override.enable()
        self.addCleanup(self._override.disable)
        self.owner = User.objects.create_user(
            username="owner",
            password="test-pass-123",
        )
        self.other = User.objects.create_user(
            username="other",
            password="test-pass-123",
        )
        self.media = MediaFile.objects.create(
            owner=self.owner,
            file=image_upload(),
        )

    def authenticate(self, user=None):
        self.client.force_authenticate(user=user or self.owner)

    def favorite_url(self, media=None):
        return reverse("media-favorite", args=[(media or self.media).pk])

    def test_favorite_and_unfavorite_persist_across_requests(self):
        self.authenticate()

        favorite = self.client.patch(
            self.favorite_url(),
            {"is_favorite": True},
            format="json",
        )

        self.assertEqual(favorite.status_code, status.HTTP_200_OK)
        self.assertTrue(favorite.data["is_favorite"])
        self.media.refresh_from_db()
        self.assertTrue(self.media.is_favorite)

        listed = self.client.get(reverse("media-list"))
        row = next(item for item in listed.data if item["id"] == self.media.pk)
        self.assertTrue(row["is_favorite"])

        unfavorite = self.client.patch(
            self.favorite_url(),
            {"is_favorite": False},
            format="json",
        )

        self.assertEqual(unfavorite.status_code, status.HTTP_200_OK)
        self.assertFalse(unfavorite.data["is_favorite"])
        self.media.refresh_from_db()
        self.assertFalse(self.media.is_favorite)

    def test_favorite_requires_a_boolean_value(self):
        self.authenticate()

        missing = self.client.patch(
            self.favorite_url(),
            {},
            format="json",
        )
        invalid = self.client.patch(
            self.favorite_url(),
            {"is_favorite": "not-a-boolean"},
            format="json",
        )

        self.assertEqual(missing.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("is_favorite", missing.data)
        self.assertEqual(invalid.status_code, status.HTTP_400_BAD_REQUEST)
        self.media.refresh_from_db()
        self.assertFalse(self.media.is_favorite)

    def test_another_owner_cannot_favorite_the_media(self):
        self.authenticate(self.other)

        response = self.client.patch(
            self.favorite_url(),
            {"is_favorite": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.media.refresh_from_db()
        self.assertFalse(self.media.is_favorite)

    def test_anonymous_favorite_is_forbidden(self):
        response = self.client.patch(
            self.favorite_url(),
            {"is_favorite": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.media.refresh_from_db()
        self.assertFalse(self.media.is_favorite)


class MediaCollectionApiTests(APITestCase):
    def setUp(self):
        self._media_root = tempfile.TemporaryDirectory()
        self.addCleanup(self._media_root.cleanup)
        self._override = override_settings(MEDIA_ROOT=self._media_root.name)
        self._override.enable()
        self.addCleanup(self._override.disable)
        self.owner = User.objects.create_user(
            username="owner",
            password="test-pass-123",
        )
        self.other = User.objects.create_user(
            username="other",
            password="test-pass-123",
        )
        self.media = MediaFile.objects.create(
            owner=self.owner,
            file=image_upload(),
        )

    def authenticate(self, user=None):
        self.client.force_authenticate(user=user or self.owner)

    def create_collection(self, owner=None, name="Travel", **overrides):
        values = {
            "owner": owner or self.owner,
            "name": name,
        }
        values.update(overrides)
        return MediaCollection.objects.create(**values)

    def collection_url(self, collection):
        return reverse("media-collection-detail", args=[collection.pk])

    def test_create_collection_trims_fields_and_assigns_owner(self):
        self.authenticate()

        response = self.client.post(
            reverse("media-collection-list"),
            {"name": "  Travel  ", "description": "  Places I have been  "},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        collection = MediaCollection.objects.get(pk=response.data["id"])
        self.assertEqual(collection.owner, self.owner)
        self.assertEqual(collection.name, "Travel")
        self.assertEqual(collection.description, "Places I have been")
        self.assertEqual(response.data["item_count"], 0)

    def test_create_rejects_blank_or_oversized_fields(self):
        self.authenticate()
        url = reverse("media-collection-list")

        blank = self.client.post(url, {"name": "   "}, format="json")
        long_name = self.client.post(url, {"name": "x" * 81}, format="json")
        long_description = self.client.post(
            url,
            {"name": "Travel", "description": "x" * 501},
            format="json",
        )

        self.assertEqual(blank.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("name", blank.data)
        self.assertEqual(long_name.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("name", long_name.data)
        self.assertEqual(
            long_description.status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertIn("description", long_description.data)
        self.assertEqual(MediaCollection.objects.count(), 0)

    def test_duplicate_names_are_rejected_case_insensitively(self):
        self.create_collection(name="Travel")
        self.authenticate()

        response = self.client.post(
            reverse("media-collection-list"),
            {"name": "travel"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("name", response.data)
        self.assertEqual(MediaCollection.objects.count(), 1)

    def test_list_is_owner_scoped_and_reports_item_count(self):
        own_collection = self.create_collection(name="Travel")
        own_collection.items.add(self.media)
        self.create_collection(owner=self.other, name="Private")
        self.authenticate()

        response = self.client.get(reverse("media-collection-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["id"], own_collection.pk)
        self.assertEqual(response.data[0]["item_count"], 1)

    def test_rename_and_description_updates_are_persisted(self):
        collection = self.create_collection(name="Travel")
        self.authenticate()

        response = self.client.patch(
            self.collection_url(collection),
            {"name": "Journeys", "description": "Long trips"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        collection.refresh_from_db()
        self.assertEqual(collection.name, "Journeys")
        self.assertEqual(collection.description, "Long trips")

        same_name = self.client.patch(
            self.collection_url(collection),
            {"name": "journeys"},
            format="json",
        )
        self.assertEqual(same_name.status_code, status.HTTP_200_OK)

    def test_rename_rejects_another_collections_name(self):
        self.create_collection(name="Travel")
        collection = self.create_collection(name="Ideas")
        self.authenticate()

        response = self.client.patch(
            self.collection_url(collection),
            {"name": "travel"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("name", response.data)
        collection.refresh_from_db()
        self.assertEqual(collection.name, "Ideas")

    def test_delete_collection_keeps_media_and_stored_file(self):
        collection = self.create_collection()
        collection.items.add(self.media)
        stored_path = self.media.file.path
        self.authenticate()

        response = self.client.delete(self.collection_url(collection))

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(
            MediaCollection.objects.filter(pk=collection.pk).exists()
        )
        self.media.refresh_from_db()
        self.assertTrue(MediaFile.objects.filter(pk=self.media.pk).exists())
        self.assertTrue(Path(stored_path).exists())

    def test_another_owner_cannot_access_or_change_a_collection(self):
        collection = self.create_collection(name="Private")
        self.authenticate(self.other)

        retrieve = self.client.get(self.collection_url(collection))
        update = self.client.patch(
            self.collection_url(collection),
            {"name": "Hijacked"},
            format="json",
        )
        delete = self.client.delete(self.collection_url(collection))

        self.assertEqual(retrieve.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(update.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(delete.status_code, status.HTTP_404_NOT_FOUND)
        collection.refresh_from_db()
        self.assertEqual(collection.name, "Private")

    def test_anonymous_collection_requests_are_forbidden(self):
        list_response = self.client.get(reverse("media-collection-list"))
        create_response = self.client.post(
            reverse("media-collection-list"),
            {"name": "Anonymous"},
            format="json",
        )

        self.assertEqual(
            list_response.status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            create_response.status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(MediaCollection.objects.count(), 0)

    def test_detail_returns_items_and_media_membership_ids(self):
        collection = self.create_collection()
        collection.items.add(self.media)
        self.authenticate()

        response = self.client.get(self.collection_url(collection))
        listed = self.client.get(reverse("media-list"))
        row = next(
            item for item in listed.data if item["id"] == self.media.pk
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["item_count"], 1)
        self.assertEqual(
            [item["id"] for item in response.data["items"]],
            [self.media.pk],
        )
        self.assertEqual(row["collection_ids"], [collection.pk])
        self.assertFalse(row["is_favorite"])


class MediaCollectionItemApiTests(APITestCase):
    def setUp(self):
        self._media_root = tempfile.TemporaryDirectory()
        self.addCleanup(self._media_root.cleanup)
        self._override = override_settings(MEDIA_ROOT=self._media_root.name)
        self._override.enable()
        self.addCleanup(self._override.disable)
        self.owner = User.objects.create_user(
            username="owner",
            password="test-pass-123",
        )
        self.other = User.objects.create_user(
            username="other",
            password="test-pass-123",
        )
        self.first_media = MediaFile.objects.create(
            owner=self.owner,
            file=image_upload("first.png"),
        )
        self.second_media = MediaFile.objects.create(
            owner=self.owner,
            file=image_upload("second.png"),
        )
        self.other_media = MediaFile.objects.create(
            owner=self.other,
            file=image_upload("other.png"),
        )
        self.first_collection = MediaCollection.objects.create(
            owner=self.owner,
            name="Travel",
        )
        self.second_collection = MediaCollection.objects.create(
            owner=self.owner,
            name="Ideas",
        )
        self.other_collection = MediaCollection.objects.create(
            owner=self.other,
            name="Private",
        )

    def authenticate(self, user=None):
        self.client.force_authenticate(user=user or self.owner)

    def items_url(self, collection):
        return reverse("media-collection-items", args=[collection.pk])

    def item_url(self, collection, media):
        return reverse(
            "media-collection-item",
            args=[collection.pk, media.pk],
        )

    def test_media_can_belong_to_multiple_collections(self):
        self.authenticate()

        first = self.client.post(
            self.items_url(self.first_collection),
            {"media_id": self.first_media.pk},
            format="json",
        )
        second = self.client.post(
            self.items_url(self.second_collection),
            {"media_id": self.first_media.pk},
            format="json",
        )

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            set(self.first_media.collections.values_list("pk", flat=True)),
            {self.first_collection.pk, self.second_collection.pk},
        )
        self.assertCountEqual(
            second.data["collection_ids"],
            [self.first_collection.pk, self.second_collection.pk],
        )

    def test_adding_the_same_media_twice_is_idempotent(self):
        self.authenticate()
        url = self.items_url(self.first_collection)

        first = self.client.post(
            url,
            {"media_id": self.first_media.pk},
            format="json",
        )
        second = self.client.post(
            url,
            {"media_id": self.first_media.pk},
            format="json",
        )

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(self.first_collection.items.count(), 1)

    def test_cannot_add_another_owners_media_by_id(self):
        self.authenticate()

        response = self.client.post(
            self.items_url(self.first_collection),
            {"media_id": self.other_media.pk},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("media_id", response.data)
        self.assertEqual(self.first_collection.items.count(), 0)

    def test_cannot_add_to_another_owners_collection(self):
        self.authenticate()

        response = self.client.post(
            self.items_url(self.other_collection),
            {"media_id": self.first_media.pk},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self.other_collection.items.count(), 0)

    def test_remove_media_from_collection_keeps_media_and_file(self):
        self.first_collection.items.add(self.first_media)
        stored_path = self.first_media.file.path
        self.authenticate()

        response = self.client.delete(
            self.item_url(self.first_collection, self.first_media)
        )

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(self.first_collection.items.count(), 0)
        self.assertTrue(
            MediaFile.objects.filter(pk=self.first_media.pk).exists()
        )
        self.assertTrue(Path(stored_path).exists())

    def test_removing_a_non_member_is_idempotent(self):
        self.authenticate()

        response = self.client.delete(
            self.item_url(self.first_collection, self.first_media)
        )

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertTrue(
            MediaFile.objects.filter(pk=self.first_media.pk).exists()
        )

    def test_cannot_remove_through_another_owners_collection(self):
        self.first_collection.items.add(self.first_media)
        self.authenticate(self.other)

        response = self.client.delete(
            self.item_url(self.first_collection, self.first_media)
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(self.first_collection.items.count(), 1)

    def test_deleting_media_removes_membership_but_keeps_collection(self):
        self.first_collection.items.add(self.first_media)
        self.second_collection.items.add(self.first_media)

        self.first_media.delete()

        self.assertTrue(
            MediaCollection.objects.filter(
                pk=self.first_collection.pk
            ).exists()
        )
        self.assertEqual(self.first_collection.items.count(), 0)
        self.assertEqual(self.second_collection.items.count(), 0)

    def test_anonymous_item_mutations_are_forbidden(self):
        add_response = self.client.post(
            self.items_url(self.first_collection),
            {"media_id": self.first_media.pk},
            format="json",
        )
        remove_response = self.client.delete(
            self.item_url(self.first_collection, self.first_media)
        )

        self.assertEqual(
            add_response.status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            remove_response.status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(self.first_collection.items.count(), 0)

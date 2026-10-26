"""Tests for the audio app.

Covers the three layers of the module:
  1. Upload validation   (AudioUploadSerializer — size + MIME, §1.8)
  2. AI service layer    (Groq request shape, structured LLM output handling,
                          mock mode, and the "no API key = hard failure" rule)
  3. API views           (auth, ownership isolation, upload → async handoff,
                          retrieve, patch — text corrections and audio
                          replacement —, delete, non-owner 404s)

No test ever reaches Groq: the HTTP layer is patched, and view tests patch the
background-processing handoff so nothing races a thread.
"""

import json
import os
import tempfile
import threading
from unittest.mock import MagicMock, patch

import requests
from django.contrib.auth import get_user_model
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .models import AudioEntry
from .serializers import AudioEntryUpdateSerializer, AudioUploadSerializer
from .services import (
    MAX_AUDIO_BYTES,
    AIModelUnavailable,
    AINotConfigured,
    AIQuotaExceeded,
    AITimeoutError,
    AIUnexpectedOutput,
    AIUnavailableError,
    AudioAIError,
    AudioFormatError,
    analyse_sentiment,
    detect_language,
    process_audio_entry,
    summarise_text,
    transcribe_audio,
    _normalize_language_code,
)
from .views import process_entry_by_pk, start_processing

User = get_user_model()

# Smallest valid-looking payload: the validator only checks size + MIME.
MINIMAL_AUDIO = b"RIFF0000WAVEfmt "

# Realistic environment for every call that is expected to hit the (patched) API.
LIVE = {"GROQ_MOCK": "false", "GROQ_API_KEY": "gsk_fake_key"}


def audio_file(name="memo.wav", content_type="audio/wav", content=MINIMAL_AUDIO):
    return SimpleUploadedFile(name, content, content_type=content_type)


def groq_response(payload, status_code=200, headers=None):
    """A stand-in for requests.Response returned by the Groq API."""
    response = MagicMock()
    response.status_code = status_code
    response.ok = 200 <= status_code < 400
    response.json.return_value = payload
    response.text = json.dumps(payload)
    response.headers = headers or {}
    return response


def chat_response(content, status_code=200):
    """A /chat/completions answer wrapping an assistant message."""
    return groq_response({"choices": [{"message": {"role": "assistant", "content": content}}]}, status_code)


def groq_error(message, status_code=400, err_type="invalid_request_error"):
    return groq_response({"error": {"message": message, "type": err_type}}, status_code)


class _ReadableFile:
    """Minimal stand-in for a stored Django File (name + seek/read)."""

    def __init__(self, data, name="memo.wav"):
        self._data = data
        self.name = name

    def seek(self, offset):
        self._pos = offset

    def read(self):
        return self._data


def sent_form(post):
    """The multipart form fields of the transcription call."""
    return post.call_args.kwargs["data"]


def sent_file_part(post):
    return post.call_args.kwargs["files"]["file"]


# ===========================================================================
# 1. Upload validation
# ===========================================================================


class UploadValidationTests(TestCase):
    def test_accepts_allowed_types(self):
        for content_type in ("audio/wav", "audio/mpeg", "audio/webm", "audio/mp4"):
            serializer = AudioUploadSerializer(data={"file": audio_file(content_type=content_type)})
            self.assertTrue(serializer.is_valid(), f"{content_type} should be accepted")

    def test_rejects_disallowed_type(self):
        serializer = AudioUploadSerializer(
            data={"file": audio_file(name="notes.txt", content_type="text/plain")}
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("file", serializer.errors)

    def test_rejects_oversized_file(self):
        big = SimpleUploadedFile(
            "big.wav", b"x" * (25 * 1024 * 1024 + 1), content_type="audio/wav"
        )
        serializer = AudioUploadSerializer(data={"file": big})

        self.assertFalse(serializer.is_valid())
        self.assertIn("too large", str(serializer.errors["file"][0]).lower())

    def test_requires_file_field(self):
        serializer = AudioUploadSerializer(data={})

        self.assertFalse(serializer.is_valid())
        self.assertIn("file", serializer.errors)

    def test_size_ceiling_matches_the_groq_limit(self):
        """The serializer must not accept what Groq is about to refuse."""
        self.assertEqual(25 * 1024 * 1024, MAX_AUDIO_BYTES)

    def test_rejects_a_stored_path_instead_of_an_upload(self):
        """A path would attach somebody else's recording to this account."""
        serializer = AudioUploadSerializer(data={"file": "audio/2/victim.wav"})

        self.assertFalse(serializer.is_valid())
        self.assertIn("file upload", str(serializer.errors["file"][0]))

    def test_the_update_serializer_reuses_the_same_file_rules(self):
        """Replacing a recording cannot bypass the upload constraints."""
        big = SimpleUploadedFile(
            "big.wav", b"x" * (25 * 1024 * 1024 + 1), content_type="audio/wav"
        )
        serializer = AudioEntryUpdateSerializer(data={"file": big}, partial=True)

        self.assertFalse(serializer.is_valid())
        self.assertIn("too large", str(serializer.errors["file"][0]).lower())

        serializer = AudioEntryUpdateSerializer(
            data={"file": audio_file(name="notes.txt", content_type="text/plain")}, partial=True
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("Unsupported file type", str(serializer.errors["file"][0]))


# ===========================================================================
# 2. AI service layer
# ===========================================================================


class TranscriptionServiceTests(TestCase):
    def test_mock_mode_returns_stub_transcript(self):
        with patch.dict(os.environ, {"GROQ_MOCK": "true"}):
            transcript = transcribe_audio(None)  # file unused in mock mode

        self.assertIsInstance(transcript, str)
        self.assertTrue(transcript.startswith("[Mock]"))

    def test_uses_the_groq_mock_flag_not_hugging_face(self):
        """A stale HF_MOCK must not silently enable stub responses."""
        with patch.dict(os.environ, {**LIVE, "HF_MOCK": "true", "GROQ_MOCK": "false"}), patch(
            "apps.audio.services.requests.post"
        ) as post:
            post.return_value = chat_response('{"language_code": "fr"}')
            detect_language("bonjour")

        self.assertIn("api.groq.com", post.call_args.args[0])

    def test_posts_multipart_with_model_and_response_format(self):
        env = {**LIVE, "GROQ_ASR_MODEL": "whisper-large-v3-turbo"}
        with patch.dict(os.environ, env), patch("apps.audio.services.requests.post") as post:
            post.return_value = groq_response({"text": "  bonjour le monde  "})
            transcript = transcribe_audio(_ReadableFile(MINIMAL_AUDIO, name="memo.wav"))

        self.assertEqual(transcript, "bonjour le monde")
        url = post.call_args.args[0]
        self.assertEqual(url, "https://api.groq.com/openai/v1/audio/transcriptions")
        self.assertEqual(post.call_args.kwargs["headers"]["Authorization"], "Bearer gsk_fake_key")
        self.assertEqual(sent_form(post)["model"], "whisper-large-v3-turbo")
        self.assertEqual(sent_form(post)["response_format"], "verbose_json")
        name, raw, mime = sent_file_part(post)
        self.assertEqual(name, "memo.wav")
        self.assertEqual(raw, MINIMAL_AUDIO)
        self.assertEqual(mime, "audio/wav")

    def test_webm_upload_is_sent_with_its_own_mime(self):
        with patch.dict(os.environ, LIVE), patch("apps.audio.services.requests.post") as post:
            post.return_value = groq_response({"text": "ok"})
            transcribe_audio(_ReadableFile(MINIMAL_AUDIO, name="memo.webm"))

        self.assertEqual(sent_file_part(post)[2], "audio/webm")

    def test_mp3_upload_is_sent_as_audio_mpeg(self):
        with patch.dict(os.environ, LIVE), patch("apps.audio.services.requests.post") as post:
            post.return_value = groq_response({"text": "ok"})
            transcribe_audio(_ReadableFile(MINIMAL_AUDIO, name="memo.mp3"))

        self.assertEqual(sent_file_part(post)[2], "audio/mpeg")

    def test_asr_model_is_configurable(self):
        with patch.dict(os.environ, {**LIVE, "GROQ_ASR_MODEL": "whisper-large-v3"}), patch(
            "apps.audio.services.requests.post"
        ) as post:
            post.return_value = groq_response({"text": "ok"})
            transcribe_audio(_ReadableFile(MINIMAL_AUDIO))

        self.assertEqual(sent_form(post)["model"], "whisper-large-v3")

    def test_empty_transcript_is_an_error(self):
        with patch.dict(os.environ, LIVE), patch("apps.audio.services.requests.post") as post:
            post.return_value = groq_response({"text": "   "})
            with self.assertRaises(AudioFormatError):
                transcribe_audio(_ReadableFile(MINIMAL_AUDIO))

    def test_empty_file_is_refused_before_upload(self):
        with patch.dict(os.environ, LIVE), patch("apps.audio.services.requests.post") as post:
            with self.assertRaises(AudioFormatError):
                transcribe_audio(_ReadableFile(b""))
        post.assert_not_called()

    def test_oversized_audio_is_refused_before_upload(self):
        big = _ReadableFile(b"x" * (MAX_AUDIO_BYTES + 1))
        with patch.dict(os.environ, LIVE), patch("apps.audio.services.requests.post") as post:
            with self.assertRaises(AudioFormatError) as ctx:
                transcribe_audio(big)
        post.assert_not_called()
        self.assertIn("25 MB", str(ctx.exception))


# ---------------------------------------------------------------- credentials


class CredentialsTests(TestCase):
    """A missing key must never be papered over with stub results."""

    def test_missing_key_raises(self):
        with patch.dict(os.environ, {**LIVE, "GROQ_API_KEY": ""}), self.assertRaises(AINotConfigured):
            transcribe_audio(_ReadableFile(MINIMAL_AUDIO))

    def test_blank_key_raises(self):
        with patch.dict(os.environ, {**LIVE, "GROQ_API_KEY": "   "}), self.assertRaises(AINotConfigured):
            analyse_sentiment("bonjour")

    def test_rejected_key_reports_authentication(self):
        with patch.dict(os.environ, LIVE), patch("apps.audio.services.requests.post") as post:
            post.return_value = groq_error("Invalid API Key", 401)
            with self.assertRaises(AINotConfigured) as ctx:
                analyse_sentiment("bonjour")

        self.assertIn("http 401", str(ctx.exception).lower())

    def test_forbidden_key_reports_authentication(self):
        with patch.dict(os.environ, LIVE), patch("apps.audio.services.requests.post") as post:
            post.return_value = groq_error("Insufficient permissions", 403)
            with self.assertRaises(AINotConfigured):
                transcribe_audio(_ReadableFile(MINIMAL_AUDIO))

    def test_rate_limit_raises_without_retrying_forever(self):
        with patch.dict(os.environ, LIVE), patch(
            "apps.audio.services.requests.post"
        ) as post, patch("apps.audio.services.time.sleep") as sleep:
            post.return_value = groq_error(
                "Rate limit reached for requests per day", 429, "rate_limit_exceeded"
            )
            with self.assertRaises(AIQuotaExceeded):
                transcribe_audio(_ReadableFile(MINIMAL_AUDIO))

        self.assertEqual(post.call_count, 2)
        self.assertEqual(sleep.call_count, 1)

    def test_rate_limit_message_keeps_the_retry_hint(self):
        with patch.dict(os.environ, LIVE), patch(
            "apps.audio.services.requests.post"
        ) as post, patch("apps.audio.services.time.sleep"):
            post.return_value = groq_error(
                "Rate limit reached", 429, "rate_limit_exceeded"
            )
            post.return_value.headers = {"retry-after": "30"}
            with self.assertRaises(AIQuotaExceeded) as ctx:
                transcribe_audio(_ReadableFile(MINIMAL_AUDIO))

        self.assertIn("30s", str(ctx.exception))

    def test_exhausted_billing_quota_is_not_a_stub(self):
        with patch.dict(os.environ, LIVE), patch(
            "apps.audio.services.requests.post"
        ) as post, patch("apps.audio.services.time.sleep"):
            post.return_value = groq_error("You exceeded your current quota", 429, "quota_exceeded")
            with self.assertRaises(AIQuotaExceeded):
                transcribe_audio(_ReadableFile(MINIMAL_AUDIO))

    def test_unknown_model_raises_model_unavailable(self):
        with patch.dict(os.environ, LIVE), patch("apps.audio.services.requests.post") as post:
            post.return_value = groq_error("model: 'whisper-3x' not found", 404, "model_not_found")
            with self.assertRaises(AIModelUnavailable):
                transcribe_audio(_ReadableFile(MINIMAL_AUDIO))

    def test_invalid_model_name_in_400_raises_model_unavailable(self):
        with patch.dict(os.environ, LIVE), patch("apps.audio.services.requests.post") as post:
            post.return_value = groq_error("The model `foo-bar` does not exist")
            with self.assertRaises(AIModelUnavailable):
                analyse_sentiment("bonjour")

    def test_bad_audio_raises_format_error(self):
        with patch.dict(os.environ, LIVE), patch("apps.audio.services.requests.post") as post:
            post.return_value = groq_error("File format not supported")
            with self.assertRaises(AudioFormatError) as ctx:
                transcribe_audio(_ReadableFile(MINIMAL_AUDIO))

        self.assertIn("refused the audio", str(ctx.exception))

    def test_unclassified_bad_request_raises_generic_error(self):
        with patch.dict(os.environ, LIVE), patch("apps.audio.services.requests.post") as post:
            post.return_value = groq_error("Something else entirely")
            with self.assertRaises(AudioAIError) as ctx:
                analyse_sentiment("bonjour")

        self.assertNotIsInstance(ctx.exception, (AudioFormatError, AIModelUnavailable))
        self.assertIn("http 400", str(ctx.exception).lower())

    def test_service_outage_is_retried_then_raised(self):
        with patch.dict(os.environ, LIVE), patch(
            "apps.audio.services.requests.post"
        ) as post, patch("apps.audio.services.time.sleep") as sleep:
            post.return_value = groq_error("Engine over capacity", 503, "server_error")
            with self.assertRaises(AIUnavailableError):
                transcribe_audio(_ReadableFile(MINIMAL_AUDIO))

        self.assertEqual(post.call_count, 2)
        sleep.assert_called_once()

    def test_service_recovery_after_outage_succeeds(self):
        with patch.dict(os.environ, LIVE), patch(
            "apps.audio.services.requests.post"
        ) as post, patch("apps.audio.services.time.sleep"):
            post.side_effect = [groq_error("Overloaded", 503), groq_response({"text": "recoveré"})]
            transcript = transcribe_audio(_ReadableFile(MINIMAL_AUDIO))

        self.assertEqual(transcript, "recoveré")

    def test_timeout_raises_timeout_error(self):
        with patch.dict(os.environ, LIVE), patch(
            "apps.audio.services.requests.post",
            side_effect=requests.exceptions.Timeout("too slow"),
        ):
            with self.assertRaises(AITimeoutError) as ctx:
                transcribe_audio(_ReadableFile(MINIMAL_AUDIO))

        self.assertIn("timed out", str(ctx.exception).lower())

    def test_network_error_raises_generic_service_error(self):
        with patch.dict(os.environ, LIVE), patch(
            "apps.audio.services.requests.post",
            side_effect=requests.exceptions.ConnectionError("down"),
        ):
            with self.assertRaises(AudioAIError):
                transcribe_audio(_ReadableFile(MINIMAL_AUDIO))

    def test_non_json_success_is_reported(self):
        with patch.dict(os.environ, LIVE), patch("apps.audio.services.requests.post") as post:
            post.return_value = groq_response({})
            post.return_value.json.side_effect = ValueError("no json")
            with self.assertRaises(AIUnexpectedOutput):
                transcribe_audio(_ReadableFile(MINIMAL_AUDIO))

    def test_error_messages_never_carry_the_api_key(self):
        """A key must not leak through the message stored on the entry."""
        with patch.dict(os.environ, {**LIVE, "GROQ_API_KEY": "gsk_secret_value"}), patch(
            "apps.audio.services.requests.post"
        ) as post:
            post.return_value = groq_error("Invalid API Key gsk_secret_value", 401)
            with self.assertRaises(AINotConfigured) as ctx:
                transcribe_audio(_ReadableFile(MINIMAL_AUDIO))

        self.assertNotIn("gsk_secret_value", str(ctx.exception))


# ---------------------------------------------------------------- language


class LanguageDetectionTests(TestCase):
    def test_mock_mode_returns_placeholder_language(self):
        with patch.dict(os.environ, {"GROQ_MOCK": "true"}):
            result = detect_language("bonjour")

        self.assertEqual(result["code"], "en")
        self.assertEqual(result["name"], "English")

    def test_empty_transcript_skips_the_model(self):
        with patch.dict(os.environ, LIVE), patch("apps.audio.services.requests.post") as post:
            result = detect_language("   ")

        self.assertIsNone(result["code"])
        post.assert_not_called()

    def test_asks_the_llm_for_structured_json(self):
        env = {**LIVE, "GROQ_LLM_MODEL": "openai/gpt-oss-20b"}
        with patch.dict(os.environ, env), patch("apps.audio.services.requests.post") as post:
            post.return_value = chat_response('{"language_code": "fr", "language_name": "French"}')
            result = detect_language("aujourd'hui il fait beau")

        self.assertEqual(result, {"code": "fr", "name": "French"})
        self.assertEqual(post.call_args.args[0], "https://api.groq.com/openai/v1/chat/completions")
        payload = json.loads(post.call_args.kwargs["data"])
        self.assertEqual(payload["model"], "openai/gpt-oss-20b")
        self.assertEqual(payload["response_format"], {"type": "json_object"})
        self.assertEqual(payload["messages"][1]["content"], "aujourd'hui il fait beau")

    def test_llm_model_is_configurable(self):
        with patch.dict(os.environ, {**LIVE, "GROQ_LLM_MODEL": "openai/gpt-oss-120b"}), patch(
            "apps.audio.services.requests.post"
        ) as post:
            post.return_value = chat_response('{"language_code": "fr"}')
            detect_language("bonjour")

        self.assertEqual(json.loads(post.call_args.kwargs["data"])["model"], "openai/gpt-oss-120b")

    def test_missing_language_name_is_derived_from_the_code(self):
        with patch.dict(os.environ, LIVE), patch("apps.audio.services.requests.post") as post:
            post.return_value = chat_response('{"language_code": "ES"}')
            result = detect_language("hola amigos")

        self.assertEqual(result, {"code": "es", "name": "Spanish"})

    def test_iso_639_2_answer_is_normalised(self):
        with patch.dict(os.environ, LIVE), patch("apps.audio.services.requests.post") as post:
            post.return_value = chat_response('{"language_code": "fra", "language_name": "French"}')
            result = detect_language("bonjour")

        self.assertEqual(result["code"], "fr")

    def test_fenced_json_is_salvaged(self):
        with patch.dict(os.environ, LIVE), patch("apps.audio.services.requests.post") as post:
            post.return_value = chat_response('```json\n{"language_code": "de"}\n```')
            result = detect_language("guten tag")

        self.assertEqual(result, {"code": "de", "name": "German"})

    def test_json_mode_rejection_falls_back_to_plain_text(self):
        """Groq 400s when a model cannot emit JSON; the prose retry must still parse."""
        rejected = groq_error("Failed to generate JSON. Please adjust your prompt.", 400)
        with patch.dict(os.environ, LIVE), patch("apps.audio.services.requests.post") as post:
            post.side_effect = [rejected, chat_response('Sure: {"language_code": "pt"}')]
            result = detect_language("bom dia tudo bem")

        self.assertEqual(result["code"], "pt")
        self.assertEqual(post.call_count, 2)
        first = json.loads(post.call_args_list[0].kwargs["data"])
        second = json.loads(post.call_args_list[1].kwargs["data"])
        self.assertIn("response_format", first)
        self.assertNotIn("response_format", second)

    def test_unusable_language_code_is_reported_as_failure(self):
        with patch.dict(os.environ, LIVE), patch("apps.audio.services.requests.post") as post:
            post.return_value = chat_response('{"language_code": ""}')
            with self.assertRaises(AIUnexpectedOutput):
                detect_language("bonjour")

    def test_plain_prose_answer_is_reported_as_failure(self):
        with patch.dict(os.environ, LIVE), patch("apps.audio.services.requests.post") as post:
            post.return_value = chat_response("I think this is French.")
            with self.assertRaises(AIUnexpectedOutput):
                detect_language("bonjour")

    def test_json_array_is_reported_as_failure(self):
        with patch.dict(os.environ, LIVE), patch("apps.audio.services.requests.post") as post:
            post.return_value = chat_response('["fr"]')
            with self.assertRaises(AIUnexpectedOutput):
                detect_language("bonjour")

    def test_completion_without_content_is_reported(self):
        with patch.dict(os.environ, LIVE), patch("apps.audio.services.requests.post") as post:
            post.return_value = groq_response({"choices": [{}]})
            with self.assertRaises(AIUnexpectedOutput):
                detect_language("bonjour")

    def test_completion_without_choices_is_reported(self):
        with patch.dict(os.environ, LIVE), patch("apps.audio.services.requests.post") as post:
            post.return_value = groq_response({"choices": []})
            with self.assertRaises(AIUnexpectedOutput):
                detect_language("bonjour")

    def test_long_transcript_is_truncated_for_the_llm(self):
        env = {**LIVE}
        with patch.dict(os.environ, env), patch("apps.audio.services.requests.post") as post:
            post.return_value = chat_response('{"language_code": "fr"}')
            detect_language("mot " * 4000)

        sent = json.loads(post.call_args.kwargs["data"])["messages"][1]["content"]
        self.assertLessEqual(len(sent), 6000)

    def test_normalize_language_code(self):
        cases = {
            "fr": "fr",
            "FR": "fr",
            "LABEL_FR": "fr",
            "lang-ar": "ar",
            "it-Crowd": "it",
            "french": "fr",
            "fra": "fr",
            "eng": "en",
            "": None,
            "waytoolong": None,
        }
        for raw, expected in cases.items():
            with self.subTest(raw=raw):
                self.assertEqual(_normalize_language_code(raw), expected)


# ---------------------------------------------------------------- sentiment


class SentimentServiceTests(TestCase):
    def test_empty_text_is_neutral_without_api_call(self):
        with patch("apps.audio.services.requests.post") as post:
            result = analyse_sentiment("   ")

        self.assertEqual(result["label"], "neutral")
        post.assert_not_called()

    def test_mock_mode_returns_stub(self):
        with patch.dict(os.environ, {"GROQ_MOCK": "true"}):
            result = analyse_sentiment("some transcript text")

        self.assertEqual(result["label"], "neutral")
        self.assertTrue(result["mock"])

    def test_returns_structured_label_and_confidence(self):
        with patch.dict(os.environ, LIVE), patch("apps.audio.services.requests.post") as post:
            post.return_value = chat_response('{"sentiment": "Positive", "confidence": 0.88}')
            result = analyse_sentiment("je suis très heureux aujourd'hui")

        self.assertEqual(result, {"label": "positive", "score": 0.88})
        payload = json.loads(post.call_args.kwargs["data"])
        self.assertEqual(payload["messages"][1]["content"], "je suis très heureux aujourd'hui")
        self.assertEqual(payload["response_format"], {"type": "json_object"})

    def test_negative_label_is_kept(self):
        with patch.dict(os.environ, LIVE), patch("apps.audio.services.requests.post") as post:
            post.return_value = chat_response('{"sentiment": "negative", "confidence": 0.95}')
            result = analyse_sentiment("j'ai eu une journée terrible")

        self.assertEqual(result, {"label": "negative", "score": 0.95})

    def test_weak_signal_is_downgraded_to_neutral(self):
        with patch.dict(os.environ, LIVE), patch("apps.audio.services.requests.post") as post:
            post.return_value = chat_response('{"sentiment": "positive", "confidence": 0.31}')
            result = analyse_sentiment("bof")

        self.assertEqual(result["label"], "neutral")

    def test_confidence_is_clamped(self):
        for raw, expected in ((1.7, 1.0), (-2, 0.0), ("0.6", 0.6), (None, 0.0), ("abc", 0.0)):
            with self.subTest(raw=raw), patch.dict(os.environ, LIVE), patch(
                "apps.audio.services.requests.post"
            ) as post:
                post.return_value = chat_response(
                    json.dumps({"sentiment": "positive", "confidence": raw})
                )
                result = analyse_sentiment("un texte un peu long")

                self.assertEqual(result["score"], expected)

    def test_unknown_label_is_reported_as_failure(self):
        with patch.dict(os.environ, LIVE), patch("apps.audio.services.requests.post") as post:
            post.return_value = chat_response('{"sentiment": "joyful", "confidence": 0.9}')
            with self.assertRaises(AIUnexpectedOutput) as ctx:
                analyse_sentiment("quelque chose")

        self.assertIn("unknown label", str(ctx.exception))

    def test_missing_sentiment_key_is_reported_as_failure(self):
        with patch.dict(os.environ, LIVE), patch("apps.audio.services.requests.post") as post:
            post.return_value = chat_response('{"confidence": 0.9}')
            with self.assertRaises(AIUnexpectedOutput):
                analyse_sentiment("quelque chose")


# ---------------------------------------------------------------- summary


class SummaryServiceTests(TestCase):
    def test_short_text_is_not_summarised(self):
        with patch.dict(os.environ, LIVE), patch("apps.audio.services.requests.post") as post:
            self.assertEqual(summarise_text("too short"), "")
        post.assert_not_called()

    def test_mock_mode_summarises_long_text(self):
        with patch.dict(os.environ, {"GROQ_MOCK": "true"}):
            summary = summarise_text("word " * 40)

        self.assertTrue(summary.startswith("[Mock summary]"))

    def test_returns_the_completion_text(self):
        long_text = "aujourd'hui j'ai visité le marché avec ma famille et c'était super " * 3
        with patch.dict(os.environ, LIVE), patch("apps.audio.services.requests.post") as post:
            post.return_value = chat_response(" Un résumé. ")
            summary = summarise_text(long_text)

        self.assertEqual(summary, "Un résumé.")
        payload = json.loads(post.call_args.kwargs["data"])
        self.assertNotIn("response_format", payload)
        self.assertIn("40 words", payload["messages"][0]["content"])

    def test_empty_completion_is_reported_as_failure(self):
        long_text = "aujourd'hui j'ai visité le marché avec ma famille et c'était super " * 3
        with patch.dict(os.environ, LIVE), patch("apps.audio.services.requests.post") as post:
            post.return_value = chat_response("   ")
            with self.assertRaises(AIUnexpectedOutput):
                summarise_text(long_text)


# ===========================================================================
# 3. Orchestrator
# ===========================================================================


@override_settings(MEDIA_ROOT=tempfile.mkdtemp(prefix="memora_audio_orch_"))
class ProcessAudioEntryTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="orchestrator", password="Str0ng-Pass!23"
        )

    def _make_entry(self):
        return AudioEntry.objects.create(
            owner=self.user, file=audio_file(), status=AudioEntry.Status.PENDING
        )

    def test_success_path_persists_every_ai_result(self):
        entry = self._make_entry()

        with patch("apps.audio.services.transcribe_audio", return_value="bonjour tout le monde"), \
             patch("apps.audio.services.detect_language", return_value={"code": "fr", "name": "French"}), \
             patch("apps.audio.services.analyse_sentiment", return_value={"label": "positive", "score": 0.77}), \
             patch("apps.audio.services.summarise_text", return_value="Résumé."):
            process_audio_entry(entry)

        entry.refresh_from_db()
        self.assertEqual(entry.status, AudioEntry.Status.SUCCEEDED)
        self.assertEqual(entry.transcript, "bonjour tout le monde")
        self.assertEqual(entry.language_code, "fr")
        self.assertEqual(entry.language_name, "French")
        self.assertEqual(entry.sentiment, "positive")
        self.assertEqual(entry.sentiment_score, 0.77)
        self.assertEqual(entry.summary, "Résumé.")
        self.assertIsNone(entry.error)

    def test_language_failure_keeps_the_other_results(self):
        entry = self._make_entry()

        with patch("apps.audio.services.transcribe_audio", return_value="hello there friend"), \
             patch("apps.audio.services.detect_language", side_effect=AudioAIError("lid down")), \
             patch("apps.audio.services.analyse_sentiment", return_value={"label": "neutral", "score": 0.5}), \
             patch("apps.audio.services.summarise_text", return_value=""):
            process_audio_entry(entry)

        entry.refresh_from_db()
        self.assertEqual(entry.status, AudioEntry.Status.SUCCEEDED)
        self.assertEqual(entry.transcript, "hello there friend")
        self.assertIsNone(entry.language_code)

    def test_summary_failure_keeps_the_transcript(self):
        entry = self._make_entry()

        with patch("apps.audio.services.transcribe_audio", return_value="bonjour"), \
             patch("apps.audio.services.detect_language", return_value={"code": "fr", "name": "French"}), \
             patch("apps.audio.services.analyse_sentiment", return_value={"label": "neutral", "score": 0.5}), \
             patch("apps.audio.services.summarise_text", side_effect=AIUnexpectedOutput("nope")):
            process_audio_entry(entry)

        entry.refresh_from_db()
        self.assertEqual(entry.status, AudioEntry.Status.SUCCEEDED)
        self.assertIsNone(entry.summary)

    def test_missing_key_marks_entry_failed_with_actionable_error(self):
        entry = self._make_entry()

        with patch.dict(os.environ, {**LIVE, "GROQ_API_KEY": ""}):
            process_audio_entry(entry)

        entry.refresh_from_db()
        self.assertEqual(entry.status, AudioEntry.Status.FAILED)
        self.assertIn("GROQ_API_KEY", entry.error)
        self.assertIsNone(entry.transcript)

    def test_rate_limit_gives_actionable_message(self):
        entry = self._make_entry()

        with patch(
            "apps.audio.services.transcribe_audio",
            side_effect=AIQuotaExceeded("rate limit reached"),
        ):
            process_audio_entry(entry)

        entry.refresh_from_db()
        self.assertEqual(entry.status, AudioEntry.Status.FAILED)
        self.assertIn("quota", entry.error.lower())
        self.assertNotIn("gsk_", entry.error)

    def test_unavailable_model_message_names_the_settings(self):
        entry = self._make_entry()

        with patch(
            "apps.audio.services.transcribe_audio",
            side_effect=AIModelUnavailable("model not found"),
        ):
            process_audio_entry(entry)

        entry.refresh_from_db()
        self.assertIn("GROQ_ASR_MODEL", entry.error)
        self.assertIn("GROQ_LLM_MODEL", entry.error)

    def test_bad_audio_message_mentions_supported_formats(self):
        entry = self._make_entry()

        with patch(
            "apps.audio.services.transcribe_audio",
            side_effect=AudioFormatError("format refused"),
        ):
            process_audio_entry(entry)

        entry.refresh_from_db()
        self.assertIn("MP3/WAV/WebM", entry.error)

    def test_timeout_message_asks_to_retry(self):
        entry = self._make_entry()

        with patch(
            "apps.audio.services.transcribe_audio",
            side_effect=AITimeoutError("timeout"),
        ):
            process_audio_entry(entry)

        entry.refresh_from_db()
        self.assertIn("took too long", entry.error)

    def test_outage_message_is_generic(self):
        entry = self._make_entry()

        with patch(
            "apps.audio.services.transcribe_audio",
            side_effect=AIUnavailableError("503"),
        ):
            process_audio_entry(entry)

        entry.refresh_from_db()
        self.assertIn("temporarily unavailable", entry.error)

    def test_unexpected_error_marks_entry_failed(self):
        entry = self._make_entry()

        with patch(
            "apps.audio.services.transcribe_audio",
            side_effect=ValueError("bug"),
        ):
            process_audio_entry(entry)

        entry.refresh_from_db()
        self.assertEqual(entry.status, AudioEntry.Status.FAILED)
        self.assertEqual(entry.error, "An unexpected error occurred.")

    def test_mock_end_to_end_is_flagged_as_mock(self):
        """Offline demo mode must stay visibly a mock, never a silent fake."""
        entry = self._make_entry()

        with patch.dict(os.environ, {"GROQ_MOCK": "true"}), \
             patch("apps.audio.services.detect_language", return_value={"code": "en", "name": "English"}):
            process_audio_entry(entry)

        entry.refresh_from_db()
        self.assertEqual(entry.status, AudioEntry.Status.SUCCEEDED)
        self.assertTrue(entry.transcript.startswith("[Mock]"))

    def test_unreadable_duration_does_not_break_the_pipeline(self):
        """The stub file has no real audio header; mutagen must just be skipped."""
        entry = self._make_entry()

        with patch("apps.audio.services.transcribe_audio", return_value="bonjour"), \
             patch("apps.audio.services.detect_language", return_value={"code": "fr", "name": "French"}), \
             patch("apps.audio.services.analyse_sentiment", return_value={"label": "neutral", "score": 0.5}), \
             patch("apps.audio.services.summarise_text", return_value=""):
            process_audio_entry(entry)

        entry.refresh_from_db()
        self.assertEqual(entry.status, AudioEntry.Status.SUCCEEDED)
        self.assertTrue(entry.duration_seconds is None or entry.duration_seconds >= 0)


class ProcessEntryByPkTests(TestCase):
    """The background worker reached by the upload thread."""

    def setUp(self):
        self.user = User.objects.create_user(username="worker", password="Str0ng-Pass!23")

    def test_processes_a_pending_entry(self):
        entry = AudioEntry.objects.create(
            owner=self.user, file=audio_file(), status=AudioEntry.Status.PENDING
        )
        with patch("apps.audio.views.process_audio_entry") as process:
            process_entry_by_pk(entry.pk)

        process.assert_called_once()
        self.assertEqual(process.call_args.args[0].pk, entry.pk)

    def test_skips_entry_already_finished(self):
        entry = AudioEntry.objects.create(
            owner=self.user, file=audio_file(), status=AudioEntry.Status.SUCCEEDED
        )
        with patch("apps.audio.views.process_audio_entry") as process:
            process_entry_by_pk(entry.pk)

        process.assert_not_called()

    def test_missing_entry_is_ignored(self):
        with patch("apps.audio.views.process_audio_entry") as process:
            process_entry_by_pk(999999)

        process.assert_not_called()


# ===========================================================================
# 4. API views
# ===========================================================================


@override_settings(MEDIA_ROOT=tempfile.mkdtemp(prefix="memora_audio_views_"))
class AudioViewTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="marlem", password="Str0ng-Pass!23")
        self.other = User.objects.create_user(username="someone", password="Str0ng-Pass!23")

    def _list_url(self):
        return reverse("audio-list-create")

    def _detail_url(self, pk):
        return reverse("audio-detail", args=[pk])

    def _create_entry(self, owner, file_obj=None, **fields):
        defaults = {
            "status": AudioEntry.Status.SUCCEEDED,
            "transcript": "hello",
            "language_code": "en",
            "language_name": "English",
            "sentiment": "neutral",
        }
        defaults.update(fields)
        return AudioEntry.objects.create(owner=owner, file=file_obj or audio_file(), **defaults)

    # ---------------------------------------------------------------- auth

    def test_unauthenticated_list_is_rejected(self):
        response = self.client.get(self._list_url())

        # SessionAuthentication answers 403 (missing CSRF) rather than 401.
        self.assertIn(response.status_code, (401, 403))

    def test_unauthenticated_upload_is_rejected(self):
        response = self.client.post(
            self._list_url(), {"file": audio_file()}, format="multipart"
        )

        self.assertIn(response.status_code, (401, 403))

    # -------------------------------------------------------------- upload

    def test_upload_returns_pending_and_hands_off_to_processing(self):
        self.client.force_authenticate(user=self.user)

        with patch("apps.audio.views.start_processing") as start:
            response = self.client.post(
                self._list_url(), {"file": audio_file()}, format="multipart"
            )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["status"], AudioEntry.Status.PENDING)
        self.assertIsNone(response.data["transcript"])
        entry = AudioEntry.objects.get(pk=response.data["id"])
        self.assertEqual(entry.owner, self.user)
        # The handoff must target exactly the row that was just created.
        start.assert_called_once_with(entry.pk)

    def test_start_processing_reaches_the_service_layer(self):
        entry = AudioEntry.objects.create(
            owner=self.user, file=audio_file(), status=AudioEntry.Status.PENDING
        )
        done = threading.Event()
        with patch(
            "apps.audio.views.process_entry_by_pk",
            side_effect=lambda pk: done.set(),
        ) as worker:
            start_processing(entry.pk)
            self.assertTrue(done.wait(5), "background worker did not run")
            worker.assert_called_once_with(entry.pk)

    def test_upload_rejects_invalid_file(self):
        self.client.force_authenticate(user=self.user)

        with patch("apps.audio.views.start_processing") as start:
            response = self.client.post(
                self._list_url(),
                {"file": audio_file(name="x.txt", content_type="text/plain")},
                format="multipart",
            )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(AudioEntry.objects.count(), 0)
        start.assert_not_called()

    # --------------------------------------------------------------- list

    def test_list_only_returns_own_entries(self):
        own = self._create_entry(self.user)
        foreign = self._create_entry(self.other)
        self.client.force_authenticate(user=self.user)

        response = self.client.get(self._list_url())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [item["id"] for item in response.data]
        self.assertEqual(ids, [own.pk])
        self.assertNotIn(foreign.pk, ids)

    # --------------------------------------------------------------- update

    def test_owner_can_correct_the_transcript(self):
        entry = self._create_entry(self.user, transcript="mauvaise transcription")
        self.client.force_authenticate(user=self.user)

        response = self.client.patch(
            self._detail_url(entry.pk), {"transcript": "bonne transcription"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["transcript"], "bonne transcription")
        entry.refresh_from_db()
        self.assertEqual(entry.transcript, "bonne transcription")

    def test_owner_can_correct_the_summary(self):
        entry = self._create_entry(self.user, summary="Résumé bancal")
        self.client.force_authenticate(user=self.user)

        response = self.client.patch(
            self._detail_url(entry.pk), {"summary": "Résumé corrigé"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        entry.refresh_from_db()
        self.assertEqual(entry.summary, "Résumé corrigé")
        self.assertEqual(entry.transcript, "hello")  # untouched

    def test_update_cannot_touch_ai_or_state_fields(self):
        """Status, sentiment and ownership are derived, never user-writable."""
        entry = self._create_entry(self.user, status=AudioEntry.Status.SUCCEEDED)
        self.client.force_authenticate(user=self.user)

        response = self.client.patch(
            self._detail_url(entry.pk),
            {
                "transcript": "edited",
                "status": AudioEntry.Status.FAILED,
                "sentiment": "negative",
                "owner": self.other.pk,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        entry.refresh_from_db()
        self.assertEqual(entry.transcript, "edited")
        self.assertEqual(entry.status, AudioEntry.Status.SUCCEEDED)
        self.assertEqual(entry.sentiment, "neutral")
        self.assertEqual(entry.owner, self.user)

    def test_transcript_may_be_cleared(self):
        entry = self._create_entry(self.user)
        self.client.force_authenticate(user=self.user)

        response = self.client.patch(self._detail_url(entry.pk), {"transcript": ""}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        entry.refresh_from_db()
        self.assertEqual(entry.transcript, "")

    def test_empty_update_payload_is_rejected(self):
        entry = self._create_entry(self.user)
        self.client.force_authenticate(user=self.user)

        response = self.client.patch(self._detail_url(entry.pk), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("transcript", str(response.data))

    def test_update_is_refused_while_the_ai_is_running(self):
        """Saving now would be overwritten when the worker finishes."""
        entry = self._create_entry(self.user, status=AudioEntry.Status.PROCESSING, transcript=None)
        self.client.force_authenticate(user=self.user)

        response = self.client.patch(
            self._detail_url(entry.pk), {"transcript": "trop tôt"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        entry.refresh_from_db()
        self.assertIsNone(entry.transcript)

    def test_failed_entry_can_be_edited_by_hand(self):
        entry = self._create_entry(
            self.user, status=AudioEntry.Status.FAILED, transcript=None, error="boom"
        )
        self.client.force_authenticate(user=self.user)

        response = self.client.patch(
            self._detail_url(entry.pk), {"transcript": "je l'écris moi-même"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        entry.refresh_from_db()
        self.assertEqual(entry.transcript, "je l'écris moi-même")

    # ----------------------------------------------------- audio replacement

    def test_owner_can_replace_the_audio_and_restart_the_ai(self):
        """A new recording invalidates every result derived from the old one."""
        entry = self._create_entry(self.user)
        self.client.force_authenticate(user=self.user)

        with patch("apps.audio.views.start_processing") as start:
            # Same filename on purpose: storage must pick a free path so the
            # old file can be deleted without taking the new one with it.
            response = self.client.patch(
                self._detail_url(entry.pk), {"file": audio_file()}, format="multipart"
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], AudioEntry.Status.PENDING)
        entry.refresh_from_db()
        self.assertIsNone(entry.transcript)
        self.assertIsNone(entry.language_code)
        self.assertIsNone(entry.language_name)
        self.assertIsNone(entry.sentiment)
        self.assertIsNone(entry.sentiment_score)
        self.assertIsNone(entry.summary)
        self.assertIsNone(entry.duration_seconds)
        self.assertIsNone(entry.error)
        self.assertEqual(entry.owner, self.user)
        start.assert_called_once_with(entry.pk)

    def test_replacement_removes_the_old_file_from_storage(self):
        entry = self._create_entry(self.user)
        previous_name = entry.file.name
        self.client.force_authenticate(user=self.user)

        with patch("apps.audio.views.start_processing"):
            self.client.patch(
                self._detail_url(entry.pk), {"file": audio_file()}, format="multipart"
            )

        entry.refresh_from_db()
        self.assertNotEqual(entry.file.name, previous_name)
        self.assertFalse(default_storage.exists(previous_name))
        self.assertTrue(default_storage.exists(entry.file.name))

    def test_replacement_rejects_an_unsupported_file(self):
        entry = self._create_entry(self.user)
        previous_name = entry.file.name
        self.client.force_authenticate(user=self.user)

        with patch("apps.audio.views.start_processing") as start:
            response = self.client.patch(
                self._detail_url(entry.pk),
                {"file": audio_file(name="notes.txt", content_type="text/plain")},
                format="multipart",
            )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("file", response.data)
        start.assert_not_called()
        entry.refresh_from_db()
        self.assertEqual(entry.file.name, previous_name)
        self.assertEqual(entry.transcript, "hello")

    def test_a_stored_path_is_not_an_audio_replacement(self):
        """Only a real upload may change the file, never a path to another user's."""
        victim = self._create_entry(self.other)
        entry = self._create_entry(self.user)
        self.client.force_authenticate(user=self.user)

        with patch("apps.audio.views.start_processing") as start:
            response = self.client.patch(
                self._detail_url(entry.pk), {"file": victim.file.name}, format="json"
            )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        start.assert_not_called()
        entry.refresh_from_db()
        self.assertNotEqual(entry.file.name, victim.file.name)
        self.assertEqual(entry.status, AudioEntry.Status.SUCCEEDED)

    def test_file_and_text_corrections_cannot_be_mixed(self):
        """Whichever order the server applied, one of the two would be lost."""
        entry = self._create_entry(self.user)
        self.client.force_authenticate(user=self.user)

        with patch("apps.audio.views.start_processing") as start:
            response = self.client.patch(
                self._detail_url(entry.pk),
                {"file": audio_file(), "transcript": "corriger en même temps"},
                format="multipart",
            )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        start.assert_not_called()
        entry.refresh_from_db()
        self.assertEqual(entry.status, AudioEntry.Status.SUCCEEDED)
        self.assertEqual(entry.transcript, "hello")

    def test_replacement_is_refused_while_the_ai_is_running(self):
        entry = self._create_entry(self.user, status=AudioEntry.Status.PROCESSING)
        self.client.force_authenticate(user=self.user)

        with patch("apps.audio.views.start_processing") as start:
            response = self.client.patch(
                self._detail_url(entry.pk), {"file": audio_file()}, format="multipart"
            )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        start.assert_not_called()

    def test_failed_memo_can_be_replaced_by_a_new_recording(self):
        entry = self._create_entry(
            self.user, status=AudioEntry.Status.FAILED, error="Groq is unavailable."
        )
        self.client.force_authenticate(user=self.user)

        with patch("apps.audio.views.start_processing") as start:
            response = self.client.patch(
                self._detail_url(entry.pk), {"file": audio_file()}, format="multipart"
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        entry.refresh_from_db()
        self.assertEqual(entry.status, AudioEntry.Status.PENDING)
        self.assertIsNone(entry.error)
        start.assert_called_once_with(entry.pk)

    def test_replacement_hides_foreign_entry(self):
        entry = self._create_entry(self.other)
        previous_name = entry.file.name
        self.client.force_authenticate(user=self.user)

        with patch("apps.audio.views.start_processing") as start:
            response = self.client.patch(
                self._detail_url(entry.pk), {"file": audio_file()}, format="multipart"
            )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        start.assert_not_called()
        entry.refresh_from_db()
        self.assertEqual(entry.file.name, previous_name)
        self.assertTrue(default_storage.exists(previous_name))

    def test_unauthenticated_replacement_is_rejected(self):
        entry = self._create_entry(self.user)

        with patch("apps.audio.views.start_processing") as start:
            response = self.client.patch(
                self._detail_url(entry.pk), {"file": audio_file()}, format="multipart"
            )

        self.assertIn(response.status_code, (401, 403))
        start.assert_not_called()
        entry.refresh_from_db()
        self.assertEqual(entry.status, AudioEntry.Status.SUCCEEDED)

    def test_update_hides_foreign_entry(self):
        entry = self._create_entry(self.other)
        self.client.force_authenticate(user=self.user)

        response = self.client.patch(
            self._detail_url(entry.pk), {"transcript": "intrus"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        entry.refresh_from_db()
        self.assertEqual(entry.transcript, "hello")

    def test_unauthenticated_update_is_rejected(self):
        entry = self._create_entry(self.user)

        response = self.client.patch(
            self._detail_url(entry.pk), {"transcript": "anon"}, format="json"
        )

        self.assertIn(response.status_code, (401, 403))
        entry.refresh_from_db()
        self.assertEqual(entry.transcript, "hello")

    # --------------------------------------------------- detail / delete

    def test_detail_allows_owner(self):
        entry = self._create_entry(self.user)
        self.client.force_authenticate(user=self.user)

        response = self.client.get(self._detail_url(entry.pk))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], entry.pk)

    def test_detail_is_the_polling_source_for_ai_results(self):
        entry = self._create_entry(self.user, status=AudioEntry.Status.PROCESSING)
        entry.transcript = "bonjour"
        entry.language_code = "fr"
        entry.language_name = "French"
        entry.sentiment = "positive"
        entry.sentiment_score = 0.91
        entry.summary = "Une note joyeuse."
        entry.status = AudioEntry.Status.SUCCEEDED
        entry.save()
        self.client.force_authenticate(user=self.user)

        response = self.client.get(self._detail_url(entry.pk))

        for field in ("transcript", "language_code", "language_name", "sentiment", "summary", "status"):
            self.assertIn(field, response.data)
        self.assertEqual(response.data["language_name"], "French")
        self.assertEqual(response.data["summary"], "Une note joyeuse.")

    def test_detail_hides_foreign_entry(self):
        entry = self._create_entry(self.other)
        self.client.force_authenticate(user=self.user)

        response = self.client.get(self._detail_url(entry.pk))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_delete_removes_entry_and_file_for_owner(self):
        entry = self._create_entry(self.user)
        file_path = entry.file.path
        self.assertTrue(os.path.exists(file_path))
        self.client.force_authenticate(user=self.user)

        response = self.client.delete(self._detail_url(entry.pk))

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(AudioEntry.objects.filter(pk=entry.pk).exists())
        self.assertFalse(os.path.exists(file_path))

    def test_delete_rejected_for_non_owner(self):
        entry = self._create_entry(self.other)
        self.client.force_authenticate(user=self.user)

        response = self.client.delete(self._detail_url(entry.pk))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(AudioEntry.objects.filter(pk=entry.pk).exists())

    # ------------------------------------------------------------ payload

    def test_response_uses_absolute_file_url_and_no_owner_field(self):
        self.client.force_authenticate(user=self.user)

        with patch("apps.audio.views.start_processing"):
            response = self.client.post(
                self._list_url(), {"file": audio_file()}, format="multipart"
            )

        self.assertIn("http", response.data["file"])
        self.assertNotIn("owner", response.data)

    def test_failed_entry_exposes_safe_error_message(self):
        entry = self._create_entry(
            self.user,
            status=AudioEntry.Status.FAILED,
            error="AI service not configured. Set GROQ_API_KEY in the server environment.",
            transcript=None,
        )
        self.client.force_authenticate(user=self.user)

        response = self.client.get(self._detail_url(entry.pk))

        self.assertEqual(response.data["status"], "failed")
        self.assertIn("GROQ_API_KEY", response.data["error"])

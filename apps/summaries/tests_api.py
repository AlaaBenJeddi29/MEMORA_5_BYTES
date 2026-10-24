"""API tests for the summaries app.

Gemini is mocked in every generation test. The real service behavior is
covered separately in ``tests.py``.
"""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .mock_journal_entries import get_mock_journal_entry
from .models import Summary
from .services import (
    SummaryConfigurationError,
    SummaryInputError,
    SummaryProviderError,
    SummaryRateLimitError,
    SummaryResponseError,
)

User = get_user_model()

ENTRY_ID = 900001
GENERATED_RESULT = {
    "summary_text": "A calm morning walk before breakfast.",
    "mood": "calm",
    "themes": ["nature", "routine"],
    "illustration_prompt": "A quiet park at sunrise.",
}


class SummaryAPITestCase(APITestCase):
    def setUp(self):
        self.alice = User.objects.create_user(
            username="alice", password="S3cure-Passw0rd!"
        )
        self.bob = User.objects.create_user(
            username="bob", password="S3cure-Passw0rd!"
        )
        self.client.force_login(self.alice)

    def make_summary(self, owner=None, **overrides):
        data = {
            "owner": owner or self.alice,
            "journal_entry_id": ENTRY_ID,
            "summary_text": "A calm morning walk.",
            "mood": "calm",
            "themes": ["nature", "routine"],
            "illustration_prompt": "A quiet park at sunrise.",
        }
        data.update(overrides)
        return Summary.objects.create(**data)

    def manual_payload(self, **overrides):
        payload = {
            "journal_entry_id": ENTRY_ID,
            "summary_text": "A calm morning walk.",
            "mood": "calm",
            "themes": ["nature", "routine"],
            "illustration_prompt": "A quiet park at sunrise.",
        }
        payload.update(overrides)
        return payload


class SummaryListTests(SummaryAPITestCase):
    def test_list_requires_authentication(self):
        self.client.logout()

        response = self.client.get(reverse("summaries-list"))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_list_returns_only_the_callers_summaries(self):
        alice_summary = self.make_summary()
        self.make_summary(owner=self.bob)

        response = self.client.get(reverse("summaries-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [item["id"] for item in response.data],
            [alice_summary.id],
        )

    def test_manual_create_forces_owner_from_request_user(self):
        response = self.client.post(
            reverse("summaries-list"),
            self.manual_payload(owner=self.bob.id),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        summary = Summary.objects.get(pk=response.data["id"])
        self.assertEqual(summary.owner, self.alice)
        self.assertEqual(response.data["owner"], self.alice.id)

    def test_manual_create_defaults_optional_fields(self):
        response = self.client.post(
            reverse("summaries-list"),
            {"summary_text": "A short note."},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(response.data["journal_entry_id"])
        self.assertEqual(response.data["mood"], "")
        self.assertEqual(response.data["themes"], [])
        self.assertEqual(response.data["illustration_prompt"], "")

    def test_manual_create_rejects_invalid_fields(self):
        invalid_payloads = [
            {"summary_text": ""},
            {"summary_text": "   "},
            {"summary_text": "Text", "themes": "nature"},
            {"summary_text": "Text", "themes": ["ok", 3]},
            {"summary_text": "Text", "themes": ["x" * 65]},
            {"summary_text": "Text", "themes": [f"t{index}" for index in range(9)]},
            {"summary_text": "Text", "mood": "x" * 33},
            {"summary_text": "Text", "journal_entry_id": 0},
            {"summary_text": "Text", "illustration_prompt": "x" * 1_001},
        ]

        for payload in invalid_payloads:
            with self.subTest(payload=payload):
                response = self.client.post(
                    reverse("summaries-list"),
                    payload,
                    format="json",
                )
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_manual_create_requires_authentication(self):
        self.client.logout()

        response = self.client.post(
            reverse("summaries-list"),
            self.manual_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @patch("apps.summaries.views.generate_summary")
    def test_manual_create_does_not_call_gemini(self, generate_summary):
        response = self.client.post(
            reverse("summaries-list"),
            self.manual_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        generate_summary.assert_not_called()


class SummaryDetailTests(SummaryAPITestCase):
    def test_retrieve_own_summary(self):
        summary = self.make_summary()

        response = self.client.get(
            reverse("summaries-detail", args=[summary.id])
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], summary.id)

    def test_retrieve_other_users_summary_returns_404(self):
        summary = self.make_summary(owner=self.bob)

        response = self.client.get(
            reverse("summaries-detail", args=[summary.id])
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_detail_requires_authentication(self):
        summary = self.make_summary()
        self.client.logout()

        response = self.client.get(
            reverse("summaries-detail", args=[summary.id])
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_patch_updates_editable_fields(self):
        summary = self.make_summary()

        response = self.client.patch(
            reverse("summaries-detail", args=[summary.id]),
            {"mood": "grateful", "themes": ["family"]},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        summary.refresh_from_db()
        self.assertEqual(summary.mood, "grateful")
        self.assertEqual(summary.themes, ["family"])
        self.assertEqual(summary.owner, self.alice)

    def test_put_requires_summary_text(self):
        summary = self.make_summary()

        response = self.client.put(
            reverse("summaries-detail", args=[summary.id]),
            {"mood": "calm"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("summary_text", response.data)

    def test_patch_cannot_change_owner(self):
        summary = self.make_summary()

        response = self.client.patch(
            reverse("summaries-detail", args=[summary.id]),
            {"owner": self.bob.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        summary.refresh_from_db()
        self.assertEqual(summary.owner, self.alice)

    def test_update_other_users_summary_returns_404(self):
        summary = self.make_summary(owner=self.bob)

        response = self.client.patch(
            reverse("summaries-detail", args=[summary.id]),
            {"mood": "changed"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        summary.refresh_from_db()
        self.assertEqual(summary.mood, "calm")

    def test_delete_own_summary(self):
        summary = self.make_summary()

        response = self.client.delete(
            reverse("summaries-detail", args=[summary.id])
        )

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Summary.objects.filter(pk=summary.id).exists())

    def test_delete_other_users_summary_returns_404(self):
        summary = self.make_summary(owner=self.bob)

        response = self.client.delete(
            reverse("summaries-detail", args=[summary.id])
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(Summary.objects.filter(pk=summary.id).exists())

    def test_delete_requires_authentication(self):
        summary = self.make_summary()
        self.client.logout()

        response = self.client.delete(
            reverse("summaries-detail", args=[summary.id])
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @patch("apps.summaries.views.generate_summary")
    def test_edit_and_delete_never_call_gemini(self, generate_summary):
        summary = self.make_summary()
        detail_url = reverse("summaries-detail", args=[summary.id])

        patch_response = self.client.patch(
            detail_url,
            {"mood": "grateful"},
            format="json",
        )
        delete_response = self.client.delete(detail_url)

        self.assertEqual(patch_response.status_code, status.HTTP_200_OK)
        self.assertEqual(delete_response.status_code, status.HTTP_204_NO_CONTENT)
        generate_summary.assert_not_called()


class MockJournalEntryEndpointTests(SummaryAPITestCase):
    """The temporary picker endpoint must stay read-only and content-free."""

    def test_route_is_module3_scoped(self):
        self.assertEqual(
            reverse("summaries-mock-journal-entries"),
            "/api/summaries/mock-journal-entries/",
        )

    def test_list_requires_authentication(self):
        self.client.logout()

        response = self.client.get(reverse("summaries-mock-journal-entries"))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_list_returns_only_safe_fixture_fields(self):
        response = self.client.get(reverse("summaries-mock-journal-entries"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [item["id"] for item in response.data],
            [900001, 900002, 900003],
        )
        for item in response.data:
            self.assertEqual(set(item.keys()), {"id", "title", "created_at"})
            self.assertNotIn("content", item)
            self.assertTrue(item["title"])
        # Listing fixtures never persists summaries or journal entries.
        self.assertEqual(Summary.objects.count(), 0)

    def test_endpoint_is_read_only(self):
        url = reverse("summaries-mock-journal-entries")

        for method in ("post", "put", "patch", "delete"):
            with self.subTest(method=method):
                response = getattr(self.client, method)(url, {}, format="json")
                self.assertEqual(
                    response.status_code,
                    status.HTTP_405_METHOD_NOT_ALLOWED,
                )

    def test_no_detail_route_can_read_an_arbitrary_mock_id(self):
        response = self.client.get(
            "/api/summaries/mock-journal-entries/900001/"
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    @patch("apps.summaries.views.generate_summary")
    def test_listing_never_calls_gemini(self, generate_summary):
        response = self.client.get(reverse("summaries-mock-journal-entries"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        generate_summary.assert_not_called()


class SummaryGenerateTests(SummaryAPITestCase):
    def test_generate_route_is_not_swallowed_by_detail(self):
        self.assertEqual(
            reverse("summaries-generate"),
            "/api/summaries/generate/",
        )
        response = self.client.get(reverse("summaries-generate"))
        self.assertEqual(
            response.status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    @patch("apps.summaries.views.generate_summary")
    def test_generate_success_saves_and_returns_the_summary(
        self, generate_summary
    ):
        generate_summary.return_value = GENERATED_RESULT

        response = self.client.post(
            reverse("summaries-generate"),
            {"journal_entry_id": ENTRY_ID},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Summary.objects.count(), 1)
        summary = Summary.objects.get()
        self.assertEqual(summary.owner, self.alice)
        self.assertEqual(summary.journal_entry_id, ENTRY_ID)
        self.assertEqual(summary.summary_text, GENERATED_RESULT["summary_text"])
        self.assertEqual(summary.mood, GENERATED_RESULT["mood"])
        self.assertEqual(summary.themes, GENERATED_RESULT["themes"])
        self.assertEqual(
            summary.illustration_prompt,
            GENERATED_RESULT["illustration_prompt"],
        )
        self.assertEqual(response.data["id"], summary.id)
        self.assertEqual(response.data["owner"], self.alice.id)

        generate_summary.assert_called_once()
        called_entry = generate_summary.call_args.args[0]
        mock_entry = get_mock_journal_entry(ENTRY_ID)
        self.assertEqual(called_entry.id, mock_entry.id)
        self.assertEqual(called_entry.title, mock_entry.title)
        self.assertEqual(called_entry.content, mock_entry.content)

    @patch("apps.summaries.views.generate_summary")
    def test_generate_uses_provider_content_not_client_content(
        self, generate_summary
    ):
        generate_summary.return_value = GENERATED_RESULT

        response = self.client.post(
            reverse("summaries-generate"),
            {
                "journal_entry_id": ENTRY_ID,
                "owner": self.bob.id,
                "title": "Client title",
                "content": "Client content",
                "summary_text": "Client summary",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        called_entry = generate_summary.call_args.args[0]
        mock_entry = get_mock_journal_entry(ENTRY_ID)
        self.assertEqual(called_entry.title, mock_entry.title)
        self.assertEqual(called_entry.content, mock_entry.content)
        self.assertNotEqual(called_entry.content, "Client content")

        summary = Summary.objects.get()
        self.assertEqual(summary.summary_text, GENERATED_RESULT["summary_text"])
        self.assertNotEqual(summary.summary_text, "Client summary")
        self.assertEqual(summary.owner, self.alice)

    @patch("apps.summaries.views.generate_summary")
    def test_generate_unknown_mock_id_returns_404(self, generate_summary):
        response = self.client.post(
            reverse("summaries-generate"),
            {"journal_entry_id": 123456},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        generate_summary.assert_not_called()
        self.assertEqual(Summary.objects.count(), 0)

    @patch("apps.summaries.views.generate_summary")
    def test_generate_missing_id_returns_400(self, generate_summary):
        response = self.client.post(
            reverse("summaries-generate"),
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        generate_summary.assert_not_called()

    @patch("apps.summaries.views.generate_summary")
    def test_generate_invalid_id_returns_400(self, generate_summary):
        response = self.client.post(
            reverse("summaries-generate"),
            {"journal_entry_id": "not-an-integer"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        generate_summary.assert_not_called()

    @patch("apps.summaries.views.generate_summary")
    def test_generate_requires_authentication(self, generate_summary):
        self.client.logout()

        response = self.client.post(
            reverse("summaries-generate"),
            {"journal_entry_id": ENTRY_ID},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        generate_summary.assert_not_called()

    @patch("apps.summaries.views.generate_summary")
    def test_generate_configuration_error_returns_503(self, generate_summary):
        generate_summary.side_effect = SummaryConfigurationError(
            "GEMINI_MODEL is not configured on the server."
        )

        response = self.client.post(
            reverse("summaries-generate"),
            {"journal_entry_id": ENTRY_ID},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_503_SERVICE_UNAVAILABLE,
        )
        self.assertNotIn("GEMINI_MODEL", response.data["detail"])
        self.assertEqual(Summary.objects.count(), 0)

    @patch("apps.summaries.views.generate_summary")
    def test_generate_rate_limit_returns_429(self, generate_summary):
        generate_summary.side_effect = SummaryRateLimitError(
            "Gemini is rate limiting requests."
        )

        response = self.client.post(
            reverse("summaries-generate"),
            {"journal_entry_id": ENTRY_ID},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_429_TOO_MANY_REQUESTS,
        )
        self.assertEqual(Summary.objects.count(), 0)

    @patch("apps.summaries.views.generate_summary")
    def test_generate_provider_error_returns_502_without_details(
        self, generate_summary
    ):
        generate_summary.side_effect = SummaryProviderError(
            "provider said a secret detail"
        )

        response = self.client.post(
            reverse("summaries-generate"),
            {"journal_entry_id": ENTRY_ID},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)
        self.assertNotIn("secret detail", response.data["detail"])
        self.assertEqual(Summary.objects.count(), 0)

    @patch("apps.summaries.views.generate_summary")
    def test_generate_invalid_output_returns_502(self, generate_summary):
        generate_summary.side_effect = SummaryResponseError(
            "Gemini returned malformed JSON."
        )

        response = self.client.post(
            reverse("summaries-generate"),
            {"journal_entry_id": ENTRY_ID},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)
        self.assertEqual(Summary.objects.count(), 0)

    @patch("apps.summaries.views.generate_summary")
    def test_generate_input_error_returns_500(self, generate_summary):
        generate_summary.side_effect = SummaryInputError(
            "Journal entry content cannot be empty."
        )

        response = self.client.post(
            reverse("summaries-generate"),
            {"journal_entry_id": ENTRY_ID},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
        self.assertEqual(Summary.objects.count(), 0)

    @patch("apps.summaries.views.generate_summary")
    def test_generate_save_failure_leaves_no_row(self, generate_summary):
        generate_summary.return_value = GENERATED_RESULT

        with patch.object(Summary, "save", side_effect=RuntimeError("save failed")):
            response = self.client.post(
                reverse("summaries-generate"),
                {"journal_entry_id": ENTRY_ID},
                format="json",
            )

        self.assertEqual(
            response.status_code,
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
        self.assertEqual(Summary.objects.count(), 0)

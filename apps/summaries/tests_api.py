"""API tests for the summaries app.

Gemini is mocked in every generation test. The real service behavior is
covered separately in ``tests.py``.
"""

import json
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.journal.models import JournalEntry

from .models import Summary
from .services import (
    SummaryConfigurationError,
    SummaryInputError,
    SummaryProviderError,
    SummaryRateLimitError,
    SummaryResponseError,
)
from .views import SummarySearchPagination

User = get_user_model()

_UNSET = object()

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
        self.alice_entry = JournalEntry.objects.create(
            user=self.alice,
            title="Morning walk",
            text="Walked through the park before breakfast.",
        )
        self.bob_entry = JournalEntry.objects.create(
            user=self.bob,
            title="Bob's private note",
            text="Do not show this to Alice.",
        )
        self.client.force_login(self.alice)

    def make_summary(self, owner=None, journal_entry=_UNSET, **overrides):
        owner = owner or self.alice
        if journal_entry is _UNSET:
            journal_entry = (
                self.alice_entry if owner.pk == self.alice.pk else self.bob_entry
            )
        data = {
            "owner": owner,
            "journal_entry": journal_entry,
            "summary_text": "A calm morning walk.",
            "mood": "calm",
            "themes": ["nature", "routine"],
            "illustration_prompt": "A quiet park at sunrise.",
        }
        data.update(overrides)
        return Summary.objects.create(**data)

    def manual_payload(self, **overrides):
        payload = {
            "journal_entry_id": self.alice_entry.id,
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
        self.assertEqual(summary.journal_entry, self.alice_entry)
        self.assertEqual(response.data["owner"], self.alice.id)
        self.assertEqual(response.data["journal_entry_id"], self.alice_entry.id)

    def test_manual_create_rejects_another_users_entry(self):
        response = self.client.post(
            reverse("summaries-list"),
            self.manual_payload(journal_entry_id=self.bob_entry.id),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("journal_entry_id", response.data)
        self.assertEqual(Summary.objects.count(), 0)

    def test_manual_create_defaults_optional_fields(self):
        response = self.client.post(
            reverse("summaries-list"),
            {"summary_text": "A short note.", "journal_entry_id": None},
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
            {"summary_text": "Text", "journal_entry_id": 2**63},
            {"summary_text": "Text", "journal_entry_id": 999_999},
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
        self.assertEqual(response.data["journal_entry_id"], self.alice_entry.id)

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

    def test_patch_cannot_link_another_users_entry(self):
        summary = self.make_summary()

        response = self.client.patch(
            reverse("summaries-detail", args=[summary.id]),
            {"journal_entry_id": self.bob_entry.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("journal_entry_id", response.data)
        summary.refresh_from_db()
        self.assertEqual(summary.journal_entry, self.alice_entry)

    def test_deleting_the_entry_keeps_the_summary(self):
        summary = self.make_summary()

        self.alice_entry.delete()
        summary.refresh_from_db()

        self.assertIsNone(summary.journal_entry_id)
        self.assertTrue(Summary.objects.filter(pk=summary.id).exists())

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

    def test_legacy_mock_picker_route_is_removed(self):
        response = self.client.get("/api/summaries/mock-journal-entries/")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    @patch("apps.summaries.views.generate_summary")
    def test_generate_success_saves_and_returns_the_summary(
        self, generate_summary
    ):
        generate_summary.return_value = GENERATED_RESULT

        response = self.client.post(
            reverse("summaries-generate"),
            {"journal_entry_id": self.alice_entry.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Summary.objects.count(), 1)
        summary = Summary.objects.get()
        self.assertEqual(summary.owner, self.alice)
        self.assertEqual(summary.journal_entry, self.alice_entry)
        self.assertEqual(summary.journal_entry_id, self.alice_entry.id)
        self.assertEqual(summary.summary_text, GENERATED_RESULT["summary_text"])
        self.assertEqual(summary.mood, GENERATED_RESULT["mood"])
        self.assertEqual(summary.themes, GENERATED_RESULT["themes"])
        self.assertEqual(
            summary.illustration_prompt,
            GENERATED_RESULT["illustration_prompt"],
        )
        self.assertEqual(response.data["id"], summary.id)
        self.assertEqual(response.data["owner"], self.alice.id)
        self.assertEqual(
            response.data["journal_entry_id"], self.alice_entry.id
        )

        generate_summary.assert_called_once()
        called_entry = generate_summary.call_args.args[0]
        self.assertEqual(called_entry.id, self.alice_entry.id)
        self.assertEqual(called_entry.title, self.alice_entry.title)
        self.assertEqual(called_entry.text, self.alice_entry.text)

    @patch("apps.summaries.views.generate_summary")
    def test_generate_uses_real_entry_not_client_content(
        self, generate_summary
    ):
        generate_summary.return_value = GENERATED_RESULT

        response = self.client.post(
            reverse("summaries-generate"),
            {
                "journal_entry_id": self.alice_entry.id,
                "owner": self.bob.id,
                "title": "Client title",
                "text": "Client content",
                "content": "Client content",
                "summary_text": "Client summary",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        called_entry = generate_summary.call_args.args[0]
        self.assertEqual(called_entry.title, self.alice_entry.title)
        self.assertEqual(called_entry.text, self.alice_entry.text)
        self.assertNotEqual(called_entry.text, "Client content")

        summary = Summary.objects.get()
        self.assertEqual(summary.summary_text, GENERATED_RESULT["summary_text"])
        self.assertNotEqual(summary.summary_text, "Client summary")
        self.assertEqual(summary.owner, self.alice)

    @patch("apps.summaries.views.generate_summary")
    def test_generate_another_users_entry_returns_404(self, generate_summary):
        response = self.client.post(
            reverse("summaries-generate"),
            {"journal_entry_id": self.bob_entry.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        generate_summary.assert_not_called()
        self.assertEqual(Summary.objects.count(), 0)

    @patch("apps.summaries.views.generate_summary")
    def test_generate_unknown_id_returns_404(self, generate_summary):
        response = self.client.post(
            reverse("summaries-generate"),
            {"journal_entry_id": 123456},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        generate_summary.assert_not_called()
        self.assertEqual(Summary.objects.count(), 0)

    @patch("apps.summaries.views.generate_summary")
    def test_generate_empty_entry_returns_400(self, generate_summary):
        empty_entry = JournalEntry.objects.create(
            user=self.alice,
            title="Blank day",
            text="   ",
        )

        response = self.client.post(
            reverse("summaries-generate"),
            {"journal_entry_id": empty_entry.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("no text", response.data["detail"])
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
        for entry_id in ("not-an-integer", 0, 2**63):
            with self.subTest(entry_id=entry_id):
                response = self.client.post(
                    reverse("summaries-generate"),
                    {"journal_entry_id": entry_id},
                    format="json",
                )

                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        generate_summary.assert_not_called()

    @patch("apps.summaries.views.generate_summary")
    def test_generate_requires_authentication(self, generate_summary):
        self.client.logout()

        response = self.client.post(
            reverse("summaries-generate"),
            {"journal_entry_id": self.alice_entry.id},
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
            {"journal_entry_id": self.alice_entry.id},
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
            {"journal_entry_id": self.alice_entry.id},
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
            {"journal_entry_id": self.alice_entry.id},
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
            {"journal_entry_id": self.alice_entry.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)
        self.assertEqual(Summary.objects.count(), 0)

    @patch("apps.summaries.views.generate_summary")
    def test_generate_input_error_returns_400(self, generate_summary):
        generate_summary.side_effect = SummaryInputError(
            "Journal entry content cannot be empty."
        )

        response = self.client.post(
            reverse("summaries-generate"),
            {"journal_entry_id": self.alice_entry.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Summary.objects.count(), 0)

    @patch("apps.summaries.views.generate_summary")
    def test_generate_save_failure_leaves_no_row(self, generate_summary):
        generate_summary.return_value = GENERATED_RESULT

        with patch.object(Summary, "save", side_effect=RuntimeError("save failed")):
            response = self.client.post(
                reverse("summaries-generate"),
                {"journal_entry_id": self.alice_entry.id},
                format="json",
            )

        self.assertEqual(
            response.status_code,
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
        self.assertEqual(Summary.objects.count(), 0)


class SummarySearchTests(SummaryAPITestCase):
    """API tests for the local, owner-scoped summary search."""

    def search(self, q, **params):
        return self.client.get(
            reverse("summaries-search"),
            {"q": q, **params},
        )

    def test_search_route_is_not_swallowed_by_detail(self):
        self.assertEqual(
            reverse("summaries-search"),
            "/api/summaries/search/",
        )

    def test_search_requires_authentication(self):
        self.client.logout()

        response = self.search("famille")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_search_rejects_non_get_methods(self):
        response = self.client.post(
            reverse("summaries-search"),
            {"q": "famille"},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    def test_missing_blank_and_invalid_queries_return_400(self):
        responses = [
            self.client.get(reverse("summaries-search")),
            self.search(""),
            self.search("   "),
            self.search("!!!"),
            self.search("les et de"),
            self.search("a" * 201),
        ]

        for response in responses:
            with self.subTest(body=response.data):
                self.assertEqual(
                    response.status_code,
                    status.HTTP_400_BAD_REQUEST,
                )
                self.assertIn("q", response.data)

    def test_query_at_maximum_length_is_accepted(self):
        response = self.search("x" * 200)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 0)
        self.assertEqual(response.data["results"], [])

    def test_search_by_theme_expands_french_concept(self):
        summary = self.make_summary(
            summary_text="A quiet day.",
            mood="",
            themes=["school"],
        )

        response = self.search("études")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        hit = response.data["results"][0]
        self.assertEqual(hit["summary"]["id"], summary.id)
        self.assertIn("themes", hit["matched_fields"])
        self.assertIn("school", hit["matched_terms"])

    def test_search_by_expression_in_summary_text(self):
        summary = self.make_summary(
            summary_text="A calm morning walk through the park.",
            mood="",
            themes=[],
        )

        response = self.search("morning walk")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        hit = response.data["results"][0]
        self.assertEqual(hit["summary"]["id"], summary.id)
        self.assertIn("summary_text", hit["matched_fields"])
        self.assertIn("morning", hit["snippet"])
        self.assertIn("walk", hit["snippet"])

    def test_search_is_case_and_accent_insensitive(self):
        summary = self.make_summary(
            summary_text="Une journée d'études à l'université.",
            mood="",
            themes=[],
        )

        for query in ("ETUDES", "études", "EtUdEs"):
            with self.subTest(query=query):
                response = self.search(query)

                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.assertEqual(response.data["count"], 1)
                self.assertEqual(
                    response.data["results"][0]["summary"]["id"],
                    summary.id,
                )

    def test_search_by_mood_is_a_complementary_signal(self):
        summary = self.make_summary(
            summary_text="",
            mood="calm",
            themes=[],
        )

        response = self.search("calme")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(
            response.data["results"][0]["summary"]["id"],
            summary.id,
        )
        self.assertIn("mood", response.data["results"][0]["matched_fields"])

    def test_no_result_returns_an_empty_list(self):
        self.make_summary(
            summary_text="A quiet day.",
            mood="",
            themes=["nature"],
        )

        response = self.search("astrophysique")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 0)
        self.assertEqual(response.data["results"], [])

    def test_results_are_ranked_by_relevance_then_date(self):
        theme_summary = self.make_summary(
            summary_text="A quiet day.",
            mood="",
            themes=["happiness"],
        )
        mood_summary = self.make_summary(
            summary_text="A quiet day.",
            mood="happy",
            themes=[],
        )
        text_summary = self.make_summary(
            summary_text="A happy day.",
            mood="",
            themes=[],
        )

        response = self.search("heureux")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [hit["summary"]["id"] for hit in response.data["results"]],
            [theme_summary.id, mood_summary.id, text_summary.id],
        )

    def test_search_expands_related_ideas(self):
        accomplishment = self.make_summary(
            summary_text="A real accomplishment.",
            mood="",
            themes=[],
        )
        exam = self.make_summary(
            summary_text="Final exams next week.",
            mood="",
            themes=[],
        )

        pride_response = self.search("fierté")
        studies_response = self.search("études")

        self.assertEqual(
            [hit["summary"]["id"] for hit in pride_response.data["results"]],
            [accomplishment.id],
        )
        self.assertEqual(
            [hit["summary"]["id"] for hit in studies_response.data["results"]],
            [exam.id],
        )

    def test_direct_match_outranks_synonym_expansion(self):
        direct = self.make_summary(
            summary_text="Je me sentais fier.",
            mood="",
            themes=[],
        )
        indirect = self.make_summary(
            summary_text="Un véritable accomplissement.",
            mood="",
            themes=[],
        )

        response = self.search("fier")

        self.assertEqual(
            [hit["summary"]["id"] for hit in response.data["results"]],
            [direct.id, indirect.id],
        )

    def test_synonym_expansion_never_crosses_owner_boundary(self):
        self.make_summary(
            owner=self.bob,
            summary_text="A real accomplishment.",
            mood="",
            themes=[],
        )

        response = self.search("fierté")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 0)
        self.assertEqual(response.data["results"], [])

    def test_search_never_returns_another_users_summaries(self):
        alice_summary = self.make_summary(
            summary_text="Family dinner.",
            mood="",
            themes=["family"],
        )
        bob_summary = self.make_summary(
            owner=self.bob,
            summary_text="Family secret.",
            mood="",
            themes=["family"],
        )

        response = self.search("famille")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        result_ids = [hit["summary"]["id"] for hit in response.data["results"]]
        self.assertEqual(result_ids, [alice_summary.id])
        self.assertNotIn(bob_summary.id, result_ids)

    def test_client_supplied_owner_parameters_are_ignored(self):
        alice_summary = self.make_summary(
            summary_text="Family dinner.",
            mood="",
            themes=["family"],
        )
        bob_summary = self.make_summary(
            owner=self.bob,
            summary_text="Family secret.",
            mood="",
            themes=["family"],
        )

        for params in (
            {"user_id": self.bob.id},
            {"owner": self.bob.id},
            {"user": self.bob.id},
        ):
            with self.subTest(params=params):
                response = self.search("famille", **params)

                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.assertEqual(
                    [hit["summary"]["id"] for hit in response.data["results"]],
                    [alice_summary.id],
                )
                self.assertNotIn(
                    bob_summary.id,
                    [hit["summary"]["id"] for hit in response.data["results"]],
                )

    def test_illustration_prompt_is_not_searched(self):
        self.make_summary(
            summary_text="A quiet day.",
            mood="",
            themes=[],
            illustration_prompt="A family portrait in warm light.",
        )

        response = self.search("famille")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 0)

    def test_linked_journal_entry_text_is_not_searched(self):
        self.make_summary(
            summary_text="A quiet day.",
            mood="",
            themes=[],
            journal_entry=self.alice_entry,
        )

        response = self.search("breakfast")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 0)

    def test_search_is_read_only_and_never_calls_gemini(self):
        summary = self.make_summary(
            summary_text="Family dinner.",
            mood="calm",
            themes=["family"],
        )
        before = Summary.objects.filter(pk=summary.pk).values(
            "id",
            "summary_text",
            "mood",
            "themes",
            "updated_at",
        ).get()

        with patch("apps.summaries.views.generate_summary") as generate_summary:
            response = self.search("famille")

        after = Summary.objects.filter(pk=summary.pk).values(
            "id",
            "summary_text",
            "mood",
            "themes",
            "updated_at",
        ).get()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(before, after)
        self.assertTrue(Summary.objects.filter(pk=summary.pk).exists())
        generate_summary.assert_not_called()

    def test_search_response_shape(self):
        summary = self.make_summary(
            summary_text="A quiet day.",
            mood="",
            themes=["school"],
        )

        response = self.search("études")
        hit = response.data["results"][0]

        self.assertEqual(
            set(hit),
            {"summary", "score", "matched_fields", "matched_terms", "snippet"},
        )
        self.assertEqual(
            set(hit["summary"]),
            {
                "id",
                "owner",
                "journal_entry_id",
                "summary_text",
                "mood",
                "themes",
                "illustration_prompt",
                "created_at",
                "updated_at",
            },
        )
        self.assertEqual(hit["summary"]["id"], summary.id)
        self.assertIsInstance(hit["score"], float)
        self.assertIsInstance(hit["matched_fields"], list)
        self.assertIsInstance(hit["matched_terms"], list)
        self.assertIsInstance(hit["snippet"], str)

    def test_search_pagination(self):
        for index in range(3):
            self.make_summary(
                summary_text=f"Family memory {index}.",
                mood="",
                themes=["family"],
            )

        first_page = self.search("famille", page_size=1)

        self.assertEqual(first_page.status_code, status.HTTP_200_OK)
        self.assertEqual(first_page.data["count"], 3)
        self.assertEqual(len(first_page.data["results"]), 1)
        self.assertIsNotNone(first_page.data["next"])
        self.assertIsNone(first_page.data["previous"])

        second_page = self.search("famille", page=2, page_size=1)

        self.assertEqual(second_page.status_code, status.HTTP_200_OK)
        self.assertEqual(second_page.data["count"], 3)
        self.assertEqual(len(second_page.data["results"]), 1)
        self.assertIsNotNone(second_page.data["previous"])


class SummarySearchSecurityTests(SummaryAPITestCase):
    """Regression tests for the search endpoint's ownership boundary."""

    def search(self, q, **params):
        return self.client.get(
            reverse("summaries-search"),
            {"q": q, **params},
        )

    def test_two_owners_with_identical_content_only_see_their_own_hits(self):
        alice_summary = self.make_summary(
            summary_text="Family dinner with the same words.",
            mood="calm",
            themes=["family"],
        )
        bob_summary = self.make_summary(
            owner=self.bob,
            summary_text="Family dinner with the same words.",
            mood="calm",
            themes=["family"],
        )

        alice_response = self.search("famille")
        self.client.force_login(self.bob)
        bob_response = self.search("famille")

        self.assertEqual(alice_response.status_code, status.HTTP_200_OK)
        self.assertEqual(bob_response.status_code, status.HTTP_200_OK)

        alice_ids = [
            hit["summary"]["id"] for hit in alice_response.data["results"]
        ]
        bob_ids = [hit["summary"]["id"] for hit in bob_response.data["results"]]

        self.assertEqual(alice_ids, [alice_summary.id])
        self.assertEqual(bob_ids, [bob_summary.id])
        self.assertNotIn(bob_summary.id, alice_ids)
        self.assertNotIn(alice_summary.id, bob_ids)
        self.assertEqual(
            alice_response.data["results"][0]["summary"]["owner"],
            self.alice.id,
        )
        self.assertEqual(
            bob_response.data["results"][0]["summary"]["owner"],
            self.bob.id,
        )

    def test_search_result_detail_cannot_be_read_by_another_user(self):
        bob_summary = self.make_summary(
            owner=self.bob,
            summary_text="Bob's private family dinner.",
            mood="calm",
            themes=["family"],
        )

        self.client.force_login(self.bob)
        bob_response = self.search("famille")
        self.assertEqual(bob_response.status_code, status.HTTP_200_OK)
        result_id = bob_response.data["results"][0]["summary"]["id"]
        self.assertEqual(result_id, bob_summary.id)

        self.client.force_login(self.alice)
        response = self.client.get(
            reverse("summaries-detail", args=[result_id])
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        body = json.dumps(response.data, default=str)
        self.assertNotIn(bob_summary.summary_text, body)

    def test_unauthenticated_search_returns_no_results_or_content(self):
        summary = self.make_summary(
            summary_text="Alice's private family dinner.",
            mood="calm",
            themes=["family"],
        )
        self.client.logout()

        response = self.search("famille")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        body = json.dumps(response.data, default=str)
        self.assertNotIn("results", response.data)
        self.assertNotIn(summary.summary_text, body)
        self.assertNotIn(str(summary.id), body)

    def test_search_response_excludes_journal_title_and_text(self):
        journal_title = "SECRET JOURNAL TITLE"
        journal_text = "SECRET JOURNAL BODY 7f3a"
        entry = JournalEntry.objects.create(
            user=self.alice,
            title=journal_title,
            text=journal_text,
        )
        summary = self.make_summary(
            journal_entry=entry,
            summary_text="Family dinner.",
            mood="",
            themes=["family"],
        )

        response = self.search("famille")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        hit = response.data["results"][0]
        self.assertEqual(hit["summary"]["id"], summary.id)
        self.assertEqual(hit["summary"]["journal_entry_id"], entry.id)
        body = json.dumps(response.data, default=str)
        self.assertNotIn(journal_title, body)
        self.assertNotIn(journal_text, body)

    def test_search_has_no_unsafe_write_methods(self):
        summary = self.make_summary(
            summary_text="Family dinner.",
            mood="calm",
            themes=["family"],
        )
        url = reverse("summaries-search")

        for method in ("post", "put", "patch", "delete"):
            with self.subTest(method=method):
                if method == "delete":
                    response = self.client.delete(url)
                else:
                    response = getattr(self.client, method)(
                        url,
                        {"q": "famille"},
                        format="json",
                    )

                self.assertEqual(
                    response.status_code,
                    status.HTTP_405_METHOD_NOT_ALLOWED,
                )

        summary.refresh_from_db()
        self.assertEqual(summary.summary_text, "Family dinner.")
        self.assertEqual(summary.mood, "calm")
        self.assertEqual(summary.themes, ["family"])

    def test_invalid_page_numbers_are_rejected_without_internal_details(self):
        summary = self.make_summary(
            summary_text="Family dinner.",
            mood="",
            themes=["family"],
        )
        invalid_params = [
            {"page": "abc"},
            {"page": "0"},
            {"page": "-1"},
            {"page": "999"},
        ]

        for params in invalid_params:
            with self.subTest(params=params):
                response = self.search("famille", **params)

                self.assertEqual(
                    response.status_code,
                    status.HTTP_404_NOT_FOUND,
                )
                body = json.dumps(response.data, default=str)
                self.assertIn("detail", response.data)
                self.assertNotIn("Traceback", body)
                self.assertNotIn('File "', body)
                self.assertNotIn(summary.summary_text, body)

    def test_invalid_page_size_falls_back_without_internal_details(self):
        self.make_summary(
            summary_text="Family dinner.",
            mood="",
            themes=["family"],
        )

        for page_size in ("abc", "0", "-5"):
            with self.subTest(page_size=page_size):
                response = self.search("famille", page_size=page_size)

                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.assertLessEqual(
                    len(response.data["results"]),
                    SummarySearchPagination.page_size,
                )
                body = json.dumps(response.data, default=str)
                self.assertNotIn("Traceback", body)
                self.assertNotIn('File "', body)

    def test_page_size_is_capped(self):
        for index in range(55):
            self.make_summary(
                summary_text=f"Family memory {index}.",
                mood="",
                themes=["family"],
            )

        response = self.search("famille", page_size=1000)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 55)
        self.assertEqual(
            len(response.data["results"]),
            SummarySearchPagination.max_page_size,
        )

    def test_oversized_query_is_rejected_without_echoing_it(self):
        query = "private-" + ("x" * 300)

        response = self.search(query)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertNotIn(
            query,
            json.dumps(response.data, default=str),
        )

    def test_search_is_read_only_for_summaries_and_journals(self):
        summary = self.make_summary(
            summary_text="Family dinner.",
            mood="calm",
            themes=["family"],
        )
        summary_before = Summary.objects.filter(pk=summary.pk).values().get()
        journal_before = JournalEntry.objects.filter(
            pk=self.alice_entry.pk
        ).values().get()

        response = self.search("famille")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            Summary.objects.filter(pk=summary.pk).values().get(),
            summary_before,
        )
        self.assertEqual(
            JournalEntry.objects.filter(pk=self.alice_entry.pk).values().get(),
            journal_before,
        )

    def test_search_does_not_log_query_or_summary_content(self):
        self.make_summary(
            summary_text="A very private family memory.",
            mood="calm",
            themes=["family"],
        )

        with self.assertNoLogs("apps.summaries.views", level="DEBUG"):
            response = self.search("famille")

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_search_results_are_not_publicly_cacheable(self):
        self.make_summary(
            summary_text="Family dinner.",
            mood="",
            themes=["family"],
        )

        response = self.search("famille")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("Cookie", response.headers.get("Vary", ""))
        self.assertNotIn(
            "public",
            response.headers.get("Cache-Control", "").lower(),
        )

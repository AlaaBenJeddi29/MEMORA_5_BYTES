"""Tests for the AI Memory Companion and stored emotional patterns.

Gemini is always mocked here. No test sends private content to a provider.
"""

from datetime import datetime, timezone
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.test import TestCase

from .models import Summary
from .patterns import build_emotional_patterns
from .services import (
    SummaryConfigurationError,
    SummaryProviderError,
    SummaryRateLimitError,
    SummaryResponseError,
)
from .services.companion import (
    MAX_QUESTION_LENGTH,
    MAX_SELECTED_MEMORIES,
    CompanionQuestionError,
    answer_question,
    select_memories,
    validate_question,
)

User = get_user_model()

ALICE_PRIVATE = "Alice remembers a family dinner by the river."
BOB_PRIVATE = "Bob's private family secret by the river."


def companion_payload(**overrides):
    data = {
        "answer": "The summaries mention a family dinner by the river.",
        "reflection_questions": ["What felt meaningful about that evening?"],
        "references": ["S1"],
        "insufficient_information": False,
    }
    data.update(overrides)
    return data


class CompanionTestBase(TestCase):
    def setUp(self):
        self.alice = User.objects.create_user(
            username="alice",
            email="alice@example.com",
            password="S3cure-Passw0rd!",
        )
        self.bob = User.objects.create_user(
            username="bob",
            email="bob@example.com",
            password="S3cure-Passw0rd!",
        )

    def make_summary(self, owner=None, **overrides):
        data = {
            "owner": owner or self.alice,
            "journal_entry": None,
            "summary_text": ALICE_PRIVATE,
            "mood": "calm",
            "themes": ["family"],
            "illustration_prompt": "",
        }
        data.update(overrides)
        return Summary.objects.create(**data)


class CompanionQuestionTests(CompanionTestBase):
    def test_blank_and_short_questions_are_rejected(self):
        for question in ("", "   ", "a", None, 42):
            with self.subTest(question=question):
                with self.assertRaises(CompanionQuestionError):
                    validate_question(question)

    def test_overlong_questions_are_rejected(self):
        with self.assertRaises(CompanionQuestionError) as raised:
            validate_question("x" * (MAX_QUESTION_LENGTH + 1))

        self.assertNotIn("x" * 50, str(raised.exception))

    def test_whitespace_is_normalized(self):
        self.assertEqual(
            validate_question("  What did   I learn?  "),
            "What did I learn?",
        )


class CompanionSelectionTests(CompanionTestBase):
    def test_only_the_callers_relevant_summaries_are_selected(self):
        alice_summary = self.make_summary()
        self.make_summary(owner=self.bob, summary_text=BOB_PRIVATE)
        self.make_summary(summary_text="I fixed the printer.", themes=["work"])

        selected = select_memories(self.alice, "famille")

        self.assertEqual([item.summary.id for item in selected], [alice_summary.id])
        self.assertEqual(selected[0].label, "S1")

    def test_selection_is_bounded(self):
        for index in range(12):
            self.make_summary(summary_text=f"Family dinner number {index}.")

        selected = select_memories(self.alice, "famille")

        self.assertLessEqual(len(selected), MAX_SELECTED_MEMORIES)
        self.assertLessEqual(
            sum(len(item.prompt_text) for item in selected),
            6_000,
        )

    def test_long_summary_text_is_truncated(self):
        self.make_summary(summary_text=("family " * 900).strip())

        selected = select_memories(self.alice, "famille")

        self.assertEqual(len(selected), 1)
        self.assertLessEqual(len(selected[0].prompt_text), 1_201)
        self.assertTrue(selected[0].prompt_text.endswith("…"))

    def test_no_relevant_memory_returns_an_honest_answer_without_gemini(self):
        self.make_summary(summary_text="I fixed the printer.", themes=["work"])

        with patch(
            "apps.summaries.services.companion.request_structured"
        ) as request_structured:
            result = answer_question(self.alice, "astrophysics")

        request_structured.assert_not_called()
        self.assertTrue(result.insufficient_information)
        self.assertEqual(result.sources, [])
        self.assertEqual(result.reflection_questions, [])
        self.assertIn("couldn't find", result.answer)

    def test_french_question_gets_a_french_no_match_answer(self):
        result = answer_question(self.alice, "Quelle est la recette du gâteau ?")

        self.assertTrue(result.insufficient_information)
        self.assertIn("Je ne trouve pas", result.answer)


class CompanionAnswerTests(CompanionTestBase):
    def test_prompt_contains_only_selected_owner_memories(self):
        self.make_summary()
        self.make_summary(owner=self.bob, summary_text=BOB_PRIVATE)

        with patch(
            "apps.summaries.services.companion.request_structured",
            return_value=companion_payload(),
        ) as request_structured:
            answer_question(self.alice, "famille")

        contents = request_structured.call_args.args[0]
        self.assertIn(ALICE_PRIVATE, contents)
        self.assertNotIn(BOB_PRIVATE, contents)
        self.assertIn("COMPANION_INPUT_JSON_START", contents)
        self.assertIn("untrusted", contents)

        kwargs = request_structured.call_args.kwargs
        self.assertIn("untrusted DATA", kwargs["system_instruction"])
        self.assertIn("Do not diagnose", kwargs["system_instruction"])
        self.assertEqual(
            set(kwargs["response_schema"].properties),
            {
                "answer",
                "reflection_questions",
                "references",
                "insufficient_information",
            },
        )

    def test_references_are_filtered_to_the_selected_set(self):
        first = self.make_summary(summary_text="Family dinner one.")
        second = self.make_summary(summary_text="Family dinner two.")

        with patch(
            "apps.summaries.services.companion.request_structured",
            return_value=companion_payload(references=["S1", "S9"]),
        ):
            result = answer_question(self.alice, "famille")

        self.assertEqual(len(result.sources), 1)
        self.assertIn(result.sources[0].summary.id, {first.id, second.id})

    def test_missing_references_fall_back_to_the_selected_set(self):
        first = self.make_summary(summary_text="Family dinner one.")
        second = self.make_summary(summary_text="Family dinner two.")

        with patch(
            "apps.summaries.services.companion.request_structured",
            return_value=companion_payload(references=[]),
        ):
            result = answer_question(self.alice, "famille")

        self.assertEqual(
            {source.summary.id for source in result.sources},
            {first.id, second.id},
        )

    def test_insufficient_information_clears_sources(self):
        self.make_summary()

        with patch(
            "apps.summaries.services.companion.request_structured",
            return_value=companion_payload(
                insufficient_information=True,
                references=["S1"],
            ),
        ):
            result = answer_question(self.alice, "famille")

        self.assertTrue(result.insufficient_information)
        self.assertEqual(result.sources, [])

    def test_invalid_provider_shapes_are_rejected(self):
        self.make_summary()
        invalid_payloads = [
            companion_payload(answer=""),
            companion_payload(reflection_questions="not a list"),
            companion_payload(reflection_questions=["x"] * 4),
            companion_payload(references="S1"),
            companion_payload(insufficient_information="no"),
            {"answer": "Only one key."},
        ]

        for payload in invalid_payloads:
            with self.subTest(payload=payload):
                with patch(
                    "apps.summaries.services.companion.request_structured",
                    return_value=payload,
                ):
                    with self.assertRaises(SummaryResponseError):
                        answer_question(self.alice, "famille")

    def test_provider_errors_are_propagated_for_the_view_to_map(self):
        self.make_summary()

        with patch(
            "apps.summaries.services.companion.request_structured",
            side_effect=SummaryProviderError("provider detail"),
        ):
            with self.assertRaisesMessage(SummaryProviderError, "provider detail"):
                answer_question(self.alice, "famille")

    def test_answering_is_read_only(self):
        summary = self.make_summary()
        before = Summary.objects.filter(pk=summary.pk).values().get()

        with patch(
            "apps.summaries.services.companion.request_structured",
            return_value=companion_payload(),
        ):
            answer_question(self.alice, "famille")

        self.assertEqual(
            Summary.objects.filter(pk=summary.pk).values().get(),
            before,
        )
        self.assertEqual(Summary.objects.count(), 1)


class CompanionAPITests(APITestCase):
    def setUp(self):
        self.alice = User.objects.create_user(
            username="alice",
            email="alice@example.com",
            password="S3cure-Passw0rd!",
        )
        self.bob = User.objects.create_user(
            username="bob",
            email="bob@example.com",
            password="S3cure-Passw0rd!",
        )
        self.client.force_login(self.alice)

    def make_summary(self, owner=None, **overrides):
        data = {
            "owner": owner or self.alice,
            "summary_text": ALICE_PRIVATE,
            "mood": "calm",
            "themes": ["family"],
        }
        data.update(overrides)
        return Summary.objects.create(**data)

    def ask(self, question):
        return self.client.post(
            reverse("summaries-companion"),
            {"question": question},
            format="json",
        )

    def test_companion_route_is_not_swallowed_by_detail(self):
        self.assertEqual(
            reverse("summaries-companion"),
            "/api/summaries/companion/",
        )
        response = self.client.get(reverse("summaries-companion"))
        self.assertEqual(
            response.status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    def test_companion_requires_authentication(self):
        self.client.logout()

        response = self.ask("What did I learn?")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_empty_and_overlong_questions_are_rejected(self):
        for question in ("", "   ", "a", "x" * (MAX_QUESTION_LENGTH + 1)):
            with self.subTest(question=question):
                response = self.ask(question)

                self.assertEqual(
                    response.status_code,
                    status.HTTP_400_BAD_REQUEST,
                )
                self.assertIn("question", response.data)

    def test_answer_sources_and_reflection_questions_are_returned(self):
        summary = self.make_summary(
            summary_text="Je me sentais fier lors du dîner de famille.",
            themes=["family", "fierté"],
        )

        with patch(
            "apps.summaries.services.companion.request_structured",
            return_value=companion_payload(),
        ):
            response = self.ask("Quand est-ce que je me suis senti fier ?")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(set(response.data), {
            "answer",
            "reflection_questions",
            "insufficient_information",
            "sources",
        })
        self.assertFalse(response.data["insufficient_information"])
        self.assertEqual(len(response.data["reflection_questions"]), 1)
        self.assertEqual(len(response.data["sources"]), 1)
        source = response.data["sources"][0]
        self.assertEqual(source["summary"]["id"], summary.id)
        self.assertEqual(source["summary"]["owner"], self.alice.id)
        self.assertTrue(source["excerpt"])

    def test_gemini_receives_only_the_callers_selected_memories(self):
        self.make_summary()
        self.make_summary(owner=self.bob, summary_text=BOB_PRIVATE)

        with patch(
            "apps.summaries.services.companion.request_structured",
            return_value=companion_payload(),
        ) as request_structured:
            response = self.ask("famille")

        contents = request_structured.call_args.args[0]
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn(ALICE_PRIVATE, contents)
        self.assertNotIn(BOB_PRIVATE, contents)

    def test_no_relevant_memory_returns_an_honest_response_without_gemini(self):
        self.make_summary(summary_text="I fixed the printer.", themes=["work"])

        with patch(
            "apps.summaries.services.companion.request_structured"
        ) as request_structured:
            response = self.ask("astrophysics")

        request_structured.assert_not_called()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["insufficient_information"])
        self.assertEqual(response.data["sources"], [])
        self.assertEqual(response.data["reflection_questions"], [])
        self.assertTrue(response.data["answer"])

    def test_client_supplied_owner_is_ignored(self):
        alice_summary = self.make_summary()
        self.make_summary(owner=self.bob, summary_text=BOB_PRIVATE)

        with patch(
            "apps.summaries.services.companion.request_structured",
            return_value=companion_payload(),
        ) as request_structured:
            response = self.client.post(
                reverse("summaries-companion"),
                {
                    "question": "famille",
                    "owner": self.bob.id,
                    "user_id": self.bob.id,
                },
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [source["summary"]["id"] for source in response.data["sources"]],
            [alice_summary.id],
        )
        contents = request_structured.call_args.args[0]
        self.assertNotIn(BOB_PRIVATE, contents)

    def test_configuration_error_returns_503_without_internal_details(self):
        self.make_summary()

        with patch(
            "apps.summaries.services.companion.request_structured",
            side_effect=SummaryConfigurationError("GEMINI_MODEL is missing"),
        ):
            response = self.ask("famille")

        self.assertEqual(
            response.status_code,
            status.HTTP_503_SERVICE_UNAVAILABLE,
        )
        self.assertNotIn("GEMINI_MODEL", response.data["detail"])

    def test_rate_limit_returns_429(self):
        self.make_summary()

        with patch(
            "apps.summaries.services.companion.request_structured",
            side_effect=SummaryRateLimitError("rate limited"),
        ):
            response = self.ask("famille")

        self.assertEqual(
            response.status_code,
            status.HTTP_429_TOO_MANY_REQUESTS,
        )

    def test_provider_and_invalid_output_errors_return_502(self):
        self.make_summary()

        for error in (
            SummaryProviderError("provider detail"),
            SummaryResponseError("invalid output"),
        ):
            with self.subTest(error=error):
                with patch(
                    "apps.summaries.services.companion.request_structured",
                    side_effect=error,
                ):
                    response = self.ask("famille")

                self.assertEqual(
                    response.status_code,
                    status.HTTP_502_BAD_GATEWAY,
                )
                self.assertNotIn("provider detail", response.data["detail"])

    def test_companion_never_returns_another_users_source(self):
        self.make_summary(owner=self.bob, summary_text=BOB_PRIVATE)

        with patch(
            "apps.summaries.services.companion.request_structured"
        ) as request_structured:
            response = self.ask("famille")

        request_structured.assert_not_called()
        self.assertEqual(response.data["sources"], [])
        self.assertNotIn(BOB_PRIVATE, response.data["answer"])

    def test_companion_does_not_log_question_or_memory_content(self):
        self.make_summary()

        with patch(
            "apps.summaries.services.companion.request_structured",
            return_value=companion_payload(),
        ):
            with self.assertNoLogs("apps.summaries.views", level="DEBUG"):
                response = self.ask("famille")

        self.assertEqual(response.status_code, status.HTTP_200_OK)


class EmotionalPatternsTests(APITestCase):
    def setUp(self):
        self.alice = User.objects.create_user(
            username="alice",
            email="alice@example.com",
            password="S3cure-Passw0rd!",
        )
        self.bob = User.objects.create_user(
            username="bob",
            email="bob@example.com",
            password="S3cure-Passw0rd!",
        )
        self.client.force_login(self.alice)

    def make_summary(self, owner=None, **overrides):
        data = {
            "owner": owner or self.alice,
            "summary_text": "A stored memory.",
            "mood": "calm",
            "themes": ["family"],
        }
        data.update(overrides)
        return Summary.objects.create(**data)

    def set_created_at(self, summary, value):
        Summary.objects.filter(pk=summary.pk).update(created_at=value)
        summary.refresh_from_db()

    def test_patterns_endpoint_requires_authentication(self):
        self.client.logout()

        response = self.client.get(reverse("summaries-patterns"))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_patterns_are_owner_scoped(self):
        self.make_summary(themes=["family"], mood="calm")
        self.make_summary(owner=self.bob, themes=["work"], mood="tired")

        response = self.client.get(reverse("summaries-patterns"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["total_summaries"], 1)
        self.assertEqual([item["name"] for item in response.data["themes"]], ["family"])
        self.assertEqual([item["name"] for item in response.data["moods"]], ["calm"])

    def test_patterns_count_themes_moods_and_months(self):
        first = self.make_summary(themes=["family", "joy"], mood="calm")
        second = self.make_summary(themes=["family"], mood="calm")
        third = self.make_summary(themes=["work"], mood="tired")
        self.set_created_at(first, datetime(2026, 9, 10, tzinfo=timezone.utc))
        self.set_created_at(second, datetime(2026, 10, 2, tzinfo=timezone.utc))
        self.set_created_at(third, datetime(2026, 10, 8, tzinfo=timezone.utc))

        response = self.client.get(reverse("summaries-patterns"))
        data = response.data

        self.assertEqual(data["total_summaries"], 3)
        self.assertEqual(data["period"], {"start": "2026-09-10", "end": "2026-10-08"})
        self.assertEqual(
            [(item["name"], item["count"]) for item in data["themes"]],
            [("family", 2), ("joy", 1), ("work", 1)],
        )
        self.assertEqual(
            [(item["name"], item["count"]) for item in data["moods"]],
            [("calm", 2), ("tired", 1)],
        )
        self.assertEqual(
            [month["month"] for month in data["months"]],
            ["2026-09", "2026-10"],
        )
        self.assertEqual(data["months"][1]["count"], 2)

    def test_empty_patterns_state_is_honest(self):
        response = self.client.get(reverse("summaries-patterns"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["has_data"])
        self.assertEqual(response.data["total_summaries"], 0)
        self.assertEqual(response.data["themes"], [])
        self.assertEqual(response.data["months"], [])
        self.assertIn("No summaries", response.data["limitations"])

    def test_patterns_have_no_scores_or_diagnoses(self):
        self.make_summary()

        response = self.client.get(reverse("summaries-patterns"))

        self.assertEqual(
            set(response.data),
            {
                "has_data",
                "total_summaries",
                "period",
                "themes",
                "moods",
                "months",
                "method",
                "limitations",
            },
        )
        forbidden = ("score", "diagnosis", "depression", "risk", "prediction")
        for word in forbidden:
            with self.subTest(word=word):
                self.assertNotIn(word, response.data["method"].lower())
                self.assertNotIn(word, response.data["limitations"].lower())

    def test_patterns_are_read_only_and_never_call_ai(self):
        summary = self.make_summary()
        before = Summary.objects.filter(pk=summary.pk).values().get()

        with patch(
            "apps.summaries.services.companion.request_structured"
        ) as request_structured, patch(
            "apps.summaries.views.generate_summary"
        ) as generate_summary:
            response = self.client.get(reverse("summaries-patterns"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            Summary.objects.filter(pk=summary.pk).values().get(),
            before,
        )
        request_structured.assert_not_called()
        generate_summary.assert_not_called()

    def test_patterns_reject_write_methods(self):
        url = reverse("summaries-patterns")

        for method in ("post", "put", "patch", "delete"):
            with self.subTest(method=method):
                if method == "delete":
                    response = self.client.delete(url)
                else:
                    response = getattr(self.client, method)(
                        url,
                        {},
                        format="json",
                    )

                self.assertEqual(
                    response.status_code,
                    status.HTTP_405_METHOD_NOT_ALLOWED,
                )

    def test_build_patterns_function_is_read_only(self):
        self.make_summary()

        data = build_emotional_patterns(self.alice)

        self.assertTrue(data["has_data"])
        self.assertEqual(Summary.objects.count(), 1)

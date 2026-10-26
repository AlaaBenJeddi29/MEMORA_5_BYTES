"""Unit tests for the local summaries search engine.

These tests use lightweight summary objects, so they never touch the database
or any external service.
"""

from datetime import datetime, timezone
from types import SimpleNamespace

from django.test import SimpleTestCase

from .concepts import CONCEPTS, CONCEPTS_BY_KEY
from .search import (
    MAX_CONCEPTS_PER_QUERY,
    MAX_QUERY_TERMS,
    EmptySearchQuery,
    build_query_terms,
    build_snippet,
    normalize_text,
    rank_summaries,
    score_summary,
)


def make_summary(**overrides):
    data = {
        "id": 1,
        "summary_text": "",
        "mood": "",
        "themes": [],
        "created_at": datetime(2026, 10, 20, tzinfo=timezone.utc),
    }
    data.update(overrides)
    return SimpleNamespace(**data)


class NormalizationTests(SimpleTestCase):
    def test_handles_case_accents_and_punctuation(self):
        self.assertEqual(
            normalize_text("  Études, l'École ! "),
            "etudes l ecole",
        )

    def test_handles_ligatures(self):
        self.assertEqual(normalize_text("cœur et forêt"), "coeur et foret")

    def test_blank_and_non_string_values_are_empty(self):
        self.assertEqual(normalize_text("   "), "")
        self.assertEqual(normalize_text(None), "")


class QueryTermTests(SimpleTestCase):
    def test_drops_stopwords_and_generic_words(self):
        terms = build_query_terms("les moments où je me sentais fier")

        self.assertEqual([term.text for term in terms], ["fier"])

    def test_deduplicates_terms(self):
        terms = build_query_terms("fier fier FIER")

        self.assertEqual([term.text for term in terms], ["fier"])

    def test_expands_french_concepts_to_english(self):
        term = build_query_terms("études")[0]

        self.assertIn("school", term.variants)
        self.assertIn("university", term.variants)
        self.assertIn("exam", term.variants)

    def test_expands_mood_concepts(self):
        term = build_query_terms("heureux")[0]

        self.assertIn("happy", term.variants)
        self.assertIn("happiness", term.variants)

    def test_rejects_queries_without_useful_terms(self):
        for query in ("", "   ", "!!!", "les et de", "a"):
            with self.subTest(query=query):
                with self.assertRaises(EmptySearchQuery):
                    build_query_terms(query)

    def test_caps_the_number_of_terms(self):
        query = " ".join(f"t{index:02d}xx" for index in range(30))
        terms = build_query_terms(query)

        self.assertEqual(len(terms), MAX_QUERY_TERMS)


class ScoringTests(SimpleTestCase):
    def test_theme_match_outranks_mood_then_summary_concept(self):
        terms = build_query_terms("heureux")
        theme_hit = score_summary(
            make_summary(summary_text="A quiet day.", themes=["happiness"]),
            terms,
        )
        mood_hit = score_summary(
            make_summary(summary_text="A quiet day.", mood="happy"),
            terms,
        )
        text_hit = score_summary(
            make_summary(summary_text="A happy day.", themes=[]),
            terms,
        )

        self.assertIsNotNone(theme_hit)
        self.assertIsNotNone(mood_hit)
        self.assertIsNotNone(text_hit)
        self.assertGreater(theme_hit.score, mood_hit.score)
        self.assertGreater(mood_hit.score, text_hit.score)

    def test_reports_matched_fields_and_terms(self):
        hit = score_summary(
            make_summary(summary_text="A quiet day.", themes=["school"]),
            build_query_terms("études"),
        )

        self.assertIsNotNone(hit)
        self.assertEqual(hit.matched_fields, ["themes"])
        self.assertIn("school", hit.matched_terms)

    def test_phrase_match_beats_scattered_terms(self):
        terms = build_query_terms("morning walk")
        phrase_hit = score_summary(
            make_summary(summary_text="A calm morning walk through the park."),
            terms,
        )
        scattered_hit = score_summary(
            make_summary(summary_text="A walk at noon. Morning was calm."),
            terms,
        )

        self.assertIsNotNone(phrase_hit)
        self.assertIsNotNone(scattered_hit)
        self.assertGreater(phrase_hit.score, scattered_hit.score)

    def test_multiple_query_terms_increase_score(self):
        single_hit = score_summary(
            make_summary(themes=["family"]),
            build_query_terms("famille"),
        )
        multi_hit = score_summary(
            make_summary(themes=["family", "travel"]),
            build_query_terms("famille voyage"),
        )

        self.assertIsNotNone(single_hit)
        self.assertIsNotNone(multi_hit)
        self.assertGreater(multi_hit.score, single_hit.score)

    def test_plural_and_prefix_variants_match(self):
        hit = score_summary(
            make_summary(themes=["exam"]),
            build_query_terms("examens"),
        )

        self.assertIsNotNone(hit)
        self.assertEqual(hit.matched_fields, ["themes"])

    def test_unrelated_prefix_does_not_match(self):
        hit = score_summary(
            make_summary(themes=["example"]),
            build_query_terms("exam"),
        )

        self.assertIsNone(hit)

    def test_empty_fields_do_not_match(self):
        hit = score_summary(
            make_summary(summary_text="", mood="", themes=[]),
            build_query_terms("famille"),
        )

        self.assertIsNone(hit)


class RankingTests(SimpleTestCase):
    def test_ranks_by_score_then_newest_date(self):
        older = make_summary(
            id=1,
            summary_text="Family lunch.",
            themes=["family"],
            created_at=datetime(2026, 10, 20, tzinfo=timezone.utc),
        )
        newer = make_summary(
            id=2,
            summary_text="Family dinner.",
            themes=["family"],
            created_at=datetime(2026, 10, 21, tzinfo=timezone.utc),
        )

        hits = rank_summaries([older, newer], "famille")

        self.assertEqual([hit.summary.id for hit in hits], [2, 1])

    def test_recent_but_unrelated_summary_is_not_returned(self):
        matching = make_summary(
            id=1,
            summary_text="Family lunch.",
            themes=["family"],
            created_at=datetime(2026, 10, 1, tzinfo=timezone.utc),
        )
        unrelated = make_summary(
            id=2,
            summary_text="I fixed the printer.",
            created_at=datetime(2026, 10, 25, tzinfo=timezone.utc),
        )

        hits = rank_summaries([unrelated, matching], "famille")

        self.assertEqual([hit.summary.id for hit in hits], [1])

    def test_equal_scores_fall_back_to_identifier(self):
        first = make_summary(id=1, themes=["family"])
        second = make_summary(id=2, themes=["family"])

        hits = rank_summaries([first, second], "famille")

        self.assertEqual([hit.summary.id for hit in hits], [2, 1])

    def test_no_match_returns_empty_list(self):
        hits = rank_summaries(
            [make_summary(summary_text="A quiet day.", themes=["nature"])],
            "astrophysique",
        )

        self.assertEqual(hits, [])


class SnippetTests(SimpleTestCase):
    def test_centers_on_the_first_match(self):
        text = ("word " * 100) + "family dinner " + ("word " * 100)

        snippet = build_snippet(text, ["family"], radius=20)

        self.assertIn("family", snippet)
        self.assertLessEqual(len(snippet), 65)

    def test_falls_back_to_the_beginning(self):
        self.assertEqual(
            build_snippet("A quiet day.", ["school"]),
            "A quiet day.",
        )

    def test_blank_text_returns_empty_string(self):
        self.assertEqual(build_snippet("   ", ["family"]), "")
        self.assertEqual(build_snippet("", ["family"]), "")


class ConceptDictionaryTests(SimpleTestCase):
    def test_keys_are_unique_and_relationships_resolve(self):
        keys = [concept.key for concept in CONCEPTS]

        self.assertEqual(len(keys), len(set(keys)))
        for concept in CONCEPTS:
            for related in concept.related:
                with self.subTest(concept=concept.key, related=related):
                    self.assertIn(related, CONCEPTS_BY_KEY)
                    self.assertNotEqual(related, concept.key)

    def test_terms_are_unique_after_normalization(self):
        for concept in CONCEPTS:
            with self.subTest(concept=concept.key):
                normalized = [normalize_text(term) for term in concept.terms]

                self.assertTrue(all(normalized))
                self.assertEqual(len(normalized), len(set(normalized)))

    def test_term_lists_stay_small_and_curated(self):
        for concept in CONCEPTS:
            with self.subTest(concept=concept.key):
                self.assertLessEqual(len(concept.terms), 20)

    def test_sadness_is_not_treated_as_a_diagnosis(self):
        sadness_terms = {
            normalize_text(term)
            for term in CONCEPTS_BY_KEY["sadness"].terms
        }

        for clinical in ("depression", "depressif", "depressive"):
            self.assertNotIn(clinical, sadness_terms)

        term = build_query_terms("triste")[0]
        self.assertNotIn("depression", term.variants)


class ConceptExpansionTests(SimpleTestCase):
    def test_pride_query_reaches_an_accomplishment_summary(self):
        hit = score_summary(
            make_summary(summary_text="A real accomplishment."),
            build_query_terms("fierté"),
        )

        self.assertIsNotNone(hit)
        self.assertIn("summary_text", hit.matched_fields)
        self.assertIn("accomplishment", hit.matched_terms)

    def test_studies_query_reaches_an_exam_summary(self):
        hit = score_summary(
            make_summary(summary_text="Final exams next week."),
            build_query_terms("études"),
        )

        self.assertIsNotNone(hit)
        self.assertIn("summary_text", hit.matched_fields)
        self.assertIn("exams", hit.matched_terms)

    def test_direct_summary_match_outranks_expansion_only(self):
        direct = make_summary(
            id=1,
            summary_text="Je me sentais fier ce jour-là.",
        )
        indirect = make_summary(
            id=2,
            summary_text="Un véritable accomplissement.",
        )

        hits = rank_summaries([indirect, direct], "fier")

        self.assertEqual([hit.summary.id for hit in hits], [1, 2])
        self.assertGreater(hits[0].score, hits[1].score)

    def test_direct_theme_match_outranks_expansion_only(self):
        direct = make_summary(id=1, themes=["fierté"])
        indirect = make_summary(id=2, themes=["achievement"])

        hits = rank_summaries([indirect, direct], "fierté")

        self.assertEqual([hit.summary.id for hit in hits], [1, 2])

    def test_expansion_does_not_return_unrelated_summaries(self):
        summaries = [
            make_summary(id=1, summary_text="I fixed the printer."),
            make_summary(id=2, summary_text="A quiet day.", themes=["nature"]),
        ]

        self.assertEqual(rank_summaries(summaries, "fier"), [])

    def test_sadness_query_does_not_match_clinical_language(self):
        summaries = [
            make_summary(summary_text="A depression diagnosis was mentioned.")
        ]

        self.assertEqual(rank_summaries(summaries, "triste"), [])

    def test_expansion_does_not_duplicate_matched_terms(self):
        hit = score_summary(
            make_summary(themes=["exam"], summary_text="Final exams."),
            build_query_terms("études examens"),
        )

        self.assertIsNotNone(hit)
        self.assertEqual(
            len(hit.matched_terms),
            len(set(hit.matched_terms)),
        )

    def test_query_expansion_respects_concept_budget(self):
        terms = build_query_terms(
            "fier études voyage famille triste heureux calme amour "
            "fatigue colère gratitude"
        )

        concepts = {key for term in terms for key in term.concepts}

        self.assertGreater(len(concepts), 0)
        self.assertLessEqual(len(concepts), MAX_CONCEPTS_PER_QUERY)

    def test_explicit_concept_budget_stops_further_expansion(self):
        terms = build_query_terms("fier études", max_concepts=1)

        concepts = {key for term in terms for key in term.concepts}

        self.assertEqual(concepts, {"pride"})

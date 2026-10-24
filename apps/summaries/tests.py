"""Tests for the summaries model and the isolated mock journal provider."""

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import SimpleTestCase, TestCase

from .mock_journal_entries import (
    MOCK_JOURNAL_ENTRIES,
    MockJournalEntryNotFound,
    get_mock_journal_entry,
    list_mock_journal_entries,
)
from .models import MAX_THEME_LENGTH, MAX_THEMES, Summary

User = get_user_model()


class SummaryModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="ada", password="S3cure-Passw0rd!"
        )

    def make_summary(self, **overrides):
        data = {
            "owner": self.user,
            "journal_entry_id": 900001,
            "summary_text": "A calm morning walk.",
            "mood": "calm",
            "themes": ["nature", "routine"],
            "illustration_prompt": "A quiet park at sunrise.",
        }
        data.update(overrides)
        return Summary(**data)

    def test_defaults_and_owner_are_saved(self):
        summary = self.make_summary()
        summary.full_clean()
        summary.save()

        self.assertEqual(summary.owner, self.user)
        self.assertEqual(summary.journal_entry_id, 900001)
        self.assertEqual(summary.summary_text, "A calm morning walk.")
        self.assertEqual(summary.mood, "calm")
        self.assertEqual(summary.themes, ["nature", "routine"])
        self.assertEqual(summary.illustration_prompt, "A quiet park at sunrise.")
        self.assertIsNotNone(summary.created_at)
        self.assertIsNotNone(summary.updated_at)

    def test_optional_fields_can_be_empty(self):
        summary = self.make_summary(
            journal_entry_id=None,
            mood="",
            themes=[],
            illustration_prompt="",
        )
        summary.full_clean()
        summary.save()

        self.assertIsNone(summary.journal_entry_id)
        self.assertEqual(summary.mood, "")
        self.assertEqual(summary.themes, [])
        self.assertEqual(summary.illustration_prompt, "")

    def test_summary_text_is_required(self):
        with self.assertRaises(ValidationError) as raised:
            self.make_summary(summary_text="").full_clean()

        self.assertIn("summary_text", raised.exception.message_dict)

    def test_themes_default_is_not_shared_between_instances(self):
        first = Summary(owner=self.user, summary_text="First")
        second = Summary(owner=self.user, summary_text="Second")

        first.themes.append("nature")

        self.assertEqual(second.themes, [])

    def test_ordering_is_newest_first(self):
        self.assertEqual(Summary._meta.ordering, ["-created_at"])

    def test_deleting_owner_cascades_to_summaries(self):
        summary = self.make_summary()
        summary.full_clean()
        summary.save()

        self.user.delete()

        self.assertFalse(Summary.objects.filter(pk=summary.pk).exists())

    def test_themes_accepts_a_valid_list(self):
        self.make_summary(themes=["work", "family"]).full_clean()

    def test_themes_rejects_a_non_list(self):
        with self.assertRaises(ValidationError) as raised:
            self.make_summary(themes="work").full_clean()

        self.assertIn("themes", raised.exception.message_dict)

    def test_themes_rejects_non_string_items(self):
        with self.assertRaises(ValidationError) as raised:
            self.make_summary(themes=["work", 3]).full_clean()

        self.assertIn("themes", raised.exception.message_dict)

    def test_themes_rejects_empty_strings(self):
        with self.assertRaises(ValidationError) as raised:
            self.make_summary(themes=["   "]).full_clean()

        self.assertIn("themes", raised.exception.message_dict)

    def test_themes_rejects_too_many_items(self):
        with self.assertRaises(ValidationError) as raised:
            self.make_summary(
                themes=[f"theme-{index}" for index in range(MAX_THEMES + 1)]
            ).full_clean()

        self.assertIn("themes", raised.exception.message_dict)

    def test_themes_rejects_overlong_items(self):
        with self.assertRaises(ValidationError) as raised:
            self.make_summary(themes=["x" * (MAX_THEME_LENGTH + 1)]).full_clean()

        self.assertIn("themes", raised.exception.message_dict)

    def test_mood_rejects_overlong_values(self):
        with self.assertRaises(ValidationError) as raised:
            self.make_summary(mood="x" * 33).full_clean()

        self.assertIn("mood", raised.exception.message_dict)


class MockJournalProviderTests(SimpleTestCase):
    def test_list_returns_the_fixture_entries(self):
        entries = list_mock_journal_entries()

        self.assertEqual(len(entries), 3)
        self.assertEqual({entry.id for entry in entries}, {900001, 900002, 900003})
        for entry in entries:
            self.assertTrue(entry.title)
            self.assertTrue(entry.content)
            self.assertIsNotNone(entry.created_at.tzinfo)

    def test_known_id_returns_the_matching_entry(self):
        entry = get_mock_journal_entry(900001)

        self.assertEqual(entry.title, "Morning walk")

    def test_unknown_id_raises_a_clear_not_found_error(self):
        with self.assertRaisesMessage(MockJournalEntryNotFound, "123456"):
            get_mock_journal_entry(123456)

    def test_fixture_ids_are_reserved_for_development(self):
        self.assertTrue(
            all(entry.id >= 900000 for entry in MOCK_JOURNAL_ENTRIES)
        )

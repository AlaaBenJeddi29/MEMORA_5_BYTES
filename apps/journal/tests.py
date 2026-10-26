"""Security tests for journal CRUD and search.

The journal is the most sensitive data in MEMORA, so these tests focus on
owner isolation (IDOR), server-side assignment of the owner, and rejection of
malformed search input instead of a server error.
"""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .models import JournalEntry

User = get_user_model()

PASSWORD = "S3cure-Passw0rd!"


class JournalSecurityTests(APITestCase):
    def setUp(self):
        self.alice = User.objects.create_user(
            username="alice", email="alice@example.com", password=PASSWORD
        )
        self.bob = User.objects.create_user(
            username="bob", email="bob@example.com", password=PASSWORD
        )
        self.alice_entry = JournalEntry.objects.create(
            user=self.alice,
            title="Sunny day",
            text="I felt happy at the beach.",
            sentiment="happy",
        )
        self.bob_entry = JournalEntry.objects.create(
            user=self.bob,
            title="Sunny secret",
            text="Private thoughts.",
            sentiment="happy",
        )
        self.list_url = reverse("journal-entry-list")

    def detail_url(self, entry):
        return reverse("journal-entry-detail", args=[entry.pk])

    def test_anonymous_cannot_read_or_write_entries(self):
        self.assertEqual(
            self.client.get(self.list_url).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.post(
                self.list_url, {"title": "No", "text": "No"}, format="json"
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_list_returns_only_the_owners_entries(self):
        self.client.force_login(self.alice)

        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        titles = [entry["title"] for entry in response.data["results"]]
        self.assertEqual(titles, ["Sunny day"])

    def test_retrieving_another_users_entry_returns_404(self):
        self.client.force_login(self.alice)

        response = self.client.get(self.detail_url(self.bob_entry))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertNotIn("Private thoughts.", str(response.data))

    def test_updating_another_users_entry_returns_404(self):
        self.client.force_login(self.alice)

        response = self.client.patch(
            self.detail_url(self.bob_entry),
            {"title": "Hijacked"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.bob_entry.refresh_from_db()
        self.assertEqual(self.bob_entry.title, "Sunny secret")

    def test_deleting_another_users_entry_returns_404(self):
        self.client.force_login(self.alice)

        response = self.client.delete(self.detail_url(self.bob_entry))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(JournalEntry.objects.filter(pk=self.bob_entry.pk).exists())

    def test_owner_is_taken_from_the_session_not_the_request_body(self):
        self.client.force_login(self.alice)

        response = self.client.post(
            self.list_url,
            {
                "title": "Mine",
                "text": "Written by Alice.",
                "user": self.bob.pk,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        entry = JournalEntry.objects.get(pk=response.data["id"])
        self.assertEqual(entry.user, self.alice)
        self.assertEqual(JournalEntry.objects.filter(user=self.bob).count(), 1)

    def test_owner_can_update_and_delete_their_entry(self):
        self.client.force_login(self.alice)

        update = self.client.patch(
            self.detail_url(self.alice_entry),
            {"title": "Updated"},
            format="json",
        )
        delete = self.client.delete(self.detail_url(self.alice_entry))

        self.assertEqual(update.status_code, status.HTTP_200_OK)
        self.assertEqual(delete.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(
            JournalEntry.objects.filter(pk=self.alice_entry.pk).exists()
        )

    def test_search_never_returns_another_users_entries(self):
        self.client.force_login(self.alice)

        response = self.client.get(
            reverse("journal-entry-search"), {"q": "Sunny"}
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["title"], "Sunny day")

    def test_search_rejects_an_invalid_date(self):
        self.client.force_login(self.alice)

        response = self.client.get(
            reverse("journal-entry-search"), {"date_from": "not-a-date"}
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("date_from", response.data)

    def test_search_rejects_a_reversed_date_range(self):
        self.client.force_login(self.alice)

        response = self.client.get(
            reverse("journal-entry-search"),
            {"date_from": "2025-12-31", "date_to": "2025-01-01"},
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_search_rejects_an_overlong_query(self):
        self.client.force_login(self.alice)

        response = self.client.get(
            reverse("journal-entry-search"), {"q": "x" * 201}
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_advanced_search_validates_dates_and_query_length(self):
        self.client.force_login(self.alice)
        url = reverse("journal-entry-advanced-search")

        bad_date = self.client.post(
            url, {"query": "summer", "date_from": "2025-13-40"}, format="json"
        )
        long_query = self.client.post(
            url, {"query": "x" * 501}, format="json"
        )

        self.assertEqual(bad_date.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(long_query.status_code, status.HTTP_400_BAD_REQUEST)

    def test_advanced_search_is_scoped_to_the_owner(self):
        self.client.force_login(self.alice)

        with patch(
            "apps.summaries.ai_service._get_search_synonyms",
            return_value=["Sunny"],
        ):
            response = self.client.post(
                reverse("journal-entry-advanced-search"),
                {"query": "Sunny", "use_ai": False},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["total"], 1)
        self.assertEqual(
            response.data["results"][0]["id"], self.alice_entry.pk
        )

    def test_anonymous_cannot_use_the_search_endpoints(self):
        self.assertEqual(
            self.client.get(reverse("journal-entry-search")).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.post(
                reverse("journal-entry-advanced-search"),
                {"query": "anything"},
                format="json",
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )

"""API tests for the per-user memory-book customization."""

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .models import BookPreference

User = get_user_model()

DEFAULTS = {
    "cover_style": "classic",
    "theme_id": "paper",
    "font_style": "editorial",
}


class BookPreferenceAPITestCase(APITestCase):
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
        self.url = reverse("summaries-book-preferences")
        self.client.force_login(self.alice)

    def test_requires_authentication(self):
        self.client.logout()

        self.assertEqual(
            self.client.get(self.url).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.put(self.url, DEFAULTS, format="json").status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_new_user_receives_defaults_without_creating_a_row(self):
        response = self.client.get(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json(), DEFAULTS)
        self.assertFalse(BookPreference.objects.exists())

    def test_saves_and_persists_valid_choices(self):
        payload = {
            "cover_style": "nature",
            "theme_id": "ocean",
            "font_style": "modern",
        }

        response = self.client.put(self.url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json(), payload)
        preference = BookPreference.objects.get(owner=self.alice)
        self.assertEqual(preference.cover_style, "nature")
        self.assertEqual(preference.theme_id, "ocean")
        self.assertEqual(preference.font_style, "modern")

        refreshed = self.client.get(self.url)
        self.assertEqual(refreshed.json(), payload)

    def test_patch_updates_only_supplied_fields(self):
        self.client.put(
            self.url,
            {"cover_style": "travel", "theme_id": "blush", "font_style": "modern"},
            format="json",
        )

        response = self.client.patch(
            self.url,
            {"theme_id": "night"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.json(),
            {
                "cover_style": "travel",
                "theme_id": "night",
                "font_style": "modern",
            },
        )

    def test_put_requires_every_allowed_field(self):
        response = self.client.put(
            self.url,
            {"cover_style": "classic", "theme_id": "paper"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("font_style", response.json())
        self.assertFalse(BookPreference.objects.exists())

    def test_rejects_unknown_cover_theme_and_font(self):
        cases = [
            {"cover_style": "hacked"},
            {"theme_id": "css-injection"},
            {"font_style": "custom-url"},
        ]

        for override in cases:
            payload = {**DEFAULTS, **override}
            response = self.client.put(self.url, payload, format="json")

            self.assertEqual(
                response.status_code,
                status.HTTP_400_BAD_REQUEST,
                msg=f"{override} should be rejected",
            )

        self.assertFalse(BookPreference.objects.exists())

    def test_owner_is_always_the_authenticated_user(self):
        response = self.client.put(
            self.url,
            {
                **DEFAULTS,
                "owner": self.bob.id,
                "id": 999,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(
            BookPreference.objects.filter(owner=self.alice).exists()
        )
        self.assertFalse(BookPreference.objects.filter(owner=self.bob).exists())

    def test_users_cannot_read_or_change_each_other_preferences(self):
        self.client.put(
            self.url,
            {"cover_style": "memories", "theme_id": "blush", "font_style": "editorial"},
            format="json",
        )

        self.client.force_login(self.bob)
        bob_response = self.client.get(self.url)
        self.assertEqual(bob_response.json(), DEFAULTS)

        self.client.put(
            self.url,
            {"cover_style": "night", "theme_id": "night", "font_style": "modern"},
            format="json",
        )
        self.client.force_login(self.alice)

        alice_response = self.client.get(self.url)
        self.assertEqual(
            alice_response.json(),
            {
                "cover_style": "memories",
                "theme_id": "blush",
                "font_style": "editorial",
            },
        )
        self.assertEqual(BookPreference.objects.count(), 2)

    def test_query_parameters_cannot_target_another_user(self):
        self.client.put(
            self.url,
            {"cover_style": "minimal", "theme_id": "minimal", "font_style": "modern"},
            format="json",
        )

        response = self.client.get(f"{self.url}?owner={self.bob.id}")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["cover_style"], "minimal")

    def test_delete_restores_defaults(self):
        self.client.put(
            self.url,
            {"cover_style": "night", "theme_id": "ocean", "font_style": "handwritten"},
            format="json",
        )

        response = self.client.delete(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json(), DEFAULTS)
        self.assertFalse(BookPreference.objects.exists())
        self.assertEqual(self.client.get(self.url).json(), DEFAULTS)

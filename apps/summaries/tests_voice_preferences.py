"""API tests for per-user companion voice preferences."""

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .models import CompanionVoicePreference

User = get_user_model()

DEFAULTS = {
    "gender": "feminine",
    "language": "fr-FR",
    "rate": 1.0,
}


class CompanionVoicePreferenceAPITestCase(APITestCase):
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
        self.url = reverse("summaries-companion-voice-preferences")
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
        self.assertFalse(CompanionVoicePreference.objects.exists())

    def test_saves_and_restores_voice_settings(self):
        payload = {
            "gender": "masculine",
            "language": "en-US",
            "rate": 1.25,
        }

        response = self.client.put(self.url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json(), payload)
        preference = CompanionVoicePreference.objects.get(owner=self.alice)
        self.assertEqual(preference.gender, "masculine")
        self.assertEqual(preference.language, "en-US")
        self.assertEqual(preference.rate, 1.25)

        refreshed = self.client.get(self.url)
        self.assertEqual(refreshed.json(), payload)

    def test_accepts_an_integer_rate_and_returns_a_float(self):
        response = self.client.put(
            self.url,
            {"gender": "feminine", "language": "fr-FR", "rate": 1},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["rate"], 1.0)

    def test_patch_updates_only_supplied_fields(self):
        self.client.put(
            self.url,
            {"gender": "masculine", "language": "en-US", "rate": 1.5},
            format="json",
        )

        response = self.client.patch(
            self.url,
            {"gender": "feminine"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.json(),
            {"gender": "feminine", "language": "en-US", "rate": 1.5},
        )

    def test_put_requires_every_allowed_field(self):
        response = self.client.put(
            self.url,
            {"gender": "feminine", "language": "fr-FR"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("rate", response.json())
        self.assertFalse(CompanionVoicePreference.objects.exists())

    def test_rejects_unsupported_values(self):
        cases = [
            {"gender": "robot"},
            {"language": "de-DE"},
            {"rate": 1.1},
            {"rate": 0.5},
            {"rate": 3},
        ]

        for override in cases:
            payload = {**DEFAULTS, **override}
            response = self.client.put(self.url, payload, format="json")

            self.assertEqual(
                response.status_code,
                status.HTTP_400_BAD_REQUEST,
                msg=f"{override} should be rejected",
            )

        self.assertFalse(CompanionVoicePreference.objects.exists())

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
        self.assertNotIn("owner", response.json())
        self.assertTrue(
            CompanionVoicePreference.objects.filter(owner=self.alice).exists()
        )
        self.assertFalse(
            CompanionVoicePreference.objects.filter(owner=self.bob).exists()
        )

    def test_users_cannot_read_or_change_each_other_preferences(self):
        self.client.put(
            self.url,
            {"gender": "masculine", "language": "en-US", "rate": 1.25},
            format="json",
        )

        self.client.force_login(self.bob)
        self.assertEqual(self.client.get(self.url).json(), DEFAULTS)

        self.client.put(
            self.url,
            {"gender": "feminine", "language": "fr-FR", "rate": 0.75},
            format="json",
        )
        self.client.force_login(self.alice)

        self.assertEqual(
            self.client.get(self.url).json(),
            {"gender": "masculine", "language": "en-US", "rate": 1.25},
        )
        self.assertEqual(CompanionVoicePreference.objects.count(), 2)

    def test_query_parameters_cannot_target_another_user(self):
        self.client.put(
            self.url,
            {"gender": "masculine", "language": "en-US", "rate": 1.5},
            format="json",
        )

        response = self.client.get(f"{self.url}?owner={self.bob.id}")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["gender"], "masculine")

    def test_delete_restores_defaults(self):
        self.client.put(
            self.url,
            {"gender": "masculine", "language": "en-US", "rate": 0.75},
            format="json",
        )

        response = self.client.delete(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json(), DEFAULTS)
        self.assertFalse(CompanionVoicePreference.objects.exists())
        self.assertEqual(self.client.get(self.url).json(), DEFAULTS)

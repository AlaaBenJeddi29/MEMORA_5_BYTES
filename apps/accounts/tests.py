"""Tests for accounts authentication and user management.

Covers only this task's scope: registration, login, logout, current-user
retrieval, password validation, CSRF cookie handling, and account
authorization. Django's built-in test tools (DRF APITestCase) are used.
"""

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

User = get_user_model()


def registration_payload(**overrides):
    payload = {
        "username": "newuser",
        "email": "newuser@example.com",
        "password": "S3cure-Passw0rd!",
        "password_confirm": "S3cure-Passw0rd!",
    }
    payload.update(overrides)
    return payload


class RegistrationTests(APITestCase):
    def test_register_success_creates_user_with_hashed_password(self):
        response = self.client.post(
            reverse("accounts-register"), registration_payload(), format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(username="newuser")
        self.assertTrue(user.check_password("S3cure-Passw0rd!"))
        self.assertNotEqual(user.password, "S3cure-Passw0rd!")  # stored hashed
        # A freshly registered user has no privileges.
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)

    def test_register_response_never_exposes_password(self):
        response = self.client.post(
            reverse("accounts-register"), registration_payload(), format="json"
        )

        self.assertNotIn("password", response.data)
        self.assertNotIn("password_confirm", response.data)
        self.assertEqual(response.data["username"], "newuser")

    def test_register_starts_a_session(self):
        response = self.client.post(
            reverse("accounts-register"), registration_payload(), format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        # The SPA goes straight to the app after signup, so registration must
        # establish the session cookie rather than requiring a second login.
        me = self.client.get(reverse("accounts-me"))
        self.assertEqual(me.status_code, status.HTTP_200_OK)
        self.assertEqual(me.data["username"], "newuser")

    def test_register_rejects_duplicate_username(self):
        User.objects.create_user(username="newuser", password="S3cure-Passw0rd!")

        response = self.client.post(
            reverse("accounts-register"), registration_payload(), format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_register_rejects_duplicate_email_case_insensitive(self):
        User.objects.create_user(
            username="someone", email="NewUser@example.com", password="S3cure-Passw0rd!"
        )

        response = self.client.post(
            reverse("accounts-register"), registration_payload(), format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_register_rejects_password_mismatch(self):
        response = self.client.post(
            reverse("accounts-register"),
            registration_payload(password_confirm="different-pass"),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password_confirm", response.data)
        self.assertFalse(User.objects.filter(username="newuser").exists())

    def test_register_rejects_weak_password(self):
        response = self.client.post(
            reverse("accounts-register"),
            registration_payload(password="123", password_confirm="123"),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", response.data)
        self.assertFalse(User.objects.filter(username="newuser").exists())

    def test_register_cannot_self_assign_privileges(self):
        payload = registration_payload(
            is_staff=True,
            is_superuser=True,
            groups=[],
            user_permissions=[],
        )

        response = self.client.post(reverse("accounts-register"), payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(username="newuser")
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)
        self.assertEqual(user.groups.count(), 0)
        self.assertEqual(user.user_permissions.count(), 0)


class LoginTests(APITestCase):
    def setUp(self):
        self.password = "S3cure-Passw0rd!"
        self.user = User.objects.create_user(username="alice", password=self.password)

    def test_login_success_starts_a_session(self):
        response = self.client.post(
            reverse("accounts-login"),
            {"username": "alice", "password": self.password},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["username"], "alice")
        # The session is now authenticated, so /me/ is reachable.
        me = self.client.get(reverse("accounts-me"))
        self.assertEqual(me.status_code, status.HTTP_200_OK)

    def test_login_rejects_wrong_password(self):
        response = self.client.post(
            reverse("accounts-login"),
            {"username": "alice", "password": "wrong-password"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_login_rejects_unknown_user(self):
        response = self.client.post(
            reverse("accounts-login"),
            {"username": "ghost", "password": self.password},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class LogoutTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="alice", password="S3cure-Passw0rd!"
        )

    def test_logout_ends_the_session(self):
        self.client.force_login(self.user)

        response = self.client.post(reverse("accounts-logout"))

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(
            self.client.get(reverse("accounts-me")).status_code,
            status.HTTP_204_NO_CONTENT,
        )

    def test_logout_requires_authentication(self):
        response = self.client.post(reverse("accounts-logout"))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class MeTests(APITestCase):
    def setUp(self):
        self.alice = User.objects.create_user(
            username="alice", email="alice@example.com", password="S3cure-Passw0rd!"
        )
        self.bob = User.objects.create_user(
            username="bob", email="bob@example.com", password="S3cure-Passw0rd!"
        )

    def test_me_returns_204_when_not_authenticated(self):
        response = self.client.get(reverse("accounts-me"))

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(response.content, b"")

    def test_me_returns_only_the_authenticated_users_data(self):
        self.client.force_login(self.alice)

        response = self.client.get(reverse("accounts-me"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["username"], "alice")
        self.assertEqual(response.data["email"], "alice@example.com")
        # Bob's information must never appear in Alice's response.
        self.assertNotEqual(response.data["username"], self.bob.username)
        self.assertNotEqual(response.data["email"], self.bob.email)
        self.assertNotIn("password", response.data)

    def test_me_cannot_be_used_to_modify_an_account(self):
        self.client.force_login(self.alice)

        for method in ("put", "patch", "delete"):
            response = getattr(self.client, method)(
                reverse("accounts-me"), {"username": "hacked"}, format="json"
            )
            self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)


class CsrfTests(APITestCase):
    def test_csrf_endpoint_sets_the_csrftoken_cookie(self):
        response = self.client.get(reverse("accounts-csrf"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("csrftoken", response.cookies)

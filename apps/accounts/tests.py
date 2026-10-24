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

    def test_register_starts_a_session(self):
        response = self.client.post(
            reverse("accounts-register"), registration_payload(), format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        # The user is authenticated immediately, so protected endpoints work.
        me = self.client.get(reverse("accounts-me"))
        self.assertEqual(me.status_code, status.HTTP_200_OK)
        self.assertEqual(me.data["username"], "newuser")

    def test_register_response_never_exposes_password(self):
        response = self.client.post(
            reverse("accounts-register"), registration_payload(), format="json"
        )

        self.assertNotIn("password", response.data)
        self.assertNotIn("password_confirm", response.data)
        self.assertEqual(response.data["username"], "newuser")

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
            status.HTTP_403_FORBIDDEN,
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

    def test_me_requires_authentication(self):
        response = self.client.get(reverse("accounts-me"))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

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


class AdminUserManagementTests(APITestCase):
    """Staff-only list/edit/delete endpoints under /api/accounts/users/."""

    password = "S3cure-Passw0rd!"

    def setUp(self):
        self.staff = User.objects.create_user(
            username="staff", password=self.password, is_staff=True
        )
        self.plain = User.objects.create_user(
            username="plain", email="plain@example.com", password=self.password
        )
        self.list_url = reverse("accounts-user-list")

    def detail_url(self, user):
        return reverse("accounts-user-detail", args=[user.pk])

    def test_non_staff_cannot_list_edit_or_delete(self):
        self.client.force_login(self.plain)

        self.assertEqual(
            self.client.get(self.list_url).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.patch(
                self.detail_url(self.staff), {"first_name": "Hacked"}, format="json"
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.delete(self.detail_url(self.staff)).status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_staff_can_edit_user_without_touching_password(self):
        self.client.force_login(self.staff)

        response = self.client.patch(
            self.detail_url(self.plain),
            {
                "username": "renamed",
                "email": "renamed@example.com",
                "first_name": "Renamed",
                "last_name": "User",
                "is_active": False,
                "is_staff": True,
                "password": "should-be-ignored",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn("password", response.data)
        self.plain.refresh_from_db()
        self.assertEqual(self.plain.username, "renamed")
        self.assertEqual(self.plain.email, "renamed@example.com")
        self.assertEqual(self.plain.first_name, "Renamed")
        self.assertFalse(self.plain.is_active)
        self.assertTrue(self.plain.is_staff)
        # The password never changes through this endpoint.
        self.assertTrue(self.plain.check_password(self.password))

    def test_duplicate_username_or_email_returns_400(self):
        User.objects.create_user(
            username="Taken", email="taken@example.com", password=self.password
        )
        self.client.force_login(self.staff)

        username_response = self.client.patch(
            self.detail_url(self.plain), {"username": "taken"}, format="json"
        )
        self.assertEqual(username_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("username", username_response.data)

        email_response = self.client.patch(
            self.detail_url(self.plain), {"email": "TAKEN@example.com"}, format="json"
        )
        self.assertEqual(email_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", email_response.data)

    def test_cannot_delete_yourself(self):
        self.client.force_login(self.staff)

        response = self.client.delete(self.detail_url(self.staff))

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(User.objects.filter(pk=self.staff.pk).exists())

    def test_cannot_delete_the_last_superuser(self):
        root = User.objects.create_superuser(
            username="root", email="root@example.com", password=self.password
        )
        self.client.force_login(self.staff)

        response = self.client.delete(self.detail_url(root))

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(User.objects.filter(pk=root.pk).exists())

    def test_staff_can_delete_another_user(self):
        self.client.force_login(self.staff)

        response = self.client.delete(self.detail_url(self.plain))

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(User.objects.filter(pk=self.plain.pk).exists())

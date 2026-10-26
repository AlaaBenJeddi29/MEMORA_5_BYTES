"""Security tests for the accounts app.

Scope: the custom user model and its role groups, registration plus email
verification, login with brute-force lockout, logout, own-profile editing,
role/permission enforcement (API and Django admin), password change/reset,
CSRF rejection and the custom error pages.
"""

import re
import smtplib
from datetime import timedelta
from unittest.mock import patch

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.core.management import call_command
from django.test import Client, RequestFactory, TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from .forms import DEACTIVATED_MESSAGE, VERIFY_EMAIL_MESSAGE
from .roles import (
    ADMIN_GROUP,
    MANAGER_GROUP,
    MEMBER_GROUP,
    ensure_role_groups,
)

User = get_user_model()

PASSWORD = "S3cure-Passw0rd!"
NEW_PASSWORD = "N3w-Secure-Passw0rd!"


def registration_payload(**overrides):
    payload = {
        "username": "newuser",
        "email": "newuser@example.com",
        "password": PASSWORD,
        "password_confirm": PASSWORD,
    }
    payload.update(overrides)
    return payload


def make_user(username="alice", **extra):
    extra.setdefault("email", f"{username}@example.com")
    extra.setdefault("password", PASSWORD)
    return User.objects.create_user(username=username, **extra)


# ---------------------------------------------------------------------------
# Model, roles and lockout bookkeeping
# ---------------------------------------------------------------------------


class UserModelTests(TestCase):
    def setUp(self):
        ensure_role_groups()

    def test_new_user_defaults_are_safe(self):
        user = make_user("newcomer")

        self.assertEqual(user.role, User.Role.MEMBER)
        self.assertTrue(user.email_verified)
        self.assertEqual(user.failed_login_attempts, 0)
        self.assertIsNone(user.locked_until)
        self.assertFalse(user.is_locked)
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)
        self.assertNotEqual(user.password, PASSWORD)
        self.assertTrue(user.password.startswith("pbkdf2_sha256$"))
        self.assertTrue(user.check_password(PASSWORD))

    def test_superuser_is_always_an_administrator(self):
        root = User.objects.create_superuser(
            username="root", email="root@example.com", password=PASSWORD
        )

        self.assertEqual(root.role, User.Role.ADMIN)
        self.assertTrue(root.is_staff)
        self.assertEqual(
            list(root.groups.values_list("name", flat=True)), [ADMIN_GROUP]
        )

    def test_role_is_synchronised_to_enforced_groups(self):
        user = make_user("manager", role=User.Role.MANAGER)
        self.assertEqual(
            list(user.groups.values_list("name", flat=True)), [MANAGER_GROUP]
        )

        user.role = User.Role.ADMIN
        user.save(update_fields=["role"])

        self.assertEqual(
            list(user.groups.values_list("name", flat=True)), [ADMIN_GROUP]
        )

    def test_role_groups_carry_real_permissions(self):
        member = User.objects.get(pk=make_user("member").pk)
        manager = User.objects.get(
            pk=make_user("manager", role=User.Role.MANAGER).pk
        )
        admin = User.objects.get(
            pk=make_user("admin", role=User.Role.ADMIN).pk
        )

        self.assertTrue(member.has_perm("journal.add_journalentry"))
        self.assertFalse(member.has_perm("accounts.view_user"))
        self.assertFalse(member.has_perm("accounts.change_user"))

        self.assertTrue(manager.has_perm("accounts.view_user"))
        self.assertTrue(manager.has_perm("journal.view_journalentry"))
        self.assertFalse(manager.has_perm("accounts.change_user"))
        self.assertFalse(manager.has_perm("journal.add_journalentry"))

        self.assertTrue(admin.has_perm("accounts.manage_users"))
        self.assertTrue(admin.has_perm("accounts.change_user"))
        self.assertTrue(admin.has_perm("accounts.delete_user"))

    def test_member_group_stays_within_the_content_apps(self):
        group = Group.objects.get(name=MEMBER_GROUP)
        codenames = set(group.permissions.values_list("codename", flat=True))
        app_labels = set(
            group.permissions.values_list(
                "content_type__app_label", flat=True
            )
        )

        self.assertIn("journal", app_labels)
        self.assertNotIn("accounts", app_labels)
        self.assertNotIn("manage_users", codenames)

    def test_setup_roles_command_promotes_an_existing_user(self):
        user = make_user("promoted")

        call_command("setup_roles", admin=["promoted"], verbosity=0)

        user.refresh_from_db()
        self.assertEqual(user.role, User.Role.ADMIN)
        self.assertTrue(user.is_staff)
        self.assertEqual(
            list(user.groups.values_list("name", flat=True)), [ADMIN_GROUP]
        )

    @override_settings(LOGIN_LOCKOUT_MAX_ATTEMPTS=5, LOGIN_LOCKOUT_SECONDS=900)
    def test_failed_logins_lock_the_account_after_the_limit(self):
        user = make_user("lockme")

        results = [user.register_failed_login() for _ in range(5)]

        self.assertEqual(results, [False, False, False, False, True])
        user.refresh_from_db()
        self.assertTrue(user.is_locked)
        self.assertIsNotNone(user.locked_until)
        self.assertGreater(user.locked_until, timezone.now())
        self.assertEqual(user.failed_login_attempts, 0)
        self.assertIn("Too many failed sign-in attempts", user.lockout_message())

    def test_expired_lockout_starts_a_fresh_window(self):
        user = make_user("unlockme")
        user.locked_until = timezone.now() - timedelta(seconds=1)
        user.failed_login_attempts = 4
        user.save(update_fields=["locked_until", "failed_login_attempts"])

        locked = user.register_failed_login()

        user.refresh_from_db()
        self.assertFalse(locked)
        self.assertFalse(user.is_locked)
        self.assertIsNone(user.locked_until)
        self.assertEqual(user.failed_login_attempts, 1)

    def test_reset_failed_logins_clears_counters(self):
        user = make_user("resetme")
        user.failed_login_attempts = 3
        user.locked_until = timezone.now() + timedelta(minutes=1)
        user.save(update_fields=["failed_login_attempts", "locked_until"])

        user.reset_failed_logins()

        user.refresh_from_db()
        self.assertEqual(user.failed_login_attempts, 0)
        self.assertIsNone(user.locked_until)


# ---------------------------------------------------------------------------
# Registration and email verification
# ---------------------------------------------------------------------------


class RegistrationTests(APITestCase):
    def test_register_creates_an_inactive_unverified_member(self):
        response = self.client.post(
            reverse("accounts-register"), registration_payload(), format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(username="newuser")
        self.assertFalse(user.is_active)
        self.assertFalse(user.email_verified)
        self.assertEqual(user.role, User.Role.MEMBER)
        self.assertTrue(user.check_password(PASSWORD))
        self.assertNotIn("password", response.data)
        self.assertNotIn("password_confirm", response.data)

    def test_register_sends_exactly_one_verification_email(self):
        response = self.client.post(
            reverse("accounts-register"), registration_payload(), format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["email_sent"])
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("verify-email", mail.outbox[0].body)
        self.assertEqual(mail.outbox[0].to, ["newuser@example.com"])

    def test_register_does_not_start_a_session(self):
        self.client.post(
            reverse("accounts-register"), registration_payload(), format="json"
        )

        self.assertEqual(
            self.client.get(reverse("accounts-me")).status_code,
            status.HTTP_204_NO_CONTENT,
        )

    def test_register_requires_an_email(self):
        response = self.client.post(
            reverse("accounts-register"),
            registration_payload(email=""),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)

    def test_register_rejects_an_invalid_email(self):
        response = self.client.post(
            reverse("accounts-register"),
            registration_payload(email="not-an-email"),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)

    def test_register_rejects_a_duplicate_username_case_insensitively(self):
        make_user("NewUser", email="other@example.com")

        response = self.client.post(
            reverse("accounts-register"), registration_payload(), format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("username", response.data)

    def test_register_rejects_a_duplicate_email_case_insensitively(self):
        make_user("someone", email="NewUser@Example.com")

        response = self.client.post(
            reverse("accounts-register"), registration_payload(), format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)

    def test_register_rejects_a_password_mismatch(self):
        response = self.client.post(
            reverse("accounts-register"),
            registration_payload(password_confirm="Different-Passw0rd!"),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password_confirm", response.data)
        self.assertFalse(User.objects.filter(username="newuser").exists())

    def test_register_rejects_a_weak_password(self):
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
            role=User.Role.ADMIN,
            groups=[],
            user_permissions=[],
        )

        response = self.client.post(
            reverse("accounts-register"), payload, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(username="newuser")
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)
        self.assertEqual(user.role, User.Role.MEMBER)
        self.assertFalse(user.groups.filter(name=ADMIN_GROUP).exists())

    def test_register_survives_an_email_outage(self):
        with patch(
            "apps.accounts.views.send_verification_email",
            side_effect=smtplib.SMTPException("mail down"),
        ):
            response = self.client.post(
                reverse("accounts-register"),
                registration_payload(),
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertFalse(response.data["email_sent"])
        self.assertTrue(User.objects.filter(username="newuser").exists())
        self.assertEqual(len(mail.outbox), 0)


class EmailVerificationTests(APITestCase):
    def setUp(self):
        self.pending = make_user(
            "pending", is_active=False, email_verified=False
        )

    def verification_url(self, user=None, token=None):
        user = user or self.pending
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = token or default_token_generator.make_token(user)
        return reverse(
            "verify_email", kwargs={"uidb64": uid, "token": token}
        )

    def test_valid_link_activates_the_account(self):
        response = self.client.get(self.verification_url())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTemplateUsed(response, "accounts/verify_email.html")
        self.assertContains(response, "Votre email est vérifié")
        self.pending.refresh_from_db()
        self.assertTrue(self.pending.is_active)
        self.assertTrue(self.pending.email_verified)

    def test_verified_user_can_then_sign_in(self):
        self.client.get(self.verification_url())

        response = self.client.post(
            reverse("accounts-login"),
            {"username": "pending", "password": PASSWORD},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_invalid_token_does_not_activate_the_account(self):
        response = self.client.get(self.verification_url(token="not-a-token"))

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertContains(
            response, "n’est pas valable", status_code=status.HTTP_400_BAD_REQUEST
        )
        self.pending.refresh_from_db()
        self.assertFalse(self.pending.is_active)
        self.assertFalse(self.pending.email_verified)

    def test_malformed_uid_returns_a_clear_error(self):
        url = reverse(
            "verify_email",
            kwargs={"uidb64": "abc", "token": "not-a-token"},
        )

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_resend_sends_a_new_link_for_an_unverified_account(self):
        response = self.client.post(
            reverse("accounts-resend-verification"),
            {"email": "pending@example.com"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("verify-email", mail.outbox[0].body)
        self.pending.refresh_from_db()
        self.assertFalse(self.pending.is_active)

    def test_resend_is_silent_for_verified_accounts(self):
        make_user("verified", email="verified@example.com")

        response = self.client.post(
            reverse("accounts-resend-verification"),
            {"email": "verified@example.com"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 0)

    def test_resend_does_not_reveal_whether_an_email_exists(self):
        make_user("verified", email="verified@example.com")

        known = self.client.post(
            reverse("accounts-resend-verification"),
            {"email": "verified@example.com"},
            format="json",
        )
        unknown = self.client.post(
            reverse("accounts-resend-verification"),
            {"email": "nobody@example.com"},
            format="json",
        )

        self.assertEqual(known.status_code, unknown.status_code)
        self.assertEqual(known.data["detail"], unknown.data["detail"])
        self.assertEqual(len(mail.outbox), 0)

    def test_resend_rejects_an_invalid_email(self):
        response = self.client.post(
            reverse("accounts-resend-verification"),
            {"email": "not-an-email"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_verification_link_is_get_only(self):
        response = self.client.post(self.verification_url())

        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)


# ---------------------------------------------------------------------------
# Login, lockout and logout
# ---------------------------------------------------------------------------


class LoginTests(APITestCase):
    def setUp(self):
        self.user = make_user("alice")

    def login(self, password=PASSWORD, username="alice"):
        return self.client.post(
            reverse("accounts-login"),
            {"username": username, "password": password},
            format="json",
        )

    def test_login_success_starts_a_session(self):
        response = self.login()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["username"], "alice")
        self.assertEqual(response.data["role"], User.Role.MEMBER)
        self.assertNotIn("password", response.data)
        self.assertEqual(
            self.client.get(reverse("accounts-me")).status_code,
            status.HTTP_200_OK,
        )

    def test_wrong_password_increments_the_failure_counter(self):
        response = self.login(password="wrong-password")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Invalid username or password.", str(response.data))
        self.user.refresh_from_db()
        self.assertEqual(self.user.failed_login_attempts, 1)
        self.assertFalse(self.user.is_locked)

    def test_unknown_user_gets_the_same_generic_message(self):
        response = self.login(username="ghost", password="wrong-password")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Invalid username or password.", str(response.data))

    def test_unverified_account_is_told_to_verify_its_email(self):
        make_user(
            "pending",
            email="pending@example.com",
            is_active=False,
            email_verified=False,
        )

        response = self.login(username="pending")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn(VERIFY_EMAIL_MESSAGE, str(response.data))

    def test_deactivated_account_gets_a_clear_message(self):
        make_user(
            "disabled",
            email="disabled@example.com",
            is_active=False,
            email_verified=True,
        )

        response = self.login(username="disabled")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn(DEACTIVATED_MESSAGE, str(response.data))

    @override_settings(LOGIN_LOCKOUT_MAX_ATTEMPTS=5)
    def test_five_failures_lock_the_account(self):
        for attempt in range(4):
            response = self.login(password="wrong-password")
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertNotIn("Too many failed", str(response.data))

        fifth = self.login(password="wrong-password")

        self.assertEqual(fifth.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Too many failed sign-in attempts", str(fifth.data))
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_locked)

    @override_settings(LOGIN_LOCKOUT_MAX_ATTEMPTS=5)
    def test_lockout_blocks_even_the_correct_password(self):
        for _ in range(5):
            self.login(password="wrong-password")

        response = self.login()

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Too many failed sign-in attempts", str(response.data))
        self.assertEqual(
            self.client.get(reverse("accounts-me")).status_code,
            status.HTTP_204_NO_CONTENT,
        )

    def test_expired_lockout_allows_sign_in_again(self):
        self.user.locked_until = timezone.now() - timedelta(seconds=1)
        self.user.failed_login_attempts = 0
        self.user.save(update_fields=["locked_until", "failed_login_attempts"])

        response = self.login()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertIsNone(self.user.locked_until)
        self.assertEqual(self.user.failed_login_attempts, 0)

    def test_successful_login_resets_previous_failures(self):
        self.user.failed_login_attempts = 3
        self.user.save(update_fields=["failed_login_attempts"])

        response = self.login()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.failed_login_attempts, 0)


class LogoutTests(APITestCase):
    def setUp(self):
        self.user = make_user("alice")

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

    def test_logout_is_post_only(self):
        self.client.force_login(self.user)

        response = self.client.get(reverse("accounts-logout"))

        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)


# ---------------------------------------------------------------------------
# Own profile
# ---------------------------------------------------------------------------


class MeTests(APITestCase):
    def setUp(self):
        self.alice = make_user("alice", email="alice@example.com")
        self.bob = make_user("bob", email="bob@example.com")

    def test_anonymous_session_gets_204(self):
        response = self.client.get(reverse("accounts-me"))

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(response.content, b"")

    def test_anonymous_cannot_patch_a_profile(self):
        response = self.client.patch(
            reverse("accounts-me"), {"first_name": "Hacked"}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_me_returns_only_the_authenticated_user(self):
        self.client.force_login(self.alice)

        response = self.client.get(reverse("accounts-me"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["username"], "alice")
        self.assertEqual(response.data["email"], "alice@example.com")
        self.assertNotIn("password", response.data)
        self.assertNotEqual(response.data["username"], self.bob.username)

    def test_owner_can_edit_their_own_profile(self):
        self.client.force_login(self.alice)

        response = self.client.patch(
            reverse("accounts-me"),
            {
                "first_name": "Alice",
                "last_name": "Martin",
                "email": "ALICE@Example.com",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.alice.refresh_from_db()
        self.assertEqual(self.alice.first_name, "Alice")
        self.assertEqual(self.alice.last_name, "Martin")
        self.assertEqual(self.alice.email, "alice@example.com")

    def test_profile_edit_cannot_escalate_privileges(self):
        self.client.force_login(self.alice)

        response = self.client.patch(
            reverse("accounts-me"),
            {
                "username": "renamed",
                "role": User.Role.ADMIN,
                "is_staff": True,
                "is_superuser": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.alice.refresh_from_db()
        self.assertEqual(self.alice.username, "alice")
        self.assertEqual(self.alice.role, User.Role.MEMBER)
        self.assertFalse(self.alice.is_staff)
        self.assertFalse(self.alice.is_superuser)

    def test_profile_edit_rejects_another_users_email(self):
        self.client.force_login(self.alice)

        response = self.client.patch(
            reverse("accounts-me"),
            {"email": self.bob.email},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)

    def test_profile_edit_requires_an_email(self):
        self.client.force_login(self.alice)

        response = self.client.patch(
            reverse("accounts-me"), {"email": " "}, format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)


# ---------------------------------------------------------------------------
# Roles on the user-management API and the Django admin
# ---------------------------------------------------------------------------


class RolePermissionTests(APITestCase):
    def setUp(self):
        ensure_role_groups()
        self.member = make_user("member")
        self.manager = make_user("manager", role=User.Role.MANAGER)
        self.admin = make_user("admin", role=User.Role.ADMIN)
        self.superuser = User.objects.create_superuser(
            username="root", email="root@example.com", password=PASSWORD
        )
        self.list_url = reverse("accounts-user-list")

    def detail_url(self, user):
        return reverse("accounts-user-detail", args=[user.pk])

    def test_anonymous_cannot_list_accounts(self):
        self.assertEqual(
            self.client.get(self.list_url).status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_members_cannot_list_accounts(self):
        self.client.force_login(self.member)

        self.assertEqual(
            self.client.get(self.list_url).status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_managers_and_administrators_can_list_accounts(self):
        for user in (self.manager, self.admin, self.superuser):
            with self.subTest(role=user.role):
                self.client.force_login(user)
                response = self.client.get(self.list_url)
                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.assertGreaterEqual(len(response.data), 4)
                self.assertNotIn("password", response.data[0])

    def test_staff_flag_alone_does_not_grant_user_management(self):
        staff_member = make_user("staffmember", is_staff=True)
        self.client.force_login(staff_member)

        self.assertEqual(
            self.client.get(self.list_url).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.patch(
                self.detail_url(self.member),
                {"first_name": "Nope"},
                format="json",
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_members_cannot_edit_or_delete_accounts(self):
        self.client.force_login(self.member)

        self.assertEqual(
            self.client.patch(
                self.detail_url(self.admin),
                {"first_name": "Hacked"},
                format="json",
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.delete(self.detail_url(self.admin)).status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_managers_have_read_only_access(self):
        self.client.force_login(self.manager)

        self.assertEqual(
            self.client.patch(
                self.detail_url(self.member),
                {"first_name": "Hacked"},
                format="json",
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.delete(self.detail_url(self.member)).status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_unauthorized_requests_do_not_reveal_which_ids_exist(self):
        self.client.force_login(self.member)

        existing = self.client.patch(
            self.detail_url(self.admin), {"first_name": "X"}, format="json"
        )
        missing = self.client.patch(
            self.detail_url(type("Missing", (), {"pk": 999999})()),
            {"first_name": "X"},
            format="json",
        )

        self.assertEqual(existing.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(missing.status_code, status.HTTP_403_FORBIDDEN)

    def test_administrator_can_edit_an_account_without_touching_password(self):
        self.client.force_login(self.admin)

        response = self.client.patch(
            self.detail_url(self.member),
            {
                "username": "renamed",
                "email": "renamed@example.com",
                "first_name": "Renamed",
                "role": User.Role.MANAGER,
                "is_active": False,
                "password": "should-be-ignored",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn("password", response.data)
        self.member.refresh_from_db()
        self.assertEqual(self.member.username, "renamed")
        self.assertEqual(self.member.email, "renamed@example.com")
        self.assertEqual(self.member.role, User.Role.MANAGER)
        self.assertFalse(self.member.is_active)
        self.assertTrue(self.member.check_password(PASSWORD))
        self.assertEqual(
            list(self.member.groups.values_list("name", flat=True)),
            [MANAGER_GROUP],
        )

    def test_administrator_cannot_modify_a_superuser(self):
        self.client.force_login(self.admin)

        patch_response = self.client.patch(
            self.detail_url(self.superuser),
            {"first_name": "Nope"},
            format="json",
        )
        delete_response = self.client.delete(self.detail_url(self.superuser))

        self.assertEqual(patch_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(delete_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(User.objects.filter(pk=self.superuser.pk).exists())

    def test_superuser_can_modify_an_administrator(self):
        self.client.force_login(self.superuser)

        response = self.client.patch(
            self.detail_url(self.admin),
            {"first_name": "Ada"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.admin.refresh_from_db()
        self.assertEqual(self.admin.first_name, "Ada")

    def test_administrator_can_delete_another_account(self):
        self.client.force_login(self.admin)

        response = self.client.delete(self.detail_url(self.member))

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(User.objects.filter(pk=self.member.pk).exists())

    def test_nobody_can_delete_their_own_account(self):
        self.client.force_login(self.admin)

        response = self.client.delete(self.detail_url(self.admin))

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(User.objects.filter(pk=self.admin.pk).exists())

    def test_the_superuser_account_cannot_be_removed_by_an_administrator(self):
        self.client.force_login(self.admin)

        response = self.client.delete(self.detail_url(self.superuser))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(User.objects.filter(pk=self.superuser.pk).exists())

    def test_duplicate_username_or_email_returns_400(self):
        make_user("taken", email="taken@example.com")
        self.client.force_login(self.admin)

        username_response = self.client.patch(
            self.detail_url(self.member),
            {"username": "TAKEN"},
            format="json",
        )
        email_response = self.client.patch(
            self.detail_url(self.member),
            {"email": "TAKEN@example.com"},
            format="json",
        )

        self.assertEqual(
            username_response.status_code, status.HTTP_400_BAD_REQUEST
        )
        self.assertIn("username", username_response.data)
        self.assertEqual(email_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", email_response.data)


class AdminSiteAccessTests(TestCase):
    def setUp(self):
        self.member = make_user("member")
        self.root = User.objects.create_superuser(
            username="root", email="root@example.com", password=PASSWORD
        )

    def test_anonymous_is_redirected_to_the_admin_login(self):
        response = self.client.get(reverse("admin:index"))

        self.assertEqual(response.status_code, status.HTTP_302_FOUND)
        self.assertIn(reverse("admin:login"), response["Location"])

    def test_non_staff_member_cannot_reach_the_admin_by_url(self):
        self.client.force_login(self.member)

        response = self.client.get(reverse("admin:index"))

        self.assertEqual(response.status_code, status.HTTP_302_FOUND)
        self.assertIn(reverse("admin:login"), response["Location"])

    def test_superuser_can_open_the_admin(self):
        self.client.force_login(self.root)

        response = self.client.get(reverse("admin:index"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_admin_is_not_mounted_at_the_default_path(self):
        self.assertTrue(settings.ADMIN_URL)
        if settings.ADMIN_URL != "admin/":
            response = self.client.get("/admin/")
            self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_staff_outside_the_admin_role_can_still_use_the_django_admin(self):
        staff_member = make_user("staffmember", is_staff=True)
        self.client.force_login(staff_member)

        response = self.client.get(reverse("admin:index"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Server-rendered authentication pages
# ---------------------------------------------------------------------------


class HtmlLoginTests(TestCase):
    def setUp(self):
        self.user = make_user("alice")

    def login(self, password=PASSWORD, username="alice", **extra):
        data = {"username": username, "password": password}
        return self.client.post(reverse("login"), data, **extra)

    def test_login_page_is_accessible_and_marks_every_field(self):
        response = self.client.get(reverse("login"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTemplateUsed(response, "accounts/login.html")
        self.assertContains(response, 'aria-describedby="id_username-desc"')
        self.assertContains(response, 'for="id_username"')
        self.assertContains(response, "csrfmiddlewaretoken")

    def test_valid_credentials_redirect_into_the_journal(self):
        response = self.login()

        self.assertEqual(response.status_code, status.HTTP_302_FOUND)
        self.assertEqual(response["Location"], settings.LOGIN_REDIRECT_URL)

    def test_next_parameter_is_honoured(self):
        response = self.login(next="/people/")

        self.assertEqual(response.status_code, status.HTTP_302_FOUND)
        self.assertEqual(response["Location"], "/people/")

    def test_wrong_password_shows_a_friendly_error(self):
        response = self.login(password="wrong-password")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertContains(response, "Invalid username or password.")

    def test_unverified_account_gets_a_verification_message(self):
        make_user(
            "pending",
            email="pending@example.com",
            is_active=False,
            email_verified=False,
        )

        response = self.login(username="pending")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertContains(response, "Verify your email address")

    def test_deactivated_account_gets_a_clear_message(self):
        make_user(
            "disabled",
            email="disabled@example.com",
            is_active=False,
            email_verified=True,
        )

        response = self.login(username="disabled")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertContains(response, "deactivated")

    @override_settings(LOGIN_LOCKOUT_MAX_ATTEMPTS=5)
    def test_html_login_also_locks_after_five_failures(self):
        for _ in range(5):
            self.login(password="wrong-password")

        response = self.login()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertContains(response, "Too many failed sign-in attempts")
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_locked)

    def test_html_logout_is_post_only_and_ends_the_session(self):
        self.client.force_login(self.user)

        self.assertEqual(
            self.client.get(reverse("logout")).status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
        )

        response = self.client.post(reverse("logout"))

        self.assertEqual(response.status_code, status.HTTP_302_FOUND)
        self.assertEqual(response["Location"], settings.LOGOUT_REDIRECT_URL)
        self.assertEqual(
            self.client.get(reverse("accounts-me")).status_code,
            status.HTTP_204_NO_CONTENT,
        )


class HtmlPasswordTests(TestCase):
    def setUp(self):
        self.user = make_user("alice", email="alice@example.com")

    def test_password_change_requires_authentication(self):
        response = self.client.get(reverse("password_change"))

        self.assertEqual(response.status_code, status.HTTP_302_FOUND)
        self.assertIn(reverse("login"), response["Location"])
        self.assertIn("next=", response["Location"])

    def test_password_change_page_has_labelled_fields(self):
        self.client.force_login(self.user)

        response = self.client.get(reverse("password_change"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTemplateUsed(response, "accounts/password_change.html")
        self.assertContains(response, 'for="id_old_password"')
        self.assertContains(
            response, 'aria-describedby="id_old_password-desc"'
        )

    def test_old_password_is_required(self):
        self.client.force_login(self.user)

        response = self.client.post(
            reverse("password_change"),
            {
                "old_password": "wrong-old-password",
                "new_password1": NEW_PASSWORD,
                "new_password2": NEW_PASSWORD,
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(PASSWORD))

    def test_password_change_updates_the_hash(self):
        self.client.force_login(self.user)

        response = self.client.post(
            reverse("password_change"),
            {
                "old_password": PASSWORD,
                "new_password1": NEW_PASSWORD,
                "new_password2": NEW_PASSWORD,
            },
        )

        self.assertEqual(response.status_code, status.HTTP_302_FOUND)
        self.assertEqual(
            response["Location"], reverse("password_change_done")
        )
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(NEW_PASSWORD))
        self.assertFalse(self.user.check_password(PASSWORD))

    def test_weak_new_password_is_rejected(self):
        self.client.force_login(self.user)

        response = self.client.post(
            reverse("password_change"),
            {
                "old_password": PASSWORD,
                "new_password1": "short",
                "new_password2": "short",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(PASSWORD))

    def test_password_reset_sends_a_link_and_completes_the_flow(self):
        response = self.client.post(
            reverse("password_reset"), {"email": "alice@example.com"}
        )

        self.assertEqual(response.status_code, status.HTTP_302_FOUND)
        self.assertEqual(response["Location"], reverse("password_reset_done"))
        self.assertEqual(len(mail.outbox), 1)

        match = re.search(r"/accounts/reset/[^\s]+", mail.outbox[0].body)
        self.assertIsNotNone(match)
        reset_path = match.group(0)

        response = self.client.get(reset_path, follow=True)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        final_url = response.redirect_chain[-1][0]

        response = self.client.post(
            final_url,
            {"new_password1": NEW_PASSWORD, "new_password2": NEW_PASSWORD},
        )

        self.assertEqual(response.status_code, status.HTTP_302_FOUND)
        self.assertEqual(
            response["Location"], reverse("password_reset_complete")
        )
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(NEW_PASSWORD))

    def test_password_reset_does_not_send_for_unknown_email(self):
        response = self.client.post(
            reverse("password_reset"), {"email": "nobody@example.com"}
        )

        self.assertEqual(response.status_code, status.HTTP_302_FOUND)
        self.assertEqual(response["Location"], reverse("password_reset_done"))
        self.assertEqual(len(mail.outbox), 0)

    def test_password_reset_rejects_an_invalid_token(self):
        uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        url = reverse(
            "password_reset_confirm",
            kwargs={"uidb64": uid, "token": "invalid-token"},
        )

        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertContains(response, "plus valide")

    def test_password_reset_survives_an_email_outage(self):
        with patch(
            "django.contrib.auth.forms.PasswordResetForm.send_mail",
            side_effect=smtplib.SMTPException("mail down"),
        ):
            response = self.client.post(
                reverse("password_reset"), {"email": "alice@example.com"}
            )

        self.assertEqual(response.status_code, status.HTTP_302_FOUND)
        self.assertEqual(response["Location"], reverse("password_reset_done"))
        self.assertEqual(len(mail.outbox), 0)


# ---------------------------------------------------------------------------
# CSRF
# ---------------------------------------------------------------------------


class CsrfTests(APITestCase):
    def setUp(self):
        self.user = make_user("alice")

    def test_csrf_endpoint_sets_the_cookie(self):
        response = self.client.get(reverse("accounts-csrf"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("csrftoken", response.cookies)

    def test_api_login_without_a_token_is_rejected(self):
        client = APIClient(enforce_csrf_checks=True)

        response = client.post(
            reverse("accounts-login"),
            {"username": "alice", "password": PASSWORD},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("CSRF", str(response.data))

    def test_api_login_with_a_token_succeeds(self):
        client = APIClient(enforce_csrf_checks=True)
        client.get(reverse("accounts-csrf"))
        token = client.cookies["csrftoken"].value

        response = client.post(
            reverse("accounts-login"),
            {"username": "alice", "password": PASSWORD},
            format="json",
            HTTP_X_CSRFTOKEN=token,
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_authenticated_post_without_a_token_is_rejected(self):
        client = APIClient(enforce_csrf_checks=True)
        client.force_login(self.user)

        response = client.post(reverse("accounts-logout"))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_html_login_without_a_token_uses_the_custom_csrf_page(self):
        client = Client(enforce_csrf_checks=True)

        response = client.post(
            reverse("login"),
            {"username": "alice", "password": PASSWORD},
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTemplateUsed(response, "403_csrf.html")
        self.assertContains(
            response, "session check failed", status_code=403
        )

    def test_html_login_with_a_token_succeeds(self):
        client = Client(enforce_csrf_checks=True)
        client.get(reverse("login"))
        token = client.cookies["csrftoken"].value

        response = client.post(
            reverse("login"),
            {"username": "alice", "password": PASSWORD},
            HTTP_X_CSRFTOKEN=token,
        )

        self.assertEqual(response.status_code, status.HTTP_302_FOUND)


# ---------------------------------------------------------------------------
# Error pages
# ---------------------------------------------------------------------------


class ErrorPageTests(TestCase):
    @override_settings(DEBUG=False)
    def test_unknown_url_renders_the_custom_404_page(self):
        response = self.client.get("/this-route-does-not-exist/")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTemplateUsed(response, "404.html")
        self.assertContains(
            response, "We couldn’t find that page", status_code=404
        )

    @override_settings(DEBUG=False)
    def test_unhandled_exception_renders_the_custom_500_page(self):
        client = Client(raise_request_exception=False)

        with patch(
            "apps.accounts.views.MeView.get",
            side_effect=RuntimeError("boom"),
        ):
            response = client.get(reverse("accounts-me"))

        self.assertEqual(
            response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR
        )
        self.assertTemplateUsed(response, "500.html")

    def test_custom_403_handler_is_wired(self):
        from config import views as config_views

        request = RequestFactory().get("/")

        with patch("config.views.render") as render:
            config_views.handler403(request, Exception("denied"))

        render.assert_called_once_with(request, "403.html", status=403)

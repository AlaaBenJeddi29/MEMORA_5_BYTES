"""Custom user model for MEMORA.

The project keeps the historical ``auth_user`` table so the existing rows and
every foreign key that points at them survive the switch from Django's default
user model to this one. The switch is recorded by ``accounts.0001_initial``
(state only on existing databases) and the new columns arrive in ``0002``.

Roles are a human-facing label (``role``) backed by real Django groups and
permissions; see :mod:`apps.accounts.roles`.
"""

from datetime import timedelta

from django.conf import settings
from django.contrib.auth.models import AbstractUser, Group, Permission
from django.db import models
from django.utils import timezone


class User(AbstractUser):
    """Application user with a role, email verification and login lockout."""

    class Role(models.TextChoices):
        ADMIN = "ADMIN", "Administrator"
        MANAGER = "MANAGER", "Manager"
        MEMBER = "MEMBER", "Member"

    # Keep the historical ``auth_user`` primary key type so the state-only
    # initial migration does not need to rebuild the table.
    id = models.AutoField(primary_key=True, verbose_name="ID")

    # Registration requires a unique email; every auth flow (verification,
    # password reset) needs a real address to reach.
    email = models.EmailField(unique=True, blank=False)

    role = models.CharField(
        max_length=16,
        choices=Role.choices,
        default=Role.MEMBER,
    )

    # Pre-existing and staff-created accounts are trusted; self-registration
    # explicitly starts unverified and inactive until the emailed link is used.
    email_verified = models.BooleanField(default=True)

    failed_login_attempts = models.PositiveSmallIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)

    # Custom related names keep these reverse accessors distinct from the
    # swapped-out ``auth.User`` accessors.
    groups = models.ManyToManyField(
        Group,
        related_name="accounts_users",
        blank=True,
        help_text=(
            "The groups this user belongs to. A user will get all permissions "
            "granted to each of their groups."
        ),
        verbose_name="groups",
    )
    user_permissions = models.ManyToManyField(
        Permission,
        related_name="accounts_user_permissions",
        blank=True,
        help_text="Specific permissions for this user.",
        verbose_name="user permissions",
    )

    class Meta:
        db_table = "auth_user"
        swappable = "AUTH_USER_MODEL"
        permissions = [
            ("manage_users", "Can list and manage user accounts"),
        ]

    def save(self, *args, **kwargs):
        # A superuser is always an Administrator; the role drives the group.
        if self.is_superuser and self.role != self.Role.ADMIN:
            self.role = self.Role.ADMIN
        super().save(*args, **kwargs)

    @property
    def is_locked(self):
        return bool(self.locked_until and self.locked_until > timezone.now())

    def lockout_message(self):
        """Human-readable remaining lockout time (API and HTML login share it)."""
        remaining = max(
            0, int((self.locked_until - timezone.now()).total_seconds())
        )
        minutes = max(1, (remaining + 59) // 60)
        return (
            "Too many failed sign-in attempts. "
            f"Try again in {minutes} minute{'s' if minutes != 1 else ''}."
        )

    def register_failed_login(self):
        """Count a failed password attempt and lock after the configured limit.

        Returns ``True`` when this attempt triggered (or extended) a lockout.
        """
        now = timezone.now()
        attempts = self.failed_login_attempts
        if self.locked_until and self.locked_until <= now:
            # A previous lockout has expired: start a fresh window.
            attempts = 0
            self.locked_until = None

        attempts += 1
        max_attempts = getattr(settings, "LOGIN_LOCKOUT_MAX_ATTEMPTS", 5)
        locked = attempts >= max_attempts
        if locked:
            seconds = getattr(settings, "LOGIN_LOCKOUT_SECONDS", 900)
            self.locked_until = now + timedelta(seconds=seconds)
            attempts = 0

        self.failed_login_attempts = attempts
        self.save(update_fields=["failed_login_attempts", "locked_until"])
        return locked

    def reset_failed_logins(self):
        """Clear the failed-attempt counter after a successful login."""
        if self.failed_login_attempts or self.locked_until:
            self.failed_login_attempts = 0
            self.locked_until = None
            self.save(update_fields=["failed_login_attempts", "locked_until"])

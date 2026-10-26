"""Signal handlers for the accounts app."""

from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import User
from .roles import sync_user_role_group


@receiver(post_save, sender=User)
def assign_role_group(sender, instance, raw=False, **kwargs):
    """Keep the role group in sync whenever a user is created or re-roled."""
    if raw:
        return
    update_fields = kwargs.get("update_fields")
    if (
        update_fields is not None
        and "role" not in update_fields
        and "is_superuser" not in update_fields
    ):
        # Login bookkeeping (last_login, lockout counters) does not change
        # role membership, so skip the extra queries.
        return
    sync_user_role_group(instance)

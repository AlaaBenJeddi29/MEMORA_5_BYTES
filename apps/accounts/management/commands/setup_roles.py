"""Create the role groups and synchronise memberships.

Run after ``migrate`` on a fresh deployment (``post_migrate`` already calls the
same helpers, so this is mostly a repair/demo tool). ``--admin`` promotes an
existing account so the jury can sign into the Django admin and the user
management API without creating another superuser.
"""

from django.core.management.base import BaseCommand, CommandError

from apps.accounts.models import User
from apps.accounts.roles import (
    ROLE_GROUP_NAMES,
    ensure_role_groups,
    sync_all_users,
)


class Command(BaseCommand):
    help = "Create Administrators/Managers/Members groups and sync user roles."

    def add_arguments(self, parser):
        parser.add_argument(
            "--admin",
            action="append",
            default=[],
            metavar="USERNAME",
            help="Promote an existing user to Administrator (repeatable).",
        )

    def handle(self, *args, **options):
        ensure_role_groups()

        for username in options["admin"]:
            user = User.objects.filter(username=username).first()
            if user is None:
                raise CommandError(f"No user named {username!r} exists.")
            user.role = User.Role.ADMIN
            user.is_staff = True
            user.save(update_fields=["role", "is_staff"])
            self.stdout.write(
                self.style.SUCCESS(f"{username} is now an Administrator.")
            )

        sync_all_users()
        self.stdout.write(
            self.style.SUCCESS(
                "Role groups ready: " + ", ".join(ROLE_GROUP_NAMES) + "."
            )
        )

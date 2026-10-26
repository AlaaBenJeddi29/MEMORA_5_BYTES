"""Create the three role groups (permissions are assigned post-migrate)."""

from django.db import migrations

ROLE_GROUPS = ("Administrators", "Managers", "Members")


def create_role_groups(apps, schema_editor):
    Group = apps.get_model("auth", "Group")
    for name in ROLE_GROUPS:
        Group.objects.get_or_create(name=name)


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0002_alter_user_options_user_email_verified_and_more"),
    ]

    operations = [
        migrations.RunPython(create_role_groups, migrations.RunPython.noop),
    ]

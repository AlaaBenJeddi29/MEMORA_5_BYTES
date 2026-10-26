"""Role to Django group/permission wiring.

``User.role`` is the label shown to humans; the authority itself comes from
real Django groups and permissions. ``ensure_role_groups`` is idempotent and
runs after every migration (see ``AccountsConfig.ready``) and from the
``setup_roles`` management command.
"""

from django.contrib.auth.models import Group, Permission

from .models import User

ADMIN_GROUP = "Administrators"
MANAGER_GROUP = "Managers"
MEMBER_GROUP = "Members"

ROLE_GROUP_NAMES = (ADMIN_GROUP, MANAGER_GROUP, MEMBER_GROUP)

ROLE_GROUPS = {
    User.Role.ADMIN: ADMIN_GROUP,
    User.Role.MANAGER: MANAGER_GROUP,
    User.Role.MEMBER: MEMBER_GROUP,
}

CONTENT_APPS = ("journal", "audio", "summaries", "media_library", "people")


def group_for_user(user):
    """Return the group name that matches a user's effective role."""
    if user.is_superuser:
        return ADMIN_GROUP
    return ROLE_GROUPS.get(user.role, MEMBER_GROUP)


def ensure_role_groups():
    """Create the three role groups and their permission sets.

    Administrators receive every permission; Managers are read-only across
    the site (all ``view_*`` permissions); Members receive the content
    permissions for their own journal, media, summaries, audio and people.
    Idempotent, so it is safe to run after every migrate.
    """
    groups = {
        name: Group.objects.get_or_create(name=name)[0]
        for name in ROLE_GROUP_NAMES
    }

    groups[ADMIN_GROUP].permissions.set(Permission.objects.all())
    groups[MANAGER_GROUP].permissions.set(
        Permission.objects.filter(codename__startswith="view_")
    )
    groups[MEMBER_GROUP].permissions.set(
        Permission.objects.filter(content_type__app_label__in=CONTENT_APPS)
    )
    return groups


def sync_user_role_group(user):
    """Make the user's role groups match ``user.role`` exactly."""
    group = Group.objects.filter(name=group_for_user(user)).first()
    if group is None:
        # Groups are created after migrate; a no-op keeps createsuperuser and
        # early data migrations working.
        return
    user.groups.remove(
        *user.groups.filter(name__in=ROLE_GROUP_NAMES).exclude(pk=group.pk)
    )
    user.groups.add(group)


def sync_all_users():
    """Re-apply group membership to every user (used after migrations)."""
    for user in User.objects.only("pk", "role", "is_superuser"):
        sync_user_role_group(user)

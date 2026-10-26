from django.apps import AppConfig
from django.db.models.signals import post_migrate


def _sync_roles(sender, **kwargs):
    # Imported lazily: models and permissions only exist once the registry
    # and the auth tables are ready.
    from .roles import ensure_role_groups, sync_all_users

    ensure_role_groups()
    sync_all_users()


class AccountsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.accounts"

    def ready(self):
        from . import signals  # noqa: F401  (connects the role-group signal)

        post_migrate.connect(_sync_roles, sender=self)

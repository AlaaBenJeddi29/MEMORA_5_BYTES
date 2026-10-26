"""DRF permission classes backed by Django groups/permissions."""

from rest_framework.authentication import CSRFCheck
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import SAFE_METHODS, BasePermission


class EnforceCSRF(BasePermission):
    """Require a CSRF token on unsafe requests, even without a session.

    DRF's SessionAuthentication only enforces CSRF once the request is already
    authenticated, which would leave login, registration and resend requests
    open to cross-site POSTs. This permission closes that gap.
    """

    message = "CSRF verification failed. Reload the page and try again."

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True

        check = CSRFCheck(lambda request: None)
        check.process_request(request)
        reason = check.process_view(request, None, (), {})
        if reason:
            raise PermissionDenied(f"CSRF Failed: {reason}")
        return True


class CanViewUsers(BasePermission):
    """Allow listing accounts to Administrators and Managers."""

    message = "You do not have permission to view user accounts."

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and (
                user.is_superuser
                or user.has_perm("accounts.view_user")
            )
        )


class IsAdministrator(BasePermission):
    """Allow account changes only to the Administrator role."""

    message = "Only an administrator can manage user accounts."

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and (
                user.is_superuser
                or user.has_perm("accounts.manage_users")
            )
        )

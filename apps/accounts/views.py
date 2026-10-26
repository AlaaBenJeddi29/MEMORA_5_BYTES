"""Session-based authentication and user-management views.

API routes (mounted under ``/api/accounts/``):

    POST   register/            -> create an inactive account + email a link
    POST   verify-email/resend/ -> re-send the verification link
    POST   login/               -> start a session (lockout after 5 failures)
    POST   logout/              -> end the session (authenticated)
    GET    me/                  -> the session user, or 204 when signed out
    PATCH  me/                  -> edit your own profile (authenticated)
    GET    csrf/                -> ensure the CSRF cookie is set
    GET    users/               -> list users (view_user permission)
    PATCH  users/<pk>/          -> edit a user (change_user permission)
    DELETE users/<pk>/          -> delete a user (delete_user permission)

HTML routes live in ``config/urls.py`` (login, logout, password change,
password reset, email verification) and use Django's built-in auth views with
the accessible templates in ``templates/accounts/``.
"""

import logging
import smtplib

from django.contrib import messages as django_messages
from django.contrib.auth import get_user_model
from django.contrib.auth import login as auth_login
from django.contrib.auth import logout as auth_logout
from django.contrib.auth import views as auth_views
from django.contrib.auth.tokens import default_token_generator
from django.shortcuts import get_object_or_404, redirect, render
from django.utils.decorators import method_decorator
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .emails import send_verification_email
from .models import User
from .permissions import CanViewUsers, EnforceCSRF
from .serializers import (
    AdminUserSerializer,
    EmailAddressSerializer,
    LoginSerializer,
    ProfileSerializer,
    RegisterSerializer,
    UserSerializer,
)

logger = logging.getLogger("apps.accounts")


class RegisterView(APIView):
    """Create an inactive Member and email a verification link.

    No session is started: the account stays inactive until the token in the
    email is used, which proves the address belongs to the person signing up.
    """

    permission_classes = [AllowAny, EnforceCSRF]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        email_sent = True
        try:
            send_verification_email(user, request)
        except (smtplib.SMTPException, OSError) as exc:
            email_sent = False
            logger.error(
                "Verification email failed for user_id=%s (%s).",
                user.pk,
                type(exc).__name__,
            )

        logger.info("Account registered: user_id=%s username=%s", user.pk, user.username)
        return Response(
            {
                "detail": (
                    "Account created. Check your email to verify it before "
                    "signing in."
                ),
                "email": user.email,
                "email_sent": email_sent,
            },
            status=status.HTTP_201_CREATED,
        )


class LoginView(APIView):
    """Authenticate and start a session for the user."""

    permission_classes = [AllowAny, EnforceCSRF]

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={"request": request})
        try:
            serializer.is_valid(raise_exception=True)
        except DRFValidationError:
            logger.warning(
                "Failed sign-in attempt for username=%r",
                str(request.data.get("username", ""))[:150],
            )
            raise
        user = serializer.validated_data["user"]
        auth_login(request, user)
        logger.info("User signed in: user_id=%s username=%s", user.pk, user.username)
        return Response(UserSerializer(user).data, status=status.HTTP_200_OK)


class LogoutView(APIView):
    """End the current user's session."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        auth_logout(request)
        logger.info("User signed out: user_id=%s", user.pk)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    """Read or edit the session user's own profile.

    There is intentionally no id argument, so this endpoint can never be used
    to read or modify another account. Returning 204 for an anonymous session
    lets the SPA probe auth state without a console error.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        if not request.user.is_authenticated:
            return Response(status=status.HTTP_204_NO_CONTENT)
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        if not request.user.is_authenticated:
            return Response(
                {"detail": "Authentication is required."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = ProfileSerializer(
            request.user,
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        logger.info("Profile updated: user_id=%s", request.user.pk)
        return Response(UserSerializer(request.user).data)


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfView(APIView):
    """Set the CSRF cookie so the SPA can read it and send X-CSRFToken."""

    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"detail": "CSRF cookie set."})


@api_view(["POST"])
@permission_classes([AllowAny, EnforceCSRF])
def resend_verification(request):
    """Re-send the verification link without revealing whether the email exists."""
    serializer = EmailAddressSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    email = serializer.validated_data["email"].strip().lower()

    user = User.objects.filter(email__iexact=email, email_verified=False).first()
    if user is not None:
        try:
            send_verification_email(user, request)
        except (smtplib.SMTPException, OSError) as exc:
            logger.error(
                "Verification resend failed for user_id=%s (%s).",
                user.pk,
                type(exc).__name__,
            )

    return Response(
        {
            "detail": (
                "If an unverified account uses that email, a new verification "
                "link has been sent."
            )
        }
    )


@require_GET
def verify_email(request, uidb64, token):
    """Activate an account when the emailed token is valid."""
    try:
        user_id = force_str(urlsafe_base64_decode(uidb64))
        user = User.objects.get(pk=user_id)
    except (TypeError, ValueError, OverflowError, User.DoesNotExist):
        user = None

    valid = user is not None and default_token_generator.check_token(user, token)
    if valid:
        if not user.email_verified or not user.is_active:
            user.email_verified = True
            user.is_active = True
            user.save(update_fields=["email_verified", "is_active"])
        logger.info("Email verified: user_id=%s", user.pk)
        context = {"verified": True, "username": user.username}
        return render(request, "accounts/verify_email.html", context)

    logger.warning("Invalid email verification link used.")
    return render(
        request,
        "accounts/verify_email.html",
        {"verified": False},
        status=status.HTTP_400_BAD_REQUEST,
    )


class SafePasswordResetView(auth_views.PasswordResetView):
    """Password reset request page that survives an SMTP outage.

    Django's stock view lets the SMTP exception escape as a 500. Here the
    failure is logged and the user sees a clear message while still landing on
    the neutral "check your email" page (no account enumeration).
    """

    def form_valid(self, form):
        try:
            return super().form_valid(form)
        except (smtplib.SMTPException, OSError) as exc:
            logger.error(
                "Password reset email could not be sent (%s).",
                type(exc).__name__,
            )
            django_messages.error(
                self.request,
                "The reset email could not be sent. Please try again later.",
            )
            return redirect(self.success_url)


@api_view(["GET"])
@permission_classes([IsAuthenticated, CanViewUsers])
def user_list(request):
    """List every account. Administrators and Managers; no passwords."""
    users = User.objects.order_by("username")
    return Response(AdminUserSerializer(users, many=True).data)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def user_detail(request, pk):
    """Edit or delete one account, gated by object-safe admin permissions."""
    if request.method == "PATCH":
        if not (
            request.user.is_superuser
            or request.user.has_perm("accounts.change_user")
        ):
            logger.warning(
                "Permission denied: user_id=%s tried to edit user_id=%s",
                request.user.pk,
                pk,
            )
            return Response(
                {"detail": "You do not have permission to edit user accounts."},
                status=status.HTTP_403_FORBIDDEN,
            )
        user = get_object_or_404(User, pk=pk)
        if user.is_superuser and not request.user.is_superuser:
            return Response(
                {"detail": "Only a superuser can modify a superuser account."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = AdminUserSerializer(user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        logger.info(
            "User updated: user_id=%s by user_id=%s", user.pk, request.user.pk
        )
        return Response(serializer.data)

    if not (
        request.user.is_superuser
        or request.user.has_perm("accounts.delete_user")
    ):
        logger.warning(
            "Permission denied: user_id=%s tried to delete user_id=%s",
            request.user.pk,
            pk,
        )
        return Response(
            {"detail": "You do not have permission to delete user accounts."},
            status=status.HTTP_403_FORBIDDEN,
        )
    user = get_object_or_404(User, pk=pk)
    if user.is_superuser and not request.user.is_superuser:
        return Response(
            {"detail": "Only a superuser can delete a superuser account."},
            status=status.HTTP_403_FORBIDDEN,
        )
    if user.pk == request.user.pk:
        return Response(
            {"detail": "You cannot delete your own account."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if user.is_superuser and not User.objects.filter(is_superuser=True).exclude(
        pk=user.pk
    ).exists():
        return Response(
            {"detail": "You cannot delete the last superuser."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    user.delete()
    logger.info("User deleted: user_id=%s by user_id=%s", pk, request.user.pk)
    return Response(status=status.HTTP_204_NO_CONTENT)

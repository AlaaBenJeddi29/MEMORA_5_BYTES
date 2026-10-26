"""Session-based authentication views for the accounts app.

These endpoints match the project's existing REST_FRAMEWORK configuration
(``SessionAuthentication`` + ``IsAuthenticated``). No tokens, no extra
dependencies, and no custom user model.

    POST   /api/accounts/register/     -> create a user (public)
    POST   /api/accounts/login/        -> start a session (public)
    POST   /api/accounts/logout/       -> end the session (authenticated)
    GET    /api/accounts/me/           -> the authenticated user only (authenticated)
    GET    /api/accounts/csrf/         -> ensure the CSRF cookie is set (public)
    GET    /api/accounts/users/        -> list users (staff only)
    PATCH  /api/accounts/users/<pk>/   -> edit a user (staff only)
    DELETE /api/accounts/users/<pk>/   -> delete a user (staff only)
    POST /api/accounts/register/  -> create a user and start a session (public)
    POST /api/accounts/login/     -> start a session (public)
    POST /api/accounts/logout/    -> end the session (authenticated)
    GET  /api/accounts/me/        -> the session user, or 204 when signed out
    GET  /api/accounts/csrf/      -> ensure the CSRF cookie is set (public)

While authenticated, unsafe requests must echo the ``csrftoken`` cookie in
``X-CSRFToken``. The Vite dev proxy keeps the SPA and the API on one origin, so
session and CSRF cookies stay first-party.
"""

from django.contrib.auth import get_user_model
from django.contrib.auth import login as auth_login
from django.contrib.auth import logout as auth_logout
from django.shortcuts import get_object_or_404
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import (
    AdminUserSerializer,
    LoginSerializer,
    RegisterSerializer,
    UserSerializer,
)

User = get_user_model()


class RegisterView(APIView):
    """Create a new user account and start a session.

    Open to anyone; cannot set privileges. Starting the session here matches
    the SPA, which navigates straight to the app after a successful signup.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        # Log the new user in so the SPA is authenticated right after signup.
        # Log the user in right away so the session cookie is set,
        # exactly like LoginView does — no separate login step needed.
        auth_login(request, user)
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


class LoginView(APIView):
    """Authenticate and start a session for the user."""

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        auth_login(request, serializer.validated_data["user"])
        return Response(UserSerializer(request.user).data, status=status.HTTP_200_OK)


class LogoutView(APIView):
    """End the current user's session."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        auth_logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    """Return the session's user, or 204 when there is no session.

    There is intentionally no id argument, so a user can never read or
    modify another user's account through this endpoint. Returning 204 for an
    anonymous session lets the SPA probe auth state without a console error.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        if not request.user.is_authenticated:
            return Response(status=status.HTTP_204_NO_CONTENT)
        return Response(UserSerializer(request.user).data)


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfView(APIView):
    """Set the CSRF cookie so the SPA can read it and send X-CSRFToken."""

    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"detail": "CSRF cookie set."})


@api_view(["GET"])
@permission_classes([IsAdminUser])
def user_list(request):
    """List every account. Staff only; passwords are never serialized."""
    users = User.objects.order_by("username")
    return Response(AdminUserSerializer(users, many=True).data)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAdminUser])
def user_detail(request, pk):
    """Edit or delete one account. Staff only."""
    user = get_object_or_404(User, pk=pk)

    if request.method == "PATCH":
        serializer = AdminUserSerializer(user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

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
    return Response(status=status.HTTP_204_NO_CONTENT)

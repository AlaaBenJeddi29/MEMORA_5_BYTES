"""Session-based authentication views for the accounts app.

These endpoints match the project's existing REST_FRAMEWORK configuration
(``SessionAuthentication`` + ``IsAuthenticated``). No tokens, no extra
dependencies, and no custom user model.

    POST /api/accounts/register/  -> create a user (public)
    POST /api/accounts/login/     -> start a session (public)
    POST /api/accounts/logout/    -> end the session (authenticated)
    GET  /api/accounts/me/        -> the authenticated user only (authenticated)
    GET  /api/accounts/csrf/      -> ensure the CSRF cookie is set (public)

CSRF + React note
-----------------
While authenticated, any unsafe request (POST/PUT/PATCH/DELETE) must echo the
``csrftoken`` cookie back in the ``X-CSRFToken`` header and be sent with
credentials (``fetch(url, { credentials: "include" })``). The SPA can call
``GET /api/accounts/csrf/`` first to make sure that cookie exists (Django
keeps ``CSRF_COOKIE_HTTPONLY = False`` by default so JavaScript can read it).
Login and register are anonymous requests, so DRF does not enforce CSRF on
them.

The simplest development setup is a dev-server proxy so the React app and the
API share an origin; then the session cookie is sent automatically and no
cross-origin CSRF configuration is needed.
"""

from django.contrib.auth import login as auth_login
from django.contrib.auth import logout as auth_logout
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import LoginSerializer, RegisterSerializer, UserSerializer


class RegisterView(APIView):
    """Create a new user account and start a session.

    Open to anyone; cannot set privileges. Starting the session here matches
    the SPA, which navigates straight to the app after a successful signup.
    """
    """Create a new user account and immediately start a session."""

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
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

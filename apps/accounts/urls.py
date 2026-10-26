"""URL routes for the accounts app (session authentication).

Mounted by ``config/urls.py`` under ``/api/accounts/``. Named routes so the
frontend and tests never hard-code paths. The server-rendered login, logout,
password change/reset and verification pages live in ``config/urls.py``.
"""

from django.urls import path

from .views import (
    CsrfView,
    LoginView,
    LogoutView,
    MeView,
    RegisterView,
    resend_verification,
    user_detail,
    user_list,
)

urlpatterns = [
    path("register/", RegisterView.as_view(), name="accounts-register"),
    path(
        "resend-verification/",
        resend_verification,
        name="accounts-resend-verification",
    ),
    path("login/", LoginView.as_view(), name="accounts-login"),
    path("logout/", LogoutView.as_view(), name="accounts-logout"),
    path("me/", MeView.as_view(), name="accounts-me"),
    path("csrf/", CsrfView.as_view(), name="accounts-csrf"),
    path("users/", user_list, name="accounts-user-list"),
    path("users/<int:pk>/", user_detail, name="accounts-user-detail"),
]

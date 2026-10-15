"""URL routes for the accounts app (session authentication).

Mounted by ``config/urls.py`` under ``/api/accounts/``. Named routes so the
frontend and tests never hard-code paths.
"""

from django.urls import path

from .views import CsrfView, LoginView, LogoutView, MeView, RegisterView

urlpatterns = [
    path("register/", RegisterView.as_view(), name="accounts-register"),
    path("login/", LoginView.as_view(), name="accounts-login"),
    path("logout/", LogoutView.as_view(), name="accounts-logout"),
    path("me/", MeView.as_view(), name="accounts-me"),
    path("csrf/", CsrfView.as_view(), name="accounts-csrf"),
]

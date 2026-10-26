"""
Root URL configuration for the MEMORA project.

Everything is mounted from here:

    /<ADMIN_URL>/      Django admin (staff only, non-default path)
    /accounts/...      server-rendered auth pages (login, password reset…)
    /people/           HTML pages for the people module
    /api/accounts/     accounts app
    /api/journal/      journal app
    /api/audio/        audio app
    /api/summaries/    summaries app
    /api/media/        media_library app
    /api/people/       people app

Each app owns its own ``urls.py``; this file only wires them together.

Docs: https://docs.djangoproject.com/en/5.2/topics/http/urls/
"""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.contrib.auth import views as auth_views
from django.urls import include, path, reverse_lazy

from apps.accounts import forms as account_forms
from apps.accounts.views import SafePasswordResetView, verify_email

handler403 = "config.views.handler403"
handler404 = "config.views.handler404"
handler500 = "config.views.handler500"

urlpatterns = [
    path(settings.ADMIN_URL, admin.site.urls),

    # Server-rendered authentication pages. The SPA keeps its own /login and
    # /register routes and talks to /api/accounts/ instead.
    path(
        "accounts/login/",
        auth_views.LoginView.as_view(
            template_name="accounts/login.html",
            form_class=account_forms.AccessibleAuthenticationForm,
        ),
        name="login",
    ),
    path(
        "accounts/logout/",
        auth_views.LogoutView.as_view(),
        name="logout",
    ),
    path(
        "accounts/password/change/",
        auth_views.PasswordChangeView.as_view(
            template_name="accounts/password_change.html",
            form_class=account_forms.AccessiblePasswordChangeForm,
            success_url=reverse_lazy("password_change_done"),
        ),
        name="password_change",
    ),
    path(
        "accounts/password/change/done/",
        auth_views.PasswordChangeDoneView.as_view(
            template_name="accounts/password_change_done.html"
        ),
        name="password_change_done",
    ),
    path(
        "accounts/password/reset/",
        SafePasswordResetView.as_view(
            template_name="accounts/password_reset_form.html",
            form_class=account_forms.AccessiblePasswordResetForm,
            email_template_name="accounts/password_reset_email.txt",
            subject_template_name="accounts/password_reset_subject.txt",
            success_url=reverse_lazy("password_reset_done"),
        ),
        name="password_reset",
    ),
    path(
        "accounts/password/reset/done/",
        auth_views.PasswordResetDoneView.as_view(
            template_name="accounts/password_reset_done.html"
        ),
        name="password_reset_done",
    ),
    path(
        "accounts/reset/<uidb64>/<token>/",
        auth_views.PasswordResetConfirmView.as_view(
            template_name="accounts/password_reset_confirm.html",
            form_class=account_forms.AccessibleSetPasswordForm,
            success_url=reverse_lazy("password_reset_complete"),
        ),
        name="password_reset_confirm",
    ),
    path(
        "accounts/reset/done/",
        auth_views.PasswordResetCompleteView.as_view(
            template_name="accounts/password_reset_complete.html"
        ),
        name="password_reset_complete",
    ),
    path(
        "accounts/verify-email/<uidb64>/<token>/",
        verify_email,
        name="verify_email",
    ),

    # HTML pages for the people module (testing before the React API).
    path("people/", include("apps.people.urls")),

    # API routes, one namespace per app.
    path("api/accounts/", include("apps.accounts.urls")),
    path("api/journal/", include("apps.journal.urls")),
    path("api/audio/", include("apps.audio.urls")),
    path("api/summaries/", include("apps.summaries.urls")),
    path("api/media/", include("apps.media_library.urls")),
    path("api/people/", include("apps.people.api_urls")),
]

# While DEBUG = True, let Django serve uploaded media files during
# development. In production a real web server or cloud storage does this.
# WARNING: this development route is NOT authenticated. Media URLs are
# unguessable capability URLs, not owner-scoped access control; see
# docs/API_CONTRACT.md §3.5 and §4.11 before exposing media elsewhere.
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

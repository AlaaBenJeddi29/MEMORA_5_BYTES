"""Accessible variants of Django's built-in auth forms.

The templates render each field manually; these widgets add the ``class``,
``autocomplete`` and, above all, the ``aria-describedby`` pointing at the
help/error block rendered right below the input.
"""

from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.forms import (
    AuthenticationForm,
    PasswordChangeForm,
    PasswordResetForm,
    SetPasswordForm,
)
from django.core.exceptions import ValidationError

User = get_user_model()

VERIFY_EMAIL_MESSAGE = (
    "Verify your email address before signing in. "
    "Check your inbox for the verification link."
)
DEACTIVATED_MESSAGE = "This account is deactivated. Contact an administrator."


class AccessibleFormMixin:
    """Adds consistent classes and aria-describedby to every field."""

    field_attrs = {}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for name, field in self.fields.items():
            field.widget.attrs.setdefault("class", "input")
            field.widget.attrs.setdefault("aria-describedby", f"id_{name}-desc")
        for name, attrs in self.field_attrs.items():
            if name in self.fields:
                self.fields[name].widget.attrs.update(attrs)


class AccessibleAuthenticationForm(AccessibleFormMixin, AuthenticationForm):
    """Login form that applies the same lockout rules as the API."""

    field_attrs = {
        "username": {"autocomplete": "username", "autofocus": True},
        "password": {"autocomplete": "current-password"},
    }
    def get_invalid_login_error(self):
        return ValidationError(
            "Invalid username or password.", code="invalid_login"
        )

    def clean(self):
        username = self.cleaned_data.get("username")
        password = self.cleaned_data.get("password")

        if username is not None and password:
            user = User.objects.filter(username=username).first()
            if user is not None:
                if user.is_locked:
                    raise ValidationError(user.lockout_message(), code="locked")
                if not user.is_active:
                    if not user.email_verified:
                        raise ValidationError(
                            VERIFY_EMAIL_MESSAGE, code="unverified"
                        )
                    raise ValidationError(
                        DEACTIVATED_MESSAGE, code="inactive"
                    )

            self.user_cache = authenticate(
                self.request, username=username, password=password
            )
            if self.user_cache is None:
                if user is not None and user.register_failed_login():
                    raise ValidationError(
                        user.lockout_message(), code="locked"
                    )
                raise self.get_invalid_login_error()

            user.reset_failed_logins()
            self.confirm_login_allowed(self.user_cache)

        return self.cleaned_data


class AccessiblePasswordChangeForm(AccessibleFormMixin, PasswordChangeForm):
    field_attrs = {
        "old_password": {"autocomplete": "current-password"},
        "new_password1": {"autocomplete": "new-password"},
        "new_password2": {"autocomplete": "new-password"},
    }


class AccessiblePasswordResetForm(AccessibleFormMixin, PasswordResetForm):
    field_attrs = {
        "email": {"autocomplete": "email"},
    }


class AccessibleSetPasswordForm(AccessibleFormMixin, SetPasswordForm):
    field_attrs = {
        "new_password1": {"autocomplete": "new-password"},
        "new_password2": {"autocomplete": "new-password"},
    }

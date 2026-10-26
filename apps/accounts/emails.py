"""Account email helpers (verification links)."""

import logging

from django.conf import settings
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.urls import reverse
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

logger = logging.getLogger("apps.accounts")


def build_verification_url(user, request):
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    path = reverse("verify_email", kwargs={"uidb64": uid, "token": token})
    return request.build_absolute_uri(path)


def send_verification_email(user, request):
    """Send the verification link; callers handle SMTP failures explicitly."""
    url = build_verification_url(user, request)
    subject = "Verify your MEMORA email address"
    message = (
        f"Hello {user.username},\n\n"
        "Thanks for creating a MEMORA account. Open the link below to verify "
        "your email address and activate the account:\n\n"
        f"{url}\n\n"
        "If you did not create this account, you can ignore this message.\n\n"
        "— MEMORA\n"
    )
    send_mail(
        subject,
        message,
        settings.DEFAULT_FROM_EMAIL,
        [user.email],
        fail_silently=False,
    )
    logger.info("Verification email queued for user_id=%s", user.pk)

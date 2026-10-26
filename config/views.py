"""Project-wide error handlers.

These render the friendly templates in ``templates/`` and are used when
``DEBUG = False``. The CSRF handler is wired through ``CSRF_FAILURE_VIEW`` so
an expired or missing token produces the same accessible page instead of
Django's bare debug text.
"""

import logging

from django.shortcuts import render

logger = logging.getLogger(__name__)


def handler403(request, exception):
    return render(request, "403.html", status=403)


def handler404(request, exception):
    return render(request, "404.html", status=404)


def handler500(request):
    return render(request, "500.html", status=500)


def csrf_failure(request, reason=""):
    logger.warning(
        "CSRF verification failed for %s %s: %s",
        request.method,
        request.path,
        reason,
    )
    return render(request, "403_csrf.html", {"reason": reason}, status=403)

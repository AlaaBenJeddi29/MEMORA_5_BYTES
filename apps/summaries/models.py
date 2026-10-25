"""Models for the summaries app.

A Summary is an AI-generated recap of a user's journal entries
over a given date range, produced by the Gemini API.
"""

from django.conf import settings
from django.db import models


class Summary(models.Model):
    """AI-generated summary of journal entries over a date range."""

    class Status(models.TextChoices):
        PENDING    = "pending",    "Pending"
        PROCESSING = "processing", "Processing"
        SUCCEEDED  = "succeeded",  "Succeeded"
        FAILED     = "failed",     "Failed"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="summaries",
    )

    # The date range the user requested.
    date_from = models.DateField()
    date_to   = models.DateField()

    # Number of journal entries that were summarised.
    entry_count = models.PositiveIntegerField(default=0)

    # AI-generated content.
    content = models.TextField(blank=True, null=True)

    # Async processing state (API contract §1.9).
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.PENDING,
    )
    error = models.TextField(blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Summary"
        verbose_name_plural = "Summaries"

    def __str__(self):
        return f"Summary #{self.pk} — {self.owner} ({self.date_from} → {self.date_to})"

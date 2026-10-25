"""Models for the audio app.

An AudioEntry represents a single voice memo uploaded by a user.
It stores the raw file and the AI-produced results (transcript, sentiment).
The ``status`` field follows the async-processing contract defined in
``docs/API_CONTRACT.md`` §1.9.
"""

import os

from django.conf import settings
from django.db import models


def audio_upload_to(instance, filename):
    """Store files at media/audio/<user_id>/<filename> to avoid collisions."""
    return os.path.join("audio", str(instance.owner_id), filename)


class AudioEntry(models.Model):
    """A voice memo uploaded by a user, with async AI processing results."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PROCESSING = "processing", "Processing"
        SUCCEEDED = "succeeded", "Succeeded"
        FAILED = "failed", "Failed"

    class Sentiment(models.TextChoices):
        POSITIVE = "positive", "Positive"
        NEGATIVE = "negative", "Negative"
        NEUTRAL = "neutral", "Neutral"
        MIXED = "mixed", "Mixed"

    # Ownership — every object is owned by exactly one user (§1.3).
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="audio_entries",
    )

    # The raw audio file (stored locally in dev; S3 via boto3 in production).
    file = models.FileField(upload_to=audio_upload_to)

    # Optional duration, filled in after upload when mutagen is available.
    duration_seconds = models.FloatField(null=True, blank=True)

    # AI-produced fields — null until processing succeeds.
    transcript = models.TextField(blank=True, null=True)

    # Detected language code (e.g. "fr", "en", "ar") and human-readable name.
    language_code = models.CharField(max_length=16, blank=True, null=True)
    language_name = models.CharField(max_length=64, blank=True, null=True)

    # Sentiment analysis results.
    sentiment = models.CharField(
        max_length=16,
        choices=Sentiment.choices,
        blank=True,
        null=True,
    )
    sentiment_score = models.FloatField(null=True, blank=True)

    # AI-generated summary of the transcript.
    summary = models.TextField(blank=True, null=True)

    # Async processing state (§1.9).
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.PENDING,
    )
    error = models.TextField(blank=True, null=True)

    # Timestamps.
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Audio entry"
        verbose_name_plural = "Audio entries"

    def __str__(self):
        return f"AudioEntry #{self.pk} — {self.owner} ({self.status})"

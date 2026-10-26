import uuid
from pathlib import Path

from django.conf import settings
from django.db import models
from django.utils import timezone


def media_upload_path(instance, filename):
    """Store each user's media under an unguessable, dated path."""
    suffix = Path(filename).suffix.lower()
    return f"users/{instance.owner_id}/{timezone.now():%Y/%m}/{uuid.uuid4().hex}{suffix}"


class MediaFile(models.Model):
    class MediaType(models.TextChoices):
        ORIGINAL = "original", "Original"
        AI_GENERATED = "ai_generated", "AI generated"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PROCESSING = "processing", "Processing"
        SUCCEEDED = "succeeded", "Succeeded"
        FAILED = "failed", "Failed"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="media_files",
    )
    file = models.ImageField(upload_to=media_upload_path)
    media_type = models.CharField(
        max_length=12,
        choices=MediaType.choices,
        default=MediaType.ORIGINAL,
    )
    prompt = models.TextField(blank=True)
    status = models.CharField(
        max_length=12,
        choices=Status.choices,
        default=Status.SUCCEEDED,
    )

    # Journal provenance uses JournalEntry.photos (related_name
    # "journal_entries") rather than a second competing journal relation.
    summary = models.ForeignKey(
        "summaries.Summary",
        null=True,
        blank=True,
        db_index=True,
        on_delete=models.SET_NULL,
        related_name="media_files",
    )

    # Local generation metadata. Original uploads leave both blank.
    provider = models.CharField(max_length=32, blank=True, default="")
    model = models.CharField(max_length=255, blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "-id")
        indexes = [
            models.Index(fields=("owner", "-created_at"), name="media_owner_created_idx"),
        ]

    def __str__(self):
        return f"{self.get_media_type_display()} media #{self.pk}"

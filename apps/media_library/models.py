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

    # Soft reference to Module 1's JournalEntry. Deliberately not a ForeignKey
    # until that model and its API are owned and confirmed by Module 1.
    journal_entry_id = models.PositiveBigIntegerField(
        null=True,
        blank=True,
        db_index=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at", "-id")
        indexes = [
            models.Index(fields=("owner", "-created_at"), name="media_owner_created_idx"),
        ]

    def __str__(self):
        return f"{self.get_media_type_display()} media #{self.pk}"

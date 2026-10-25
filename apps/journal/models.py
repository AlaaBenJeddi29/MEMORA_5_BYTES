"""Models for the journal app."""

from django.conf import settings
from django.db import models


class JournalEntry(models.Model):
    """A single private journal entry written by a user."""

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="journal_entries",
    )

    title   = models.CharField(max_length=255, blank=True, default="")
    content = models.TextField()
    entry_date = models.DateField()

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-entry_date", "-created_at"]

    def __str__(self):
        return f"JournalEntry #{self.pk} — {self.owner} ({self.entry_date})"

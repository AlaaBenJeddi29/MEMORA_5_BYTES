from django.conf import settings
from django.db import models


class JournalEntry(models.Model):
    """A text journal entry written by a user."""

    id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='journal_entries',
    )
    title = models.CharField(max_length=255)
    text = models.TextField()
    audio_file = models.CharField(max_length=500, blank=True, default='')
    summary_text = models.TextField(blank=True, default='')
    sentiment = models.CharField(max_length=100, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    photos = models.ManyToManyField(
        'media_library.Photo',
        blank=True,
        related_name='journal_entries',
    )

    class Meta:
        ordering = ['-created_at']

    def str(self):
        return f'{self.title} ({self.user})'
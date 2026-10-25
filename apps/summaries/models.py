"""Database models for the summaries app."""

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

MAX_THEMES = 8
MAX_THEME_LENGTH = 64


def validate_themes(value):
    """Validate the JSON list stored in ``Summary.themes``.

    Themes are stored as a JSON array of short strings so the field stays
    portable on SQLite without a separate join table.
    """
    if not isinstance(value, list):
        raise ValidationError("Themes must be a list of strings.")
    if len(value) > MAX_THEMES:
        raise ValidationError(f"At most {MAX_THEMES} themes are allowed.")
    for theme in value:
        if not isinstance(theme, str):
            raise ValidationError("Each theme must be a string.")
        normalized = theme.strip()
        if not normalized:
            raise ValidationError("Themes cannot be empty.")
        if len(normalized) > MAX_THEME_LENGTH:
            raise ValidationError(
                f"Each theme must be at most {MAX_THEME_LENGTH} characters."
            )


class Summary(models.Model):
    """AI-generated recap for a single journal entry.

    ``journal_entry_id`` is deliberately a temporary integer reference, not a
    ForeignKey. Module 1 owns ``JournalEntry``; the relation will be replaced by
    a real FK only after its model contract is agreed.
    """

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="summaries",
    )
    journal_entry_id = models.PositiveBigIntegerField(
        null=True,
        blank=True,
        db_index=True,
        help_text=(
            "Temporary integer reference to the source journal entry. "
            "Replaced by a ForeignKey once Module 1's contract is agreed."
        ),
    )
    summary_text = models.TextField()
    mood = models.CharField(max_length=32, blank=True, default="")
    themes = models.JSONField(default=list, blank=True, validators=[validate_themes])
    illustration_prompt = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(
                fields=["owner", "-created_at"],
                name="summaries_owner_created_idx",
            )
        ]

    def __str__(self):
        if self.journal_entry_id is not None:
            return f"Summary for journal entry {self.journal_entry_id}"
        return f"Summary #{self.pk}"

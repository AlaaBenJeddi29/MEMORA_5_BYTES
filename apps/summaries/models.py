"""Database models for the summaries app."""

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

MAX_THEMES = 8
MAX_THEME_LENGTH = 64

COVER_STYLE_CHOICES = (
    ("classic", "Classic"),
    ("nature", "Nature"),
    ("minimal", "Minimal"),
    ("travel", "Travel"),
    ("memories", "Memories"),
    ("night", "Starry night"),
)

BOOK_THEME_CHOICES = (
    ("paper", "Classic paper"),
    ("nature", "Soothing nature"),
    ("ocean", "Ocean"),
    ("blush", "Powder rose"),
    ("night", "Night"),
    ("minimal", "Minimal"),
)

FONT_STYLE_CHOICES = (
    ("editorial", "Editorial"),
    ("modern", "Modern"),
    ("handwritten", "Handwritten"),
)

COMPANION_VOICE_GENDER_CHOICES = (
    ("feminine", "Feminine"),
    ("masculine", "Masculine"),
)

COMPANION_VOICE_LANGUAGE_CHOICES = (
    ("fr-FR", "French"),
    ("en-US", "English"),
)

COMPANION_VOICE_RATES = (0.75, 1.0, 1.25, 1.5)
COMPANION_VOICE_RATE_CHOICES = tuple(
    (rate, f"{rate:g}x") for rate in COMPANION_VOICE_RATES
)


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

    The source entry lives in Module 1 (``journal.JournalEntry``). The column
    keeps its historical name ``journal_entry_id`` so existing summaries and
    API payloads remain compatible. Deleting an entry keeps the summary and
    clears the link, which preserves user-authored recap content.
    """

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="summaries",
    )
    journal_entry = models.ForeignKey(
        "journal.JournalEntry",
        null=True,
        blank=True,
        db_index=True,
        db_column="journal_entry_id",
        on_delete=models.SET_NULL,
        related_name="summaries",
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


class BookPreference(models.Model):
    """Per-user visual customization of the memory book.

    Only stable style identifiers are stored. The actual colors, patterns, and
    typography live in the frontend theme module, never in the database.
    """

    owner = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="book_preference",
    )
    cover_style = models.CharField(
        max_length=32,
        choices=COVER_STYLE_CHOICES,
        default="classic",
    )
    theme_id = models.CharField(
        max_length=32,
        choices=BOOK_THEME_CHOICES,
        default="paper",
    )
    font_style = models.CharField(
        max_length=32,
        choices=FONT_STYLE_CHOICES,
        default="editorial",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "book preference"
        verbose_name_plural = "book preferences"

    def __str__(self):
        return f"Book preferences for {self.owner}"


class CompanionVoicePreference(models.Model):
    """The caller's preferred reading voice for the AI Memory Companion.

    Only portable settings are stored: gender, language, and speed. The actual
    ``SpeechSynthesisVoice`` depends on the device and is resolved in the
    browser, so a voice name or URI would not be portable across devices.
    """

    owner = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="companion_voice_preference",
    )
    gender = models.CharField(
        max_length=16,
        choices=COMPANION_VOICE_GENDER_CHOICES,
        default="feminine",
    )
    language = models.CharField(
        max_length=8,
        choices=COMPANION_VOICE_LANGUAGE_CHOICES,
        default="fr-FR",
    )
    rate = models.FloatField(
        choices=COMPANION_VOICE_RATE_CHOICES,
        default=1.0,
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "companion voice preference"
        verbose_name_plural = "companion voice preferences"

    def __str__(self):
        return f"Companion voice preferences for {self.owner}"

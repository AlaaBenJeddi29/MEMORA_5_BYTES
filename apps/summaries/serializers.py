"""Serializers for the summaries API.

Manual CRUD accepts the four AI/content fields plus an optional link to one of
the caller's Module 1 journal entries. ``owner`` is always read-only and is
supplied by the view from ``request.user``.
"""

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from apps.journal.models import JournalEntry

from .models import (
    BOOK_THEME_CHOICES,
    COMPANION_VOICE_GENDER_CHOICES,
    COMPANION_VOICE_LANGUAGE_CHOICES,
    COMPANION_VOICE_RATES,
    COVER_STYLE_CHOICES,
    FONT_STYLE_CHOICES,
    BookPreference,
    CompanionVoicePreference,
    Summary,
    validate_themes,
)
from .search import MAX_QUERY_LENGTH
from .services.companion import MAX_QUESTION_LENGTH, MIN_QUESTION_LENGTH

MAX_SUMMARY_TEXT_LENGTH = 4_000
MAX_ILLUSTRATION_PROMPT_LENGTH = 1_000
# Matches JournalEntry's BigAutoField / SQLite INTEGER range.
MAX_JOURNAL_ENTRY_ID = 2**63 - 1


class SummarySerializer(serializers.ModelSerializer):
    owner = serializers.PrimaryKeyRelatedField(read_only=True)
    journal_entry_id = serializers.PrimaryKeyRelatedField(
        source="journal_entry",
        queryset=JournalEntry.objects.all(),
        required=False,
        allow_null=True,
        pk_field=serializers.IntegerField(
            min_value=1,
            max_value=MAX_JOURNAL_ENTRY_ID,
        ),
    )
    summary_text = serializers.CharField(
        max_length=MAX_SUMMARY_TEXT_LENGTH,
        allow_blank=False,
    )
    mood = serializers.CharField(
        max_length=32,
        allow_blank=True,
        required=False,
    )
    themes = serializers.JSONField(required=False)
    illustration_prompt = serializers.CharField(
        max_length=MAX_ILLUSTRATION_PROMPT_LENGTH,
        allow_blank=True,
        required=False,
    )

    class Meta:
        model = Summary
        fields = [
            "id",
            "owner",
            "journal_entry_id",
            "summary_text",
            "mood",
            "themes",
            "illustration_prompt",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "owner", "created_at", "updated_at"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Never let a client link a summary to another user's journal entry.
        request = self.context.get("request")
        field = self.fields["journal_entry_id"]
        if request is not None and request.user.is_authenticated:
            field.queryset = JournalEntry.objects.filter(user=request.user)
        elif request is not None:
            field.queryset = JournalEntry.objects.none()

    def validate_themes(self, value):
        try:
            validate_themes(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages)) from exc
        return value


class SummarySearchQuerySerializer(serializers.Serializer):
    """Validates the local summary search query string."""

    q = serializers.CharField(
        max_length=MAX_QUERY_LENGTH,
        allow_blank=False,
        trim_whitespace=True,
        error_messages={
            "required": "Enter a search query.",
            "blank": "Enter a search query.",
            "max_length": (
                f"Keep the search query to {MAX_QUERY_LENGTH} characters or fewer."
            ),
        },
    )


class SummarySearchHitSerializer(serializers.Serializer):
    """One scored search result, nested around the existing summary shape."""

    summary = SummarySerializer(read_only=True)
    score = serializers.FloatField(read_only=True)
    matched_fields = serializers.ListField(
        child=serializers.CharField(),
        read_only=True,
    )
    matched_terms = serializers.ListField(
        child=serializers.CharField(),
        read_only=True,
    )
    snippet = serializers.CharField(read_only=True, allow_blank=True)


class GenerateSummarySerializer(serializers.Serializer):
    """Only the journal entry ID is accepted for generation."""

    journal_entry_id = serializers.IntegerField(
        min_value=1,
        max_value=MAX_JOURNAL_ENTRY_ID,
    )


class CompanionQuestionSerializer(serializers.Serializer):
    """Validates the question sent to the AI Memory Companion."""

    question = serializers.CharField(
        max_length=MAX_QUESTION_LENGTH,
        min_length=MIN_QUESTION_LENGTH,
        allow_blank=False,
        trim_whitespace=True,
        error_messages={
            "required": "Enter a question about your memories.",
            "blank": "Enter a question about your memories.",
            "min_length": (
                f"Enter a question of at least {MIN_QUESTION_LENGTH} characters."
            ),
            "max_length": (
                f"Keep the question to {MAX_QUESTION_LENGTH} characters or fewer."
            ),
        },
    )


class BookPreferenceSerializer(serializers.ModelSerializer):
    """Validated style identifiers for the owner's memory book.

    ``owner`` is intentionally absent: the view always binds the instance to
    ``request.user`` and ignores any client-supplied ownership field. The
    explicit choices make PUT require every field; PATCH stays partial.
    """

    cover_style = serializers.ChoiceField(choices=COVER_STYLE_CHOICES)
    theme_id = serializers.ChoiceField(choices=BOOK_THEME_CHOICES)
    font_style = serializers.ChoiceField(choices=FONT_STYLE_CHOICES)

    class Meta:
        model = BookPreference
        fields = ["cover_style", "theme_id", "font_style"]


class CompanionVoicePreferenceSerializer(serializers.ModelSerializer):
    """Portable voice settings for the authenticated user's companion.

    Voice names are deliberately not accepted or stored: the actual device
    voice is resolved in the browser. ``owner`` is bound by the view only.
    """

    gender = serializers.ChoiceField(choices=COMPANION_VOICE_GENDER_CHOICES)
    language = serializers.ChoiceField(choices=COMPANION_VOICE_LANGUAGE_CHOICES)
    rate = serializers.FloatField(min_value=0.75, max_value=1.5)

    class Meta:
        model = CompanionVoicePreference
        fields = ["gender", "language", "rate"]

    def validate_rate(self, value):
        if not any(abs(value - rate) < 1e-9 for rate in COMPANION_VOICE_RATES):
            raise serializers.ValidationError("Choose a supported reading speed.")
        return value

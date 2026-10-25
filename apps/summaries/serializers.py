"""Serializers for the summaries API.

Manual CRUD accepts the four AI/content fields plus the temporary
``journal_entry_id``. ``owner`` is always read-only and is supplied by the
view from ``request.user``.
"""

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import Summary, validate_themes

MAX_SUMMARY_TEXT_LENGTH = 4_000
MAX_ILLUSTRATION_PROMPT_LENGTH = 1_000
# Matches Summary.journal_entry_id (PositiveBigIntegerField / SQLite INTEGER).
MAX_JOURNAL_ENTRY_ID = 2**63 - 1


class SummarySerializer(serializers.ModelSerializer):
    owner = serializers.PrimaryKeyRelatedField(read_only=True)
    journal_entry_id = serializers.IntegerField(
        required=False,
        allow_null=True,
        min_value=1,
        max_value=MAX_JOURNAL_ENTRY_ID,
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

    def validate_themes(self, value):
        try:
            validate_themes(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages)) from exc
        return value


class GenerateSummarySerializer(serializers.Serializer):
    """Only the mock journal entry ID is accepted for generation."""

    journal_entry_id = serializers.IntegerField(min_value=1)


class MockJournalEntrySerializer(serializers.Serializer):
    """Read-only picker fields for the temporary Module 3 fixtures.

    Deliberately excludes journal content: the picker only needs a title and
    date, and generation retrieves the full fixture server-side by ID.
    """

    id = serializers.IntegerField(read_only=True)
    title = serializers.CharField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)

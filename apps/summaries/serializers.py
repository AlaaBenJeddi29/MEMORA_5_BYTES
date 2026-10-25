"""Serializers for the summaries API.

Manual CRUD accepts the four AI/content fields plus an optional link to one of
the caller's Module 1 journal entries. ``owner`` is always read-only and is
supplied by the view from ``request.user``.
"""

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from apps.journal.models import JournalEntry

from .models import Summary, validate_themes

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


class GenerateSummarySerializer(serializers.Serializer):
    """Only the journal entry ID is accepted for generation."""

    journal_entry_id = serializers.IntegerField(
        min_value=1,
        max_value=MAX_JOURNAL_ENTRY_ID,
    )

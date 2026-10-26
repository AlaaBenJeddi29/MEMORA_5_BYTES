"""Serializers for the journal app."""

from rest_framework import serializers

from .models import JournalEntry


class JournalEntrySerializer(serializers.ModelSerializer):
    """Serialize journal entries for API responses and requests."""

    # Read-only fields: set automatically by the backend
    user = serializers.StringRelatedField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)

    # Photos as a list of primary keys (read-only for now; future can allow write)
    photos = serializers.PrimaryKeyRelatedField(
        many=True,
        read_only=True,
    )

    class Meta:
        model = JournalEntry
        fields = [
            'id',
            'title',
            'text',
            'audio_file',
            'summary_text',
            'sentiment',
            'created_at',
            'user',
            'photos',
        ]
        read_only_fields = ['id', 'created_at', 'user']


class AdvancedSearchResultSerializer(serializers.Serializer):
    """Serialize advanced search results with AI analysis."""

    results = JournalEntrySerializer(many=True, read_only=True)
    total = serializers.IntegerField(read_only=True)
    ai_analysis = serializers.DictField(required=False, read_only=True)


class _DateRangeMixin(serializers.Serializer):
    """Shared, validated date range used by both search endpoints."""

    date_from = serializers.DateField(required=False)
    date_to = serializers.DateField(required=False)

    def validate(self, attrs):
        date_from = attrs.get("date_from")
        date_to = attrs.get("date_to")
        if date_from and date_to and date_from > date_to:
            raise serializers.ValidationError(
                {"date_to": ["The end date must be on or after the start date."]}
            )
        return attrs


class JournalSearchQuerySerializer(_DateRangeMixin):
    """Validate the simple search query string (no unvalidated indexing)."""

    q = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=200,
    )


class AdvancedSearchQuerySerializer(_DateRangeMixin):
    """Validate the advanced search body before it reaches the AI service."""

    query = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=500,
    )
    sentiment = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=100,
    )
    use_ai = serializers.BooleanField(required=False, default=False)


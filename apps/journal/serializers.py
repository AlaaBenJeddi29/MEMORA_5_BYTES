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

"""Serializers for the journal app."""

from rest_framework import serializers

from .models import JournalEntry


class JournalEntrySerializer(serializers.ModelSerializer):
    """Serializer for JournalEntry model with user auto-set from request."""

    user = serializers.IntegerField(read_only=True)
    photos = serializers.PrimaryKeyRelatedField(
        many=True,
        read_only=True,
    )

    class Meta:
        model = JournalEntry
        fields = [
            'id',
            'user',
            'title',
            'text',
            'audio_file',
            'summary_text',
            'sentiment',
            'created_at',
            'photos',
        ]
        read_only_fields = ['id', 'created_at', 'user', 'photos']

    def validate_title(self, value):
        """Ensure title is not blank."""
        if not value or not value.strip():
            raise serializers.ValidationError('Title cannot be blank.')
        return value

    def create(self, validated_data):
        """Inject request.user into create operation."""
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)

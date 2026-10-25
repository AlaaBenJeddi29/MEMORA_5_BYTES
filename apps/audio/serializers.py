"""Serializers for the audio app.

AudioUploadSerializer — validates the incoming multipart upload (file,
    size, MIME type) according to ``docs/API_CONTRACT.md`` §1.8.

AudioEntrySerializer — read-only representation returned to the client.
    Never includes the owner id; ownership is enforced in the view.

AudioEntryUpdateSerializer — writable subset (transcript, summary, file) accepted
    by ``PATCH /api/audio/{id}/`` so the user can correct an AI result or replace
    the recording itself.
"""

from django.core.files.storage import default_storage
from rest_framework import serializers

from .models import AudioEntry

# --------------------------------------------------------------------------
# Upload constraints (API contract §1.8)
# --------------------------------------------------------------------------

MAX_AUDIO_SIZE_BYTES = 25 * 1024 * 1024  # 25 MB

ALLOWED_AUDIO_TYPES = {
    "audio/mpeg",
    "audio/wav",
    "audio/webm",
    "audio/mp4",
    "audio/x-wav",
    "audio/ogg",
    "audio/webm;codecs=opus",
}


def validate_audio_file(value):
    """Size + MIME checks, shared by the first upload and a later replacement."""
    # Size check.
    if value.size > MAX_AUDIO_SIZE_BYTES:
        raise serializers.ValidationError(
            f"File too large. Maximum size is {MAX_AUDIO_SIZE_BYTES // (1024 * 1024)} MB."
        )

    # MIME type check (use the content_type provided by the browser;
    # the server never trusts the filename extension alone).
    content_type = getattr(value, "content_type", "")
    # Normalize — strip codec parameters for the set lookup.
    base_type = content_type.split(";")[0].strip().lower()
    if base_type not in {t.split(";")[0].strip() for t in ALLOWED_AUDIO_TYPES}:
        allowed = ", ".join(sorted({t.split(";")[0] for t in ALLOWED_AUDIO_TYPES}))
        raise serializers.ValidationError(
            f"Unsupported file type '{content_type}'. Allowed: {allowed}."
        )

    return value


class UploadedAudioField(serializers.FileField):
    """Accept a genuine upload only.

    DRF's FileField also resolves a storage path sent as a string, which would
    let a client attach — and then read back — somebody else's saved recording.
    """

    def to_internal_value(self, data):
        if isinstance(data, str):
            raise serializers.ValidationError(
                "Send the recording as a file upload, not a stored path."
            )
        return super().to_internal_value(data)


class AudioUploadSerializer(serializers.Serializer):
    """Validates an audio file upload. Write-only; does not map to a model."""

    file = UploadedAudioField()

    def validate_file(self, value):
        return validate_audio_file(value)


class AudioEntrySerializer(serializers.ModelSerializer):
    """Read representation of an AudioEntry.

    The file field returns the full URL (DRF's FileField does this when the
    request is passed as context).
    """

    file = serializers.FileField(read_only=True)

    class Meta:
        model = AudioEntry
        fields = [
            "id",
            "file",
            "duration_seconds",
            "transcript",
            "language_code",
            "language_name",
            "sentiment",
            "sentiment_score",
            "summary",
            "status",
            "error",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class AudioEntryUpdateSerializer(serializers.ModelSerializer):
    """Editable subset of an entry — what the user may change after transcription.

    ``file`` replaces the recording, and with it every result the AI derived from
    the old audio: those fields would otherwise describe a file that no longer
    exists. Language, sentiment and status stay read-only because they are
    computed from the audio, not typed by the user.
    """

    file = UploadedAudioField(required=False, write_only=True)

    class Meta:
        model = AudioEntry
        fields = ["transcript", "summary", "file"]

    def validate_file(self, value):
        return validate_audio_file(value)

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError(
                "Provide at least one editable field: transcript, summary or file."
            )
        if "file" in attrs and ({"transcript", "summary"} & attrs.keys()):
            # The replacement empties transcript/summary, so a value sent in the
            # same request would be silently thrown away.
            raise serializers.ValidationError(
                "Replace the audio in its own request: the new recording is "
                "re-transcribed, so corrections sent with it would be lost."
            )
        return attrs

    def update(self, instance, validated_data):
        new_file = validated_data.pop("file", None)
        for field, value in validated_data.items():
            setattr(instance, field, value)

        if new_file is None:
            instance.save()
            return instance

        previous_name = instance.file.name
        instance.file = new_file
        instance.duration_seconds = None
        instance.transcript = None
        instance.language_code = None
        instance.language_name = None
        instance.sentiment = None
        instance.sentiment_score = None
        instance.summary = None
        instance.error = None
        instance.status = AudioEntry.Status.PENDING
        instance.save()

        # Same-name uploads are stored under a fresh path, so this never deletes
        # the file that replaced it.
        if previous_name and previous_name != instance.file.name:
            default_storage.delete(previous_name)
        return instance


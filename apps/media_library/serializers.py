"""Serializers for media uploads and gallery metadata.

Uploads are validated from decoded image content, not the client filename or
MIME type. The original bytes are stored unchanged; only the storage filename
extension is normalized to match the detected format.
"""

import logging

from django.conf import settings
from django.db import transaction
from PIL import Image, UnidentifiedImageError
from rest_framework import serializers

from apps.journal.models import JournalEntry
from apps.summaries.models import Summary

from .journal_context import (
    JournalEntryNotFound,
    build_journal_prompt,
    get_journal_entry,
)
from .models import MediaFile

logger = logging.getLogger(__name__)

ALLOWED_IMAGE_FORMATS = {
    "JPEG": ".jpg",
    "PNG": ".png",
    "WEBP": ".webp",
}

def _max_prompt_length():
    return settings.MEDIA_GENERATION_MAX_PROMPT_LENGTH


def _describe_size(max_bytes):
    if max_bytes >= 1024 * 1024:
        return f"{max_bytes / (1024 * 1024):g} MB"
    return f"{max_bytes} bytes"


class SafeMediaImageField(serializers.ImageField):
    """Serialize storage URLs without exposing filesystem paths."""

    def to_representation(self, value):
        if not value:
            return None

        try:
            url = value.url
        except ValueError:
            return None

        if url.startswith(("http://", "https://")):
            return url
        if not url.startswith("/"):
            # The project's MEDIA_URL has no leading slash; normalize it so
            # the SPA can resolve the URL from any route.
            url = f"/{url}"

        request = self.context.get("request")
        if request is not None:
            return request.build_absolute_uri(url)
        return url


class MediaJournalEntrySerializer(serializers.ModelSerializer):
    """Minimal real journal context shown beside a media item."""

    class Meta:
        model = JournalEntry
        fields = ["id", "title"]
        read_only_fields = fields


class MediaFileSerializer(serializers.ModelSerializer):
    file = SafeMediaImageField(required=True)
    journal_entries = MediaJournalEntrySerializer(many=True, read_only=True)
    journal_entry_id = serializers.SerializerMethodField()
    summary_id = serializers.IntegerField(read_only=True)
    provider = serializers.CharField(read_only=True)
    model = serializers.CharField(read_only=True)

    class Meta:
        model = MediaFile
        fields = [
            "id",
            "file",
            "media_type",
            "prompt",
            "status",
            "journal_entry_id",
            "journal_entries",
            "summary_id",
            "provider",
            "model",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "media_type",
            "prompt",
            "status",
            "journal_entry_id",
            "journal_entries",
            "summary_id",
            "provider",
            "model",
            "created_at",
            "updated_at",
        ]

    def get_journal_entry_id(self, obj):
        entries = list(obj.journal_entries.all())
        return entries[0].pk if entries else None

    def validate_file(self, value):
        max_bytes = settings.MEDIA_IMAGE_MAX_BYTES
        if value.size == 0:
            raise serializers.ValidationError("The uploaded file is empty.")
        if value.size > max_bytes:
            raise serializers.ValidationError(
                f"Image is too large. Maximum size is {_describe_size(max_bytes)}."
            )

        value.seek(0)
        try:
            with Image.open(value) as image:
                image_format = (image.format or "").upper()
                width, height = image.size
                is_animated = getattr(image, "is_animated", False)
                image.verify()
        except (
            UnidentifiedImageError,
            Image.DecompressionBombError,
            OSError,
            SyntaxError,
            ValueError,
        ) as exc:
            raise serializers.ValidationError("Upload a valid image file.") from exc

        extension = ALLOWED_IMAGE_FORMATS.get(image_format)
        if extension is None:
            allowed = ", ".join(sorted(ALLOWED_IMAGE_FORMATS))
            raise serializers.ValidationError(
                f"Unsupported image format. Allowed formats: {allowed}."
            )
        if is_animated:
            raise serializers.ValidationError("Animated images are not supported.")
        if width * height > settings.MEDIA_IMAGE_MAX_PIXELS:
            raise serializers.ValidationError("Image dimensions are too large.")

        # Ignore the client filename/path and derive the extension from the
        # decoded format. The bytes themselves are stored unchanged.
        value.name = f"upload{extension}"
        value.seek(0)
        return value

    def create(self, validated_data):
        instance = self.Meta.model(**validated_data)
        try:
            with transaction.atomic():
                instance.save()
        except Exception:
            field_file = instance.file
            # Only remove a file that storage actually wrote. On a failed
            # storage write, the FieldFile is not committed and its name may
            # still be the client-supplied filename.
            if (
                field_file
                and field_file.name
                and getattr(field_file, "_committed", False)
            ):
                try:
                    field_file.delete(save=False)
                except Exception:
                    logger.warning("Failed to remove an unsaved media upload.")
            raise
        return instance


class MediaFileDetailSerializer(MediaFileSerializer):
    """Retrieve and update an owned media row without exposing storage input."""

    file = SafeMediaImageField(read_only=True)
    prompt = serializers.CharField(
        required=True,
        allow_blank=True,
        trim_whitespace=True,
    )

    def validate_prompt(self, value):
        max_length = _max_prompt_length()
        if len(value) > max_length:
            raise serializers.ValidationError(
                f"Keep the prompt to {max_length} characters or fewer."
            )
        return value

    class Meta(MediaFileSerializer.Meta):
        read_only_fields = [
            "id",
            "file",
            "media_type",
            "status",
            "journal_entry_id",
            "created_at",
            "updated_at",
        ]


class GenerateImageSerializer(serializers.Serializer):
    """Validate real journal/summary context and the local generation request.

    Prompt precedence is deterministic:

    1. an explicit manual prompt;
    2. the selected summary's stored ``illustration_prompt``;
    3. context derived from the selected real journal entry.

    Every supplied ID is resolved against the authenticated owner before this
    method returns, so no foreign record can reach ComfyUI or the database.
    """

    prompt = serializers.CharField(
        required=False,
        allow_blank=True,
        trim_whitespace=True,
    )
    journal_entry_id = serializers.IntegerField(
        required=False,
        allow_null=True,
        min_value=1,
    )
    summary_id = serializers.IntegerField(
        required=False,
        allow_null=True,
        min_value=1,
    )
    width = serializers.IntegerField(required=False)
    height = serializers.IntegerField(required=False)
    steps = serializers.IntegerField(required=False)
    seed = serializers.IntegerField(
        required=False,
        allow_null=True,
        min_value=0,
        max_value=2**63 - 1,
    )

    def validate_prompt(self, value):
        max_length = _max_prompt_length()
        if len(value) > max_length:
            raise serializers.ValidationError(
                f"Keep the prompt to {max_length} characters or fewer."
            )
        return value

    def validate(self, attrs):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user is None or not getattr(user, "is_authenticated", False):
            raise serializers.ValidationError(
                {"detail": "Authentication is required."}
            )

        entry = None
        entry_id = attrs.get("journal_entry_id")
        if entry_id is not None:
            try:
                entry = get_journal_entry(user, entry_id)
            except JournalEntryNotFound as exc:
                raise serializers.ValidationError(
                    {"journal_entry_id": ["Journal entry not found."]}
                ) from exc

        summary = None
        summary_id = attrs.get("summary_id")
        if summary_id is not None:
            try:
                summary = Summary.objects.select_related("journal_entry").get(
                    pk=summary_id,
                    owner=user,
                )
            except (
                Summary.DoesNotExist,
                TypeError,
                ValueError,
                OverflowError,
            ) as exc:
                raise serializers.ValidationError(
                    {"summary_id": ["Summary not found."]}
                ) from exc

            if entry is not None and summary.journal_entry_id != entry.pk:
                raise serializers.ValidationError(
                    {
                        "summary_id": [
                            "This summary does not belong to the selected "
                            "journal entry."
                        ]
                    }
                )
            if entry is None and summary.journal_entry_id is not None:
                linked_entry = summary.journal_entry
                if linked_entry.user_id != user.pk:
                    raise serializers.ValidationError(
                        {
                            "summary_id": [
                                "This summary is linked to an unavailable "
                                "journal entry."
                            ]
                        }
                    )
                entry = linked_entry

        prompt = attrs.get("prompt", "").strip()
        manual_prompt = bool(prompt)

        if not manual_prompt and summary is not None:
            prompt = (summary.illustration_prompt or "").strip()
            if not prompt:
                raise serializers.ValidationError(
                    {
                        "summary_id": [
                            "This summary has no illustration prompt. "
                            "Generate or update it in Summaries."
                        ]
                    }
                )

        if not prompt and entry is not None:
            prompt = build_journal_prompt(entry)
            if not prompt:
                raise serializers.ValidationError(
                    {
                        "journal_entry_id": [
                            "This journal entry has no title or summary to "
                            "illustrate."
                        ]
                    }
                )

        if not prompt:
            raise serializers.ValidationError(
                {
                    "prompt": [
                        "Provide a prompt, a journal entry, or a summary."
                    ]
                }
            )

        max_prompt_length = _max_prompt_length()
        if len(prompt) > max_prompt_length:
            raise serializers.ValidationError(
                {
                    "prompt": [
                        f"Keep the prompt to {max_prompt_length} characters "
                        "or fewer."
                    ]
                }
            )

        allowed_sizes = tuple(settings.MEDIA_GENERATION_ALLOWED_SIZES)
        width = attrs.get("width")
        height = attrs.get("height")
        if width is None and height is None:
            width, height = allowed_sizes[0]
        elif width is None or height is None:
            raise serializers.ValidationError(
                {"width": ["Provide both width and height, or neither."]}
            )
        if (width, height) not in allowed_sizes:
            allowed = ", ".join(
                f"{allowed_width}x{allowed_height}"
                for allowed_width, allowed_height in allowed_sizes
            )
            raise serializers.ValidationError(
                f"Width and height must be one of: {allowed}."
            )

        steps = attrs.get("steps")
        if steps is None:
            steps = settings.MEDIA_GENERATION_DEFAULT_STEPS
        if not (
            settings.MEDIA_GENERATION_MIN_STEPS
            <= steps
            <= settings.MEDIA_GENERATION_MAX_STEPS
        ):
            raise serializers.ValidationError(
                {
                    "steps": [
                        "Steps must be between "
                        f"{settings.MEDIA_GENERATION_MIN_STEPS} and "
                        f"{settings.MEDIA_GENERATION_MAX_STEPS}."
                    ]
                }
            )

        attrs["width"] = width
        attrs["height"] = height
        attrs["steps"] = steps
        attrs["resolved_prompt"] = prompt
        attrs["journal_entry"] = entry
        attrs["summary"] = summary
        attrs["journal_entry_id"] = entry.pk if entry is not None else None
        return attrs

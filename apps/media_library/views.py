"""Media library API views.

Every list, detail, update, and delete query is scoped to the authenticated
owner. Uploads accept multipart/form-data only, and the owner and media type are
set server-side. Image generation is synchronous and only returns after the
generated file has been stored as an AI-generated media row.
"""

import logging

from django.conf import settings
from django.core.files.base import ContentFile
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .comfyui import (
    ComfyUIConfigurationError,
    ComfyUIGenerationError,
    ComfyUIInvalidOutputError,
    ComfyUITimeoutError,
    ComfyUIUnavailableError,
    build_client,
)
from .models import MediaCollection, MediaFile
from .serializers import (
    CollectionItemSerializer,
    FavoriteUpdateSerializer,
    GenerateImageSerializer,
    MediaCollectionDetailSerializer,
    MediaCollectionSerializer,
    MediaFileDetailSerializer,
    MediaFileSerializer,
)

logger = logging.getLogger(__name__)


def _delete_file_if_unreferenced(storage, file_name, media_id):
    try:
        if MediaFile.objects.filter(file=file_name).exists():
            return
        storage.delete(file_name)
    except Exception:
        # The row is already gone; never resurrect it or fail the request
        # because a best-effort storage cleanup failed.
        logger.warning("Stored file cleanup failed for deleted media %s.", media_id)


class MediaFileListCreateView(generics.ListCreateAPIView):
    """List the caller's media or upload a new original image."""

    serializer_class = MediaFileSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def get_queryset(self):
        return (
            MediaFile.objects.filter(owner=self.request.user)
            .select_related("summary")
            .prefetch_related("journal_entries", "collections")
        )

    def perform_create(self, serializer):
        serializer.save(
            owner=self.request.user,
            media_type=MediaFile.MediaType.ORIGINAL,
            status=MediaFile.Status.SUCCEEDED,
        )


class MediaFileDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Retrieve, update safe metadata, or delete one owned media item."""

    serializer_class = MediaFileDetailSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser]

    def get_queryset(self):
        return (
            MediaFile.objects.filter(owner=self.request.user)
            .select_related("summary")
            .prefetch_related("journal_entries", "collections")
        )

    def perform_destroy(self, instance):
        field_file = instance.file
        file_name = field_file.name if field_file else ""
        storage = field_file.storage if file_name else None
        media_id = instance.pk

        with transaction.atomic():
            instance.delete()
            if file_name and storage is not None:
                transaction.on_commit(
                    lambda: _delete_file_if_unreferenced(
                        storage,
                        file_name,
                        media_id,
                    )
                )


class GenerateImageView(APIView):
    """Generate an image with local ComfyUI and store the validated result."""

    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser]

    def post(self, request):
        serializer = GenerateImageSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Log only non-sensitive routing metadata. Prompts and provider
        # response bodies are never written to application logs.
        logger.info(
            "Image generation requested: user_id=%s size=%sx%s steps=%s "
            "prompt_chars=%s journal_entry_id=%s summary_id=%s",
            request.user.pk,
            data["width"],
            data["height"],
            data["steps"],
            len(data["resolved_prompt"]),
            data.get("journal_entry_id"),
            data.get("summary_id"),
        )

        try:
            generated = build_client().generate(
                prompt=data["resolved_prompt"],
                width=data["width"],
                height=data["height"],
                steps=data["steps"],
                seed=data.get("seed"),
            )
        except ComfyUIConfigurationError:
            return Response(
                {"detail": "Image generation is not configured."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except ComfyUIUnavailableError:
            return Response(
                {"detail": "The local image generation service is unavailable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except ComfyUITimeoutError:
            return Response(
                {"detail": "Image generation timed out. Try again."},
                status=status.HTTP_504_GATEWAY_TIMEOUT,
            )
        except (ComfyUIGenerationError, ComfyUIInvalidOutputError):
            return Response(
                {"detail": "Image generation failed."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        checkpoint = (settings.COMFYUI_CHECKPOINT or "").strip()
        media = MediaFile(
            owner=request.user,
            media_type=MediaFile.MediaType.AI_GENERATED,
            prompt=data["resolved_prompt"],
            summary=data.get("summary"),
            provider="comfyui",
            model=(checkpoint[:255] or "stable-diffusion-1.5"),
            status=MediaFile.Status.SUCCEEDED,
        )
        journal_entry = data.get("journal_entry")
        try:
            media.file.save("generated.png", ContentFile(generated.data), save=False)
            with transaction.atomic():
                media.save()
                if journal_entry is not None:
                    journal_entry.photos.add(media)
        except Exception:
            field_file = media.file
            if (
                field_file
                and field_file.name
                and getattr(field_file, "_committed", False)
            ):
                try:
                    field_file.delete(save=False)
                except Exception:
                    logger.warning(
                        "Failed to remove an unsaved generated media file."
                    )
            return Response(
                {"detail": "The generated image could not be saved."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        response_serializer = MediaFileSerializer(
            media,
            context={"request": request},
        )
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)


class MediaFavoriteView(APIView):
    """Set or clear the favorite flag on one owned media item."""

    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser]

    def patch(self, request, pk):
        media = get_object_or_404(MediaFile, pk=pk, owner=request.user)
        serializer = FavoriteUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        media.is_favorite = serializer.validated_data["is_favorite"]
        media.save(update_fields=["is_favorite", "updated_at"])
        return Response(
            MediaFileSerializer(media, context={"request": request}).data
        )


class MediaCollectionListCreateView(generics.ListCreateAPIView):
    """List the caller's collections or create a new one."""

    serializer_class = MediaCollectionSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser]

    def get_queryset(self):
        return MediaCollection.objects.filter(
            owner=self.request.user
        ).prefetch_related("items")

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class MediaCollectionDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Retrieve, rename, or delete one owned collection.

    Deleting a collection removes only the grouping and its join rows. Media
    rows and stored files are left untouched.
    """

    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser]

    def get_queryset(self):
        return MediaCollection.objects.filter(
            owner=self.request.user
        ).prefetch_related("items__journal_entries", "items__collections")

    def get_serializer_class(self):
        if self.request.method == "GET":
            return MediaCollectionDetailSerializer
        return MediaCollectionSerializer


class MediaCollectionItemsView(APIView):
    """Add one owned media item to an owned collection."""

    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser]

    def post(self, request, pk):
        collection = get_object_or_404(
            MediaCollection,
            pk=pk,
            owner=request.user,
        )
        serializer = CollectionItemSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        media = get_object_or_404(
            MediaFile,
            pk=serializer.validated_data["media_id"],
            owner=request.user,
        )

        already_added = collection.items.filter(pk=media.pk).exists()
        if not already_added:
            collection.items.add(media)
            collection.save(update_fields=["updated_at"])

        response_status = (
            status.HTTP_200_OK if already_added else status.HTTP_201_CREATED
        )
        return Response(
            MediaFileSerializer(media, context={"request": request}).data,
            status=response_status,
        )


class MediaCollectionItemDetailView(APIView):
    """Remove one owned media item from an owned collection."""

    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser]

    def delete(self, request, pk, media_id):
        collection = get_object_or_404(
            MediaCollection,
            pk=pk,
            owner=request.user,
        )
        media = get_object_or_404(
            MediaFile,
            pk=media_id,
            owner=request.user,
        )
        collection.items.remove(media)
        collection.save(update_fields=["updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)

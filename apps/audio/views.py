"""Views for the audio app.

    POST /api/audio/          → upload a voice memo, trigger AI processing
    GET  /api/audio/          → list the authenticated user's audio entries
    GET  /api/audio/{id}/     → retrieve a single entry (owner only)
    PATCH /api/audio/{id}/    → correct the transcript/summary, or replace the
                                audio and re-run the AI (owner only)
    DELETE /api/audio/{id}/   → delete a single entry (owner only)

Ownership is enforced by filtering every queryset to ``request.user``
(§1.3 of the API contract).  A non-owned id returns 404 — the client
cannot tell whether the object exists or belongs to someone else.

AI processing runs on a background thread so the upload answers immediately
with ``status: "pending"`` and the frontend can show live progress
(pending → processing → succeeded/failed) by polling the detail endpoint.
Celery is the production successor; the status contract stays identical.
"""

import logging
import threading

from django.db import connections
from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import AudioEntry
from .serializers import (
    AudioEntrySerializer,
    AudioEntryUpdateSerializer,
    AudioUploadSerializer,
)
from .services import process_audio_entry

logger = logging.getLogger(__name__)


def process_entry_by_pk(entry_pk: int) -> None:
    """Load the entry and run the AI pipeline on it (runs off the request thread)."""
    try:
        entry = AudioEntry.objects.get(pk=entry_pk)
    except AudioEntry.DoesNotExist:
        logger.warning("AudioEntry #%s vanished before processing.", entry_pk)
        return
    if entry.status not in (AudioEntry.Status.PENDING, AudioEntry.Status.PROCESSING):
        return
    try:
        process_audio_entry(entry)
    finally:
        # Each thread owns its DB connection; release it when done.
        connections.close_all()


def start_processing(entry_pk: int) -> None:
    """Run :func:`process_entry_by_pk` on a daemon thread."""
    threading.Thread(
        target=process_entry_by_pk, args=(entry_pk,), daemon=True, name=f"audio-ai-{entry_pk}"
    ).start()


class AudioListCreateView(APIView):
    """
    GET  /api/audio/  — list the caller's audio entries (newest first).
    POST /api/audio/  — upload a new voice memo and start AI processing.
    """

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request):
        entries = AudioEntry.objects.filter(owner=request.user)
        serializer = AudioEntrySerializer(entries, many=True, context={"request": request})
        return Response(serializer.data)

    def post(self, request):
        # 1. Validate the uploaded file.
        upload_serializer = AudioUploadSerializer(data=request.data)
        upload_serializer.is_valid(raise_exception=True)
        validated_file = upload_serializer.validated_data["file"]

        # 2. Create the AudioEntry record.
        entry = AudioEntry.objects.create(
            owner=request.user,
            file=validated_file,
            status=AudioEntry.Status.PENDING,
        )

        # 3. Hand the AI work to a background thread and answer right away.
        #    The frontend polls /api/audio/{id}/ until a final status.
        start_processing(entry.pk)

        serializer = AudioEntrySerializer(entry, context={"request": request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class AudioDetailView(APIView):
    """
    GET    /api/audio/{id}/  — retrieve one entry (owner only).
    PATCH  /api/audio/{id}/  — correct the transcript/summary, or replace the
                               recording and run the AI on it again (owner only).
    DELETE /api/audio/{id}/  — delete one entry (owner only).
    """

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def _get_entry(self, pk, user):
        """Return the entry or None if it doesn't exist / isn't owned."""
        try:
            return AudioEntry.objects.get(pk=pk, owner=user)
        except AudioEntry.DoesNotExist:
            return None

    @staticmethod
    def _not_found():
        return Response(
            {"detail": "No AudioEntry matches the given query."},
            status=status.HTTP_404_NOT_FOUND,
        )

    def get(self, request, pk):
        entry = self._get_entry(pk, request.user)
        if entry is None:
            return self._not_found()
        serializer = AudioEntrySerializer(entry, context={"request": request})
        return Response(serializer.data)

    def patch(self, request, pk):
        entry = self._get_entry(pk, request.user)
        if entry is None:
            return self._not_found()

        if entry.status in (AudioEntry.Status.PENDING, AudioEntry.Status.PROCESSING):
            # The worker would overwrite the edit when it finishes.
            return Response(
                {"detail": "This memo is still being transcribed. Save your edit once it finishes."},
                status=status.HTTP_409_CONFLICT,
            )

        update = AudioEntryUpdateSerializer(entry, data=request.data, partial=True)
        update.is_valid(raise_exception=True)
        entry = update.save()

        # A new recording goes back through the pipeline, exactly like an upload.
        if entry.status == AudioEntry.Status.PENDING:
            start_processing(entry.pk)

        serializer = AudioEntrySerializer(entry, context={"request": request})
        return Response(serializer.data)

    def delete(self, request, pk):
        entry = self._get_entry(pk, request.user)
        if entry is None:
            return self._not_found()
        # Delete the file from storage as well.
        entry.file.delete(save=False)
        entry.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

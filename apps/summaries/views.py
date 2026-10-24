"""REST endpoints for Module 3 summaries.

All routes require the project's existing session authentication and are
scoped to ``request.user``. ``POST /generate/`` is the only endpoint that
calls Gemini; ordinary CRUD never does.
"""

import logging

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .mock_journal_entries import MockJournalEntryNotFound, get_mock_journal_entry
from .models import Summary
from .serializers import GenerateSummarySerializer, SummarySerializer
from .services import (
    SummaryConfigurationError,
    SummaryInputError,
    SummaryProviderError,
    SummaryRateLimitError,
    SummaryResponseError,
    SummaryServiceError,
    generate_summary,
)

logger = logging.getLogger(__name__)


class SummaryListCreateView(APIView):
    """List the caller's summaries or create one manually."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        summaries = Summary.objects.filter(owner=request.user)
        return Response(SummarySerializer(summaries, many=True).data)

    def post(self, request):
        serializer = SummarySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(owner=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class SummaryDetailView(APIView):
    """Retrieve, update, or delete one summary owned by the caller."""

    permission_classes = [IsAuthenticated]

    def get_object(self, request, pk):
        return get_object_or_404(Summary, pk=pk, owner=request.user)

    def get(self, request, pk):
        summary = self.get_object(request, pk)
        return Response(SummarySerializer(summary).data)

    def put(self, request, pk):
        return self._update(request, pk, partial=False)

    def patch(self, request, pk):
        return self._update(request, pk, partial=True)

    def _update(self, request, pk, partial):
        summary = self.get_object(request, pk)
        serializer = SummarySerializer(
            summary,
            data=request.data,
            partial=partial,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk):
        summary = self.get_object(request, pk)
        summary.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SummaryGenerateView(APIView):
    """Generate a summary from an isolated mock journal entry.

    The client supplies only ``journal_entry_id``. Journal content always
    comes from the mock provider, never from the request body.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        request_serializer = GenerateSummarySerializer(data=request.data)
        request_serializer.is_valid(raise_exception=True)
        entry_id = request_serializer.validated_data["journal_entry_id"]

        try:
            entry = get_mock_journal_entry(entry_id)
        except MockJournalEntryNotFound:
            return Response(
                {"detail": "Mock journal entry not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            result = generate_summary(entry)
        except SummaryConfigurationError:
            logger.error("Summary generation is not configured.")
            return Response(
                {"detail": "Summary generation is not configured on the server."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except SummaryRateLimitError:
            logger.warning("Summary generation was rate limited.")
            return Response(
                {"detail": "Summary generation is temporarily rate limited."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        except SummaryResponseError:
            logger.warning("Summary provider returned invalid output.")
            return Response(
                {"detail": "The summary provider returned an invalid response."},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except SummaryProviderError:
            logger.warning("Summary provider failed.")
            return Response(
                {"detail": "The summary provider is temporarily unavailable."},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except SummaryInputError:
            logger.error("Summary input was rejected.")
            return Response(
                {"detail": "The journal entry could not be summarized."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        except SummaryServiceError:
            logger.error("Summary generation failed.")
            return Response(
                {"detail": "Summary generation failed."},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except Exception as exc:
            logger.error(
                "Unexpected summary generation failure (%s).",
                type(exc).__name__,
            )
            return Response(
                {"detail": "Summary generation failed."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        summary = Summary(
            owner=request.user,
            journal_entry_id=entry.id,
            **result,
        )
        try:
            # Gemini is called before this block; the transaction only covers
            # validation and persistence, so a failed save cannot leave a row.
            with transaction.atomic():
                summary.full_clean()
                summary.save()
        except DjangoValidationError:
            logger.error("Generated summary failed model validation.")
            return Response(
                {"detail": "The generated summary could not be saved."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        except Exception as exc:
            logger.error(
                "Generated summary could not be saved (%s).",
                type(exc).__name__,
            )
            return Response(
                {"detail": "The generated summary could not be saved."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response(
            SummarySerializer(summary).data,
            status=status.HTTP_201_CREATED,
        )

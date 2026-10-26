"""REST endpoints for Module 3 summaries.

All routes require the project's existing session authentication and are
scoped to ``request.user``. ``POST /generate/`` is the only endpoint that
calls Gemini; ordinary CRUD never does.
"""

import logging

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import pagination, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .journal_provider import JournalEntryNotFound, journal_provider
from .models import BookPreference, Summary
from .search import EmptySearchQuery, search_user_summaries
from .serializers import (
    BookPreferenceSerializer,
    GenerateSummarySerializer,
    SummarySearchHitSerializer,
    SummarySearchQuerySerializer,
    SummarySerializer,
)
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


class SummarySearchPagination(pagination.PageNumberPagination):
    """Small pages for relevance-ranked search results."""

    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 50


class SummaryListCreateView(APIView):
    """List the caller's summaries or create one manually."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        summaries = Summary.objects.filter(owner=request.user).select_related(
            "journal_entry"
        )
        return Response(SummarySerializer(summaries, many=True).data)

    def post(self, request):
        serializer = SummarySerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save(owner=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class SummarySearchView(APIView):
    """Search the caller's summaries by concept or phrase.

    Ranking is local and owner-scoped. This endpoint never calls Gemini and
    never writes to the database.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        query_serializer = SummarySearchQuerySerializer(
            data=request.query_params
        )
        query_serializer.is_valid(raise_exception=True)
        query = query_serializer.validated_data["q"]

        try:
            hits = search_user_summaries(request.user, query)
        except EmptySearchQuery:
            return Response(
                {"q": ["Enter at least one meaningful search term."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        paginator = SummarySearchPagination()
        page = paginator.paginate_queryset(hits, request, view=self)
        if page is None:
            return Response(SummarySearchHitSerializer(hits, many=True).data)

        serializer = SummarySearchHitSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


class BookPreferenceView(APIView):
    """Read, update, or reset the caller's memory-book customization.

    The endpoint has no user identifier: every lookup and write is bound to
    ``request.user``. Reading before the first save returns model defaults
    without creating a row; the row is created on the first successful save.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        preference = BookPreference.objects.filter(owner=request.user).first()
        if preference is None:
            preference = BookPreference(owner=request.user)
        return Response(BookPreferenceSerializer(preference).data)

    def put(self, request):
        return self._save(request, partial=False)

    def patch(self, request):
        return self._save(request, partial=True)

    def delete(self, request):
        BookPreference.objects.filter(owner=request.user).delete()
        return Response(BookPreferenceSerializer(BookPreference(owner=request.user)).data)

    def _save(self, request, partial):
        preference = BookPreference.objects.filter(owner=request.user).first()
        serializer = BookPreferenceSerializer(
            preference or BookPreference(owner=request.user),
            data=request.data,
            partial=partial,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save(owner=request.user)
        return Response(serializer.data)


class SummaryDetailView(APIView):
    """Retrieve, update, or delete one summary owned by the caller."""

    permission_classes = [IsAuthenticated]

    def get_object(self, request, pk):
        summaries = Summary.objects.select_related("journal_entry")
        return get_object_or_404(summaries, pk=pk, owner=request.user)

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
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk):
        summary = self.get_object(request, pk)
        summary.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SummaryGenerateView(APIView):
    """Generate a summary from one of the caller's journal entries.

    The client supplies only ``journal_entry_id``. Journal content always
    comes from Module 1, never from the request body, and ownership is
    enforced by the provider's ``user`` filter.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        request_serializer = GenerateSummarySerializer(data=request.data)
        request_serializer.is_valid(raise_exception=True)
        entry_id = request_serializer.validated_data["journal_entry_id"]

        try:
            entry = journal_provider.get_entry(request.user, entry_id)
        except JournalEntryNotFound:
            return Response(
                {"detail": "Journal entry not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not entry.text.strip():
            return Response(
                {"detail": "This journal entry has no text to summarize."},
                status=status.HTTP_400_BAD_REQUEST,
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
            logger.warning("Summary input was rejected.")
            return Response(
                {"detail": "The journal entry could not be summarized."},
                status=status.HTTP_400_BAD_REQUEST,
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
            journal_entry=entry,
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

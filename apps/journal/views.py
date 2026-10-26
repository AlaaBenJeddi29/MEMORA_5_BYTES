"""Views for the journal app."""

from django.db.models import Q
from rest_framework import pagination, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from .models import JournalEntry
from .search_service import AdvancedSearchService
from .serializers import (
    AdvancedSearchQuerySerializer,
    AdvancedSearchResultSerializer,
    JournalEntrySerializer,
    JournalSearchQuerySerializer,
)


class JournalPagination(pagination.PageNumberPagination):
    """Pagination for journal entries: 10 per page by default."""

    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 100


class JournalEntryViewSet(ModelViewSet):
    """
    Full CRUD for journal entries, filtered to the authenticated user.

    Available endpoints:
      GET    /api/journal/entries/           — list entries for current user
      POST   /api/journal/entries/           — create a new entry
      GET    /api/journal/entries/{id}/      — retrieve a single entry
      PUT    /api/journal/entries/{id}/      — replace a single entry
      PATCH  /api/journal/entries/{id}/      — partial update
      DELETE /api/journal/entries/{id}/      — delete an entry
      GET    /api/journal/entries/search/    — simple search by title and date
      POST   /api/journal/entries/advanced-search/  — AI-powered advanced search
    """

    permission_classes = [IsAuthenticated]
    serializer_class = JournalEntrySerializer
    pagination_class = JournalPagination

    def get_queryset(self):
        """Return only entries belonging to the authenticated user."""
        return JournalEntry.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        """Set the user to the authenticated user before saving."""
        serializer.save(user=self.request.user)

    @action(detail=False, methods=['get'], url_path='search')
    def search(self, request):
        """
        Simple search journal entries by title and date range.

        Query parameters:
          q (optional)          — filter title__icontains=q
          date_from (optional)  — filter created_at__date__gte (YYYY-MM-DD)
          date_to (optional)    — filter created_at__date__lte (YYYY-MM-DD)
          page (optional)       — pagination page number
        """
        queryset = self.get_queryset()

        query_serializer = JournalSearchQuerySerializer(
            data=request.query_params
        )
        query_serializer.is_valid(raise_exception=True)
        filters = query_serializer.validated_data

        # Filter by title if q is provided
        q_param = filters.get('q')
        if q_param:
            queryset = queryset.filter(title__icontains=q_param)

        # Filter by a validated date range if provided
        date_from = filters.get('date_from')
        date_to = filters.get('date_to')

        if date_from:
            queryset = queryset.filter(created_at__date__gte=date_from)
        if date_to:
            queryset = queryset.filter(created_at__date__lte=date_to)

        # Apply pagination
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['post'], url_path='advanced-search')
    def advanced_search(self, request):
        """
        AI-powered advanced search with semantic analysis.

        Request body:
        {
            "query": "I was happy in summer",
            "date_from": "2024-06-01",
            "date_to": "2024-08-31",
            "sentiment": "happy",
            "use_ai": true
        }

        Response:
        {
            "results": [...entries],
            "total": 5,
            "ai_analysis": {
                "query": "I was happy in summer",
                "extracted_sentiments": ["happy"],
                "extracted_themes": ["summer", "vacation"],
                "summary": "You wrote 5 entries during summer..."
            }
        }
        """
        request_serializer = AdvancedSearchQuerySerializer(data=request.data)
        request_serializer.is_valid(raise_exception=True)
        filters = request_serializer.validated_data

        # Use advanced search service
        search_service = AdvancedSearchService(request.user)
        results = search_service.search(
            query=filters.get('query', ''),
            date_from=filters.get('date_from'),
            date_to=filters.get('date_to'),
            sentiment=filters.get('sentiment'),
            use_ai=filters.get('use_ai', False),
        )

        # Serialize results
        serializer = AdvancedSearchResultSerializer(results)
        return Response(serializer.data, status=status.HTTP_200_OK)


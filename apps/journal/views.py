"""Views for the journal app."""

from django.db.models import Q
from rest_framework import pagination, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from .models import JournalEntry
from .serializers import JournalEntrySerializer


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
      GET    /api/journal/entries/search/    — search by title and date
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
        Search journal entries by title and date range.

        Query parameters:
          q (optional)          — filter title__icontains=q
          date_from (optional)  — filter created_at__date__gte (YYYY-MM-DD)
          date_to (optional)    — filter created_at__date__lte (YYYY-MM-DD)
          page (optional)       — pagination page number
        """
        queryset = self.get_queryset()

        # Filter by title if q is provided
        q_param = request.query_params.get('q')
        if q_param:
            queryset = queryset.filter(title__icontains=q_param)

        # Filter by date range if provided
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')

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

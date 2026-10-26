"""Advanced search service for journal entries.

Combines traditional full-text search with AI-powered semantic search.
"""

import logging
from datetime import datetime
from typing import Any

from django.db.models import Q

from apps.summaries.ai_service import analyze_search_query, generate_search_summary
from .models import JournalEntry

logger = logging.getLogger(__name__)


class AdvancedSearchService:
    """Service for advanced journal entry search."""

    def __init__(self, user):
        self.user = user

    def search(
        self,
        query: str = "",
        date_from: str | None = None,
        date_to: str | None = None,
        sentiment: str | None = None,
        use_ai: bool = False,
    ) -> dict[str, Any]:
        """
        Perform advanced search with optional AI analysis.
        """
        # Start with user's entries
        queryset = JournalEntry.objects.filter(user=self.user)

        # Apply text search with synonyms (always)
        if query:
            queryset = self._apply_text_search(queryset, query)

        if date_from:
            queryset = queryset.filter(created_at__date__gte=date_from)

        if date_to:
            queryset = queryset.filter(created_at__date__lte=date_to)

        if sentiment:
            queryset = queryset.filter(sentiment__icontains=sentiment)

        # Apply AI analysis if requested
        ai_analysis = {}
        if use_ai and query:
            ai_analysis = self._apply_ai_analysis(queryset, query)

        # Order by relevance
        queryset = queryset.order_by("-created_at")

        entries = list(queryset)

        return {
            "results": entries,
            "total": len(entries),
            "ai_analysis": ai_analysis,
        }

    def _apply_text_search(self, queryset, query: str):
        """Apply full-text search across title, text, and sentiment, including synonyms."""
        from apps.summaries.ai_service import _get_search_synonyms
        
        q_objects = Q()
        
        # Get synonyms using Groq AI (with local fallback)
        search_terms = _get_search_synonyms(query)
        logger.info(f"Search terms for '{query}': {search_terms}")
        
        # Search for all terms and synonyms in title, text, AND sentiment
        for term in search_terms:
            q_objects |= (
                Q(title__icontains=term) | 
                Q(text__icontains=term) | 
                Q(sentiment__icontains=term)  # Add sentiment search!
            )

        return queryset.filter(q_objects) if q_objects else queryset

    def _apply_ai_analysis(self, queryset, query: str) -> dict[str, Any]:
        """Analyze query using AI and extract insights."""
        try:
            # Analyze the query
            analysis = analyze_search_query(query)

            # Extract sentiments and themes from analysis
            extracted_sentiments = analysis.get("sentiments", [])
            extracted_themes = analysis.get("themes", [])

            # If sentiments extracted, filter by them
            if extracted_sentiments:
                sentiment_filters = Q()
                for sent in extracted_sentiments:
                    sentiment_filters |= Q(sentiment__icontains=sent)
                queryset = queryset.filter(sentiment_filters)

            # Generate summary of results
            summary = ""
            if queryset.exists():
                entries_data = [
                    {"id": e.id, "title": e.title, "text": e.text}
                    for e in queryset[:10]
                ]
                summary = generate_search_summary(entries_data, query)

            return {
                "query": query,
                "extracted_sentiments": extracted_sentiments,
                "extracted_themes": extracted_themes,
                "summary": summary,
            }

        except Exception as e:
            logger.error(f"Error in AI analysis: {e}")
            return {}

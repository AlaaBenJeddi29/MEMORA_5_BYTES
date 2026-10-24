"""URL routes for the summaries app.

Mounted under ``/api/summaries/`` by ``config/urls.py``. The generation route
is declared before the integer detail route so it can never be swallowed.
"""

from django.urls import path

from .views import (
    MockJournalEntryListView,
    SummaryDetailView,
    SummaryGenerateView,
    SummaryListCreateView,
)

urlpatterns = [
    path(
        "mock-journal-entries/",
        MockJournalEntryListView.as_view(),
        name="summaries-mock-journal-entries",
    ),
    path("generate/", SummaryGenerateView.as_view(), name="summaries-generate"),
    path("", SummaryListCreateView.as_view(), name="summaries-list"),
    path("<int:pk>/", SummaryDetailView.as_view(), name="summaries-detail"),
]

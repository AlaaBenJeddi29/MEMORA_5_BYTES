"""URL routes for the summaries app.

Mounted under ``/api/summaries/`` by ``config/urls.py``. Non-integer routes
are declared before the integer detail route so they can never be swallowed.
"""

from django.urls import path

from .views import (
    SummaryDetailView,
    SummaryGenerateView,
    SummaryListCreateView,
    SummarySearchView,
)

urlpatterns = [
    path("search/", SummarySearchView.as_view(), name="summaries-search"),
    path("generate/", SummaryGenerateView.as_view(), name="summaries-generate"),
    path("", SummaryListCreateView.as_view(), name="summaries-list"),
    path("<int:pk>/", SummaryDetailView.as_view(), name="summaries-detail"),
]

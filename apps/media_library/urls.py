"""URL routes for the media_library app.

Mounted under ``/api/media/`` by ``config/urls.py``. Named routes so the
frontend and tests never hard-code paths.
"""

from django.urls import path

from .views import (
    GenerateImageView,
    MediaFileDetailView,
    MediaFileListCreateView,
)

urlpatterns = [
    path("", MediaFileListCreateView.as_view(), name="media-list"),
    path("generate/", GenerateImageView.as_view(), name="media-generate"),
    path("<int:pk>/", MediaFileDetailView.as_view(), name="media-detail"),
]

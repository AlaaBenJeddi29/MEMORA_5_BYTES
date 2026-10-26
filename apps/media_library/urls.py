"""URL routes for the media_library app.

Mounted under ``/api/media/`` by ``config/urls.py``. Named routes so the
frontend and tests never hard-code paths.
"""

from django.urls import path

from .views import (
    GenerateImageView,
    MediaCollectionDetailView,
    MediaCollectionItemDetailView,
    MediaCollectionItemsView,
    MediaCollectionListCreateView,
    MediaFavoriteView,
    MediaFileDetailView,
    MediaFileListCreateView,
)

urlpatterns = [
    path("", MediaFileListCreateView.as_view(), name="media-list"),
    path("generate/", GenerateImageView.as_view(), name="media-generate"),
    path(
        "collections/",
        MediaCollectionListCreateView.as_view(),
        name="media-collection-list",
    ),
    path(
        "collections/<int:pk>/",
        MediaCollectionDetailView.as_view(),
        name="media-collection-detail",
    ),
    path(
        "collections/<int:pk>/items/",
        MediaCollectionItemsView.as_view(),
        name="media-collection-items",
    ),
    path(
        "collections/<int:pk>/items/<int:media_id>/",
        MediaCollectionItemDetailView.as_view(),
        name="media-collection-item",
    ),
    path("<int:pk>/favorite/", MediaFavoriteView.as_view(), name="media-favorite"),
    path("<int:pk>/", MediaFileDetailView.as_view(), name="media-detail"),
]

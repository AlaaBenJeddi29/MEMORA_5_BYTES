"""URL routes for the audio app.

Mounted under ``/api/audio/`` by ``config/urls.py``.

    GET  /api/audio/       → list voice memos
    POST /api/audio/       → upload a voice memo
    GET  /api/audio/{id}/  → retrieve a single memo
    DELETE /api/audio/{id}/ → delete a single memo
"""

from django.urls import path

from .views import AudioDetailView, AudioListCreateView

urlpatterns = [
    path("", AudioListCreateView.as_view(), name="audio-list-create"),
    path("<int:pk>/", AudioDetailView.as_view(), name="audio-detail"),
]

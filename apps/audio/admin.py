"""Django admin registration for the audio app."""

from django.contrib import admin

from .models import AudioEntry


@admin.register(AudioEntry)
class AudioEntryAdmin(admin.ModelAdmin):
    list_display = ["id", "owner", "status", "sentiment", "duration_seconds", "created_at"]
    list_filter = ["status", "sentiment"]
    search_fields = ["owner__username"]
    readonly_fields = [
        "transcript",
        "sentiment",
        "sentiment_score",
        "status",
        "error",
        "created_at",
        "updated_at",
    ]
    ordering = ["-created_at"]

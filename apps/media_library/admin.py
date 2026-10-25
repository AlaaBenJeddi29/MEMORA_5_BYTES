from django.contrib import admin
from .models import MediaFile


@admin.register(MediaFile)
class MediaFileAdmin(admin.ModelAdmin):
    list_display = ('id', 'owner', 'media_type', 'status', 'summary', 'created_at')
    list_filter = ('media_type', 'status', 'created_at')
    search_fields = ('prompt', 'owner__username')
    raw_id_fields = ('owner', 'summary')

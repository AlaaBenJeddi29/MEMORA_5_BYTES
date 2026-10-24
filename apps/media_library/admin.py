from django.contrib import admin

from .models import MediaFile


@admin.register(MediaFile)
class MediaFileAdmin(admin.ModelAdmin):
    list_display = ('id', 'owner', 'photo', 'uploaded_at')
    list_filter = ('owner', 'uploaded_at')
    search_fields = ('owner__username',)

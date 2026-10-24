from django.contrib import admin

from .models import Photo


@admin.register(Photo)
class PhotoAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'image', 'created_at')
    list_filter = ('user', 'created_at')
    search_fields = ('image',)

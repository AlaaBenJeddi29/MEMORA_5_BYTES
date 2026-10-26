from django.contrib import admin

from .models import DetectedFace, Person


@admin.register(Person)
class PersonAdmin(admin.ModelAdmin):
    list_display = ('name', 'owner', 'created_at')
    list_filter = ('owner',)
    search_fields = ('name', 'owner__username')


@admin.register(DetectedFace)
class DetectedFaceAdmin(admin.ModelAdmin):
    list_display = ('photo', 'person', 'suggested_person', 'distance')
    list_filter = ('person',)
    readonly_fields = ('encoding', 'bounding_box')
    search_fields = ('person__name', 'photo__file')

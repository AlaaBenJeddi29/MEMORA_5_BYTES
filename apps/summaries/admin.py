from django.contrib import admin

from .models import Summary


@admin.register(Summary)
class SummaryAdmin(admin.ModelAdmin):
    list_display = ("id", "owner", "journal_entry", "mood", "created_at")
    list_select_related = ("owner", "journal_entry")
    list_filter = ("created_at",)
    search_fields = ("owner__username",)
    readonly_fields = ("created_at", "updated_at")

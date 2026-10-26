from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import User

admin.site.site_header = "MEMORA administration"
admin.site.site_title = "MEMORA admin"
admin.site.index_title = "Accounts and content"


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = (
        "username",
        "email",
        "role",
        "email_verified",
        "is_active",
        "is_staff",
        "is_superuser",
        "date_joined",
    )
    list_filter = (
        "role",
        "email_verified",
        "is_active",
        "is_staff",
        "is_superuser",
        "groups",
    )
    search_fields = ("username", "email", "first_name", "last_name")
    ordering = ("username",)
    fieldsets = BaseUserAdmin.fieldsets + (
        ("MEMORA role & verification", {"fields": ("role", "email_verified")}),
        (
            "Login protection",
            {"fields": ("failed_login_attempts", "locked_until")},
        ),
    )
    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        (
            "MEMORA",
            {
                "fields": ("email", "role"),
            },
        ),
    )

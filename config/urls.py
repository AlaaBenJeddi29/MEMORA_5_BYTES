"""
Root URL configuration for the MEMORA project.

Everything is mounted from here:

    /admin/            Django's built-in admin site
    /people/           HTML pages for the people module (temporary)
    /api/accounts/     accounts app
    /api/journal/      journal app
    /api/audio/        audio app
    /api/summaries/    summaries app
    /api/media/        media_library app
    /api/people/       people app

Each app owns its own ``urls.py``; this file only wires them together.

Docs: https://docs.djangoproject.com/en/5.2/topics/http/urls/
"""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),

    # HTML pages for the people module (testing before the React API).
    path("people/", include("apps.people.urls")),

    # API routes, one namespace per app.
    path("api/accounts/", include("apps.accounts.urls")),
    path("api/journal/", include("apps.journal.urls")),
    path("api/audio/", include("apps.audio.urls")),
    path("api/summaries/", include("apps.summaries.urls")),
    path("api/media/", include("apps.media_library.urls")),
    path("api/people/", include("apps.people.api_urls")),
]

# While DEBUG = True, let Django serve uploaded media files during
# development. In production a real web server or cloud storage does this.
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

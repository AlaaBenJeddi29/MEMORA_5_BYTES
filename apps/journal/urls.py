"""URL routes for the journal app.

Mounted under ``/api/journal/`` by ``config/urls.py``. Registers the JournalEntryViewSet
with a DefaultRouter for automatic CRUD + custom actions.
"""

from rest_framework.routers import DefaultRouter

from .views import JournalEntryViewSet

router = DefaultRouter()
router.register(r'entries', JournalEntryViewSet, basename='journal-entry')

urlpatterns = router.urls

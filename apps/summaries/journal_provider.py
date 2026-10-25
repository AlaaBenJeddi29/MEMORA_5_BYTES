"""Journal-entry provider seam for summaries generation.

Module 1's ``journal.JournalEntry`` model is the single source of truth for
journal entries. This module is the only place where Module 3 resolves an
entry, so the views stay independent of how the entry is stored.

Both provider methods filter by ``user``. A caller who does not own an entry
gets ``JournalEntryNotFound`` (reported as 404 by the API), never another
user's content.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Protocol

from apps.journal.models import JournalEntry


class JournalEntryNotFound(LookupError):
    """The entry does not exist, or the caller may not see it."""


@dataclass(frozen=True)
class JournalEntryOption:
    """Safe picker shape: journal content never leaves the server."""

    id: int
    title: str
    created_at: datetime


class JournalEntryLike(Protocol):
    """Minimal shape the generation service needs from a journal entry.

    Module 1 stores the body in ``text``; the Gemini service normalizes that
    field into its own ``content`` input.
    """

    id: int
    title: str
    text: str
    created_at: datetime


class JournalEntryProvider(Protocol):
    """Interface for the journal-entry source used by summaries."""

    def list_entries(self, user: Any) -> tuple[JournalEntryOption, ...]: ...

    def get_entry(self, user: Any, entry_id: int) -> JournalEntryLike: ...


class OrmJournalProvider:
    """Resolve journal entries directly from Module 1 via the Django ORM."""

    def list_entries(self, user: Any) -> tuple[JournalEntryOption, ...]:
        entries = JournalEntry.objects.filter(user=user).only(
            "id", "title", "created_at"
        )
        return tuple(
            JournalEntryOption(
                id=entry.id,
                title=entry.title,
                created_at=entry.created_at,
            )
            for entry in entries
        )

    def get_entry(self, user: Any, entry_id: int) -> JournalEntry:
        try:
            return JournalEntry.objects.get(pk=entry_id, user=user)
        except (
            JournalEntry.DoesNotExist,
            TypeError,
            ValueError,
            OverflowError,
        ) as exc:
            raise JournalEntryNotFound("Journal entry not found.") from exc


journal_provider: JournalEntryProvider = OrmJournalProvider()

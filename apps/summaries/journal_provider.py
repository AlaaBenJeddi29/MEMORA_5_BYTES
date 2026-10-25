"""Journal-entry provider seam for summaries generation.

Module 3 must not depend on Module 1's journal-entry model until its model/API
contract and migrations are agreed. This module is the **only** place that
resolves a journal entry for summaries, so the temporary fixtures can be
replaced without touching the views or the Gemini service.

Replacement point (when Module 1 is ready)
------------------------------------------
1. Agree the ``JournalEntry`` model + API contract and ship its migrations.
2. Implement a provider with the same ``JournalEntryProvider`` interface below.
   It must filter by ``user`` and only expose that user's entries.
3. Replace the ``journal_provider`` singleton at the bottom of this module.

Nothing else in Module 3 should change. Do **not** add a ``JournalEntry``
foreign key before step 1. The mock implementation is development-only: it
reads only the fixed fixture IDs 900001-900003, never the database, and cannot
be used to read arbitrary IDs.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Protocol

from .mock_journal_entries import (
    MOCK_JOURNAL_ENTRIES,
    MockJournalEntry,
    MockJournalEntryNotFound,
    get_mock_journal_entry,
)


class JournalEntryNotFound(LookupError):
    """The entry does not exist, or the caller may not see it."""


@dataclass(frozen=True)
class JournalEntryOption:
    """Safe picker shape: journal content never leaves the server."""

    id: int
    title: str
    created_at: datetime


class JournalEntryLike(Protocol):
    """Minimal shape the generation service needs from a journal entry."""

    id: int
    title: str
    content: str
    created_at: datetime


class JournalEntryProvider(Protocol):
    """Interface every journal-entry source must implement.

    ``user`` is part of the interface so a real provider can enforce
    ownership. The mock provider accepts and ignores it because its fixtures
    are development-only and are not persisted or owned.
    """

    def list_entries(self, user: Any) -> tuple[JournalEntryOption, ...]: ...

    def get_entry(self, user: Any, entry_id: int) -> JournalEntryLike: ...


class MockJournalProvider:
    """Temporary Module 3 fixtures; see the replacement steps above."""

    def list_entries(self, user: Any) -> tuple[JournalEntryOption, ...]:
        return tuple(
            JournalEntryOption(
                id=entry.id,
                title=entry.title,
                created_at=entry.created_at,
            )
            for entry in MOCK_JOURNAL_ENTRIES
        )

    def get_entry(self, user: Any, entry_id: int) -> MockJournalEntry:
        try:
            return get_mock_journal_entry(entry_id)
        except MockJournalEntryNotFound as exc:
            # Only the fixed fixture IDs resolve; arbitrary IDs are rejected.
            raise JournalEntryNotFound("Journal entry not found.") from exc


# Single switch point for Module 1. Replace this instance once the real
# JournalEntry model/API contract and migrations exist.
journal_provider: JournalEntryProvider = MockJournalProvider()

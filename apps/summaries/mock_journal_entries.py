"""Development-only mock journal entries for Module 3.

These fixtures are intentionally isolated from the database and from Module 1.
They are not a ``JournalEntry`` model, are never persisted, and use reserved
IDs. Production code must not depend on them beyond the summaries development
path.
"""

from dataclasses import dataclass
from datetime import datetime, timezone


@dataclass(frozen=True)
class MockJournalEntry:
    id: int
    title: str
    content: str
    created_at: datetime


class MockJournalEntryNotFound(LookupError):
    """Raised when an ID is not part of the development fixture set."""


MOCK_JOURNAL_ENTRIES = (
    MockJournalEntry(
        id=900001,
        title="Morning walk",
        content=(
            "Walked through the park before breakfast. The air was cold and "
            "the trees were starting to turn. I felt calm and ready for the day."
        ),
        created_at=datetime(2026, 10, 20, 7, 45, tzinfo=timezone.utc),
    ),
    MockJournalEntry(
        id=900002,
        title="Project stand-up",
        content=(
            "The team stand-up ran longer than expected. We agreed on the next "
            "milestone, but I am still a little anxious about the deadline."
        ),
        created_at=datetime(2026, 10, 21, 9, 30, tzinfo=timezone.utc),
    ),
    MockJournalEntry(
        id=900003,
        title="Evening with family",
        content=(
            "Dinner at home with everyone around the table. Lots of laughter "
            "and a long conversation. I ended the day feeling grateful."
        ),
        created_at=datetime(2026, 10, 22, 19, 15, tzinfo=timezone.utc),
    ),
)

_MOCK_JOURNAL_ENTRIES_BY_ID = {entry.id: entry for entry in MOCK_JOURNAL_ENTRIES}


def list_mock_journal_entries() -> tuple[MockJournalEntry, ...]:
    """Return the immutable development fixture set."""
    return MOCK_JOURNAL_ENTRIES


def get_mock_journal_entry(entry_id: int) -> MockJournalEntry:
    """Return one fixture entry or raise ``MockJournalEntryNotFound``."""
    try:
        return _MOCK_JOURNAL_ENTRIES_BY_ID[entry_id]
    except KeyError as exc:
        raise MockJournalEntryNotFound(
            f"Mock journal entry {entry_id!r} was not found."
        ) from exc

"""Temporary read-only journal context for Module 4 demos.

Module 1 owns JournalEntry. Until that model and API are ready, this module
provides a small, in-memory sample source for associating media with a memory
and prefilling an illustration prompt. It never reads or writes the database.

Only ``title`` is forwarded to the image provider when a sample memory is
selected; ``content`` stays server-side. Replace ``MockJournalContextProvider``
with a real implementation of ``JournalContextProvider`` when Module 1 is
available, and revisit that minimization with explicit user consent.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Protocol


class JournalContextNotFound(LookupError):
    """Raised when a requested journal context id does not exist."""


@dataclass(frozen=True, slots=True)
class JournalContext:
    id: int
    title: str
    content: str
    created_at: datetime


class JournalContextProvider(Protocol):
    def list_contexts(self) -> Sequence[JournalContext]:
        ...

    def get_context(self, entry_id: int) -> JournalContext:
        ...


MOCK_JOURNAL_CONTEXTS: tuple[JournalContext, ...] = (
    JournalContext(
        id=1,
        title="Morning by the lake",
        content=(
            "Woke before sunrise and walked down to the lake. The water was "
            "still, and the only sound was a pair of ducks landing near the reeds."
        ),
        created_at=datetime(2026, 9, 12, 7, 15, tzinfo=timezone.utc),
    ),
    JournalContext(
        id=2,
        title="Rainy afternoon",
        content=(
            "Spent the afternoon reading by the window while rain traced lines "
            "down the glass. The apartment smelled of coffee and old paper."
        ),
        created_at=datetime(2026, 9, 15, 15, 40, tzinfo=timezone.utc),
    ),
    JournalContext(
        id=3,
        title="Evening in the garden",
        content=(
            "The tomatoes finally turned red. I picked a handful, watered the "
            "herbs, and watched the light fade behind the neighbour's roof."
        ),
        created_at=datetime(2026, 9, 18, 19, 55, tzinfo=timezone.utc),
    ),
)


class MockJournalContextProvider:
    """In-memory sample provider used only until Module 1 exposes JournalEntry."""

    def __init__(
        self,
        contexts: Sequence[JournalContext] = MOCK_JOURNAL_CONTEXTS,
    ) -> None:
        self._contexts = tuple(contexts)
        self._by_id = {context.id: context for context in self._contexts}

    def list_contexts(self) -> Sequence[JournalContext]:
        return self._contexts

    def get_context(self, entry_id: int) -> JournalContext:
        try:
            return self._by_id[entry_id]
        except KeyError as exc:
            raise JournalContextNotFound(
                f"Journal context {entry_id} was not found."
            ) from exc


default_provider: JournalContextProvider = MockJournalContextProvider()

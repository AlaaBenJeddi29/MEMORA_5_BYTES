"""Resolve real Module 1 journal entries for Module 4 generation.

The database is the only source of journal context. Resolution always filters
by the authenticated owner, so a client-supplied ID can never select another
user's entry.
"""

from django.conf import settings

from apps.journal.models import JournalEntry


class JournalEntryNotFound(LookupError):
    """The entry does not exist, or the caller may not see it."""


def get_journal_entry(user, entry_id: int) -> JournalEntry:
    try:
        return JournalEntry.objects.only(
            "id",
            "title",
            "summary_text",
        ).get(pk=entry_id, user=user)
    except (
        JournalEntry.DoesNotExist,
        TypeError,
        ValueError,
        OverflowError,
    ) as exc:
        raise JournalEntryNotFound("Journal entry not found.") from exc


def build_journal_prompt(entry: JournalEntry) -> str:
    """Build a concise prompt without sending the private journal body.

    Only the title and the entry's existing recap are eligible. ``text`` is
    never forwarded to ComfyUI.
    """
    title = " ".join((entry.title or "").split())
    recap = " ".join((entry.summary_text or "").split())

    parts = []
    if title:
        parts.append(f'Illustrate this journal memory titled "{title}".')
    if recap:
        parts.append(recap)

    prompt = " ".join(parts)
    return prompt[: settings.MEDIA_GENERATION_MAX_PROMPT_LENGTH].rstrip()

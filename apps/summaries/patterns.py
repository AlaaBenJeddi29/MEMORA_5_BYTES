"""Read-only emotional patterns from the fields the user actually stored.

This module never calls Gemini and never writes to the database. It counts the
themes and moods attached to the caller's summaries and groups them by month.
The output describes stored data only; it is not a psychological assessment,
a score, a diagnosis, or a prediction.
"""

from __future__ import annotations

from collections import Counter
from datetime import datetime
from typing import Any, Iterable

from .models import Summary
from .search import normalize_text

MAX_THEMES = 8
MAX_MOODS = 6
MAX_MONTHS = 12
MAX_LABELS_PER_MONTH = 3

METHOD = (
    "Computed only from the dates, moods, and themes stored in your summaries. "
    "No AI is used and no feeling is inferred."
)


def _label_key(value: str) -> str:
    return normalize_text(value)


def _display_labels(
    summaries: Iterable[Summary],
    attribute: str,
    limit: int,
) -> list[dict[str, Any]]:
    counts: Counter[str] = Counter()
    display: dict[str, str] = {}

    for summary in summaries:
        values = getattr(summary, attribute, None)
        if attribute == "themes":
            values = values if isinstance(values, list) else []
        else:
            values = [values] if isinstance(values, str) else []

        for value in values:
            if not isinstance(value, str):
                continue
            cleaned = value.strip()
            key = _label_key(cleaned)
            if not key:
                continue
            counts[key] += 1
            display.setdefault(key, cleaned)

    ordered = sorted(counts.items(), key=lambda item: (-item[1], display[item[0]]))
    return [
        {"name": display[key], "count": count}
        for key, count in ordered[:limit]
    ]


def _month_key(created_at: Any) -> str | None:
    if not isinstance(created_at, datetime):
        return None
    return created_at.strftime("%Y-%m")


def _month_payload(summaries: list[Summary]) -> dict[str, Any]:
    themes = _display_labels(summaries, "themes", MAX_LABELS_PER_MONTH)
    moods = _display_labels(summaries, "mood", MAX_LABELS_PER_MONTH)
    return {
        "count": len(summaries),
        "themes": [item["name"] for item in themes],
        "moods": [item["name"] for item in moods],
    }


def _limitations(total: int) -> str:
    if total == 0:
        return "No summaries are stored yet, so there are no patterns to show."
    if total < 3:
        noun = "summary is" if total == 1 else "summaries are"
        return (
            f"Only {total} {noun} stored. These counts are too sparse to "
            "support any interpretation."
        )
    return (
        "These are counts of recorded fields only. They are not a psychological "
        "assessment, a diagnosis, or a prediction."
    )


def build_emotional_patterns(user: Any) -> dict[str, Any]:
    """Aggregate only the authenticated user's stored summary fields."""

    summaries = list(
        Summary.objects.filter(owner=user)
        .only("id", "themes", "mood", "created_at")
        .order_by("created_at")
    )

    if not summaries:
        return {
            "has_data": False,
            "total_summaries": 0,
            "period": None,
            "themes": [],
            "moods": [],
            "months": [],
            "method": METHOD,
            "limitations": _limitations(0),
        }

    months: dict[str, list[Summary]] = {}
    for summary in summaries:
        key = _month_key(summary.created_at)
        if key is None:
            continue
        months.setdefault(key, []).append(summary)

    ordered_months = sorted(months)[-MAX_MONTHS:]
    first = summaries[0].created_at
    last = summaries[-1].created_at

    return {
        "has_data": True,
        "total_summaries": len(summaries),
        "period": {
            "start": first.date().isoformat(),
            "end": last.date().isoformat(),
        },
        "themes": _display_labels(summaries, "themes", MAX_THEMES),
        "moods": _display_labels(summaries, "mood", MAX_MOODS),
        "months": [
            {"month": month, **_month_payload(months[month])}
            for month in ordered_months
        ],
        "method": METHOD,
        "limitations": _limitations(len(summaries)),
    }

# Summaries feature

AI-generated recaps of journal entries (Module 3).

## Status

**Implemented** against the Module 3 API in `apps/summaries/`:

- list, manual create, view, edit, and delete (Django + SQLite)
- generation from the signed-in user's real Module 1 journal entries
- loading, empty, success, validation, network, and provider-failure states
- list refresh after every create/update/delete/generation

## Files

| Path | Purpose |
| --- | --- |
| `pages/SummariesPage.tsx` | List, load states, dialog orchestration, refresh after mutations. |
| `components/SummaryCard.tsx` | Card with summary excerpt, mood, themes, and actions. |
| `components/Dialog.tsx` | Accessible modal: focus trap, Escape/backdrop close, focus restore. |
| `components/SummaryDetailDialog.tsx` | Read-only view of all summary fields. |
| `components/SummaryFormDialog.tsx` | Shared create/edit form with client validation. |
| `components/DeleteSummaryDialog.tsx` | Destructive confirmation. |
| `components/GenerateSummaryDialog.tsx` | Loads the caller's journal entries; posts only the entry ID. |
| `summaryForm.ts` | Validation mirroring the backend field limits. |
| `src/services/summaries.ts` | Summary API calls on top of the shared `apiClient`. |
| `src/services/journal.ts` | Module 1 journal API, reused for the entry picker. |
| `src/types/summaries.ts` | `Summary`, `SummaryInput`, `GenerateSummaryInput`. |

## API usage

- `GET /api/summaries/` — list the signed-in user's summaries.
- `POST /api/summaries/` — manual create; `owner` comes from the session.
- `PATCH /api/summaries/{id}/` — update; only the owner can reach it.
- `DELETE /api/summaries/{id}/` — delete; only the owner can reach it.
- `GET /api/journal/entries/` — real Module 1 entries for the picker.
- `POST /api/summaries/generate/` — body is `{ "journal_entry_id": 12 }`.

All requests use `src/services/apiClient.ts`, so the session cookie and
`X-CSRFToken` header are handled consistently. Summary data is never stored in
`localStorage` or a mock array, and Gemini is never called from the browser.

## Journal entries

The generation picker calls the existing Module 1 `journalApi.listAll()`, which
loads the caller's entries from `GET /api/journal/entries/` (100 per page).
Only the selected entry ID is posted to Django; the backend re-checks ownership,
loads the title and text, and calls Gemini server-side.

The backend provider lives in `apps/summaries/journal_provider.py` and queries
`journal.JournalEntry` directly. Summaries store a nullable FK back to that
entry; deleting an entry keeps the summary and clears the link.

## Tests

`npm test` (Vitest + Testing Library). The page tests stub `fetch` and cover
list/empty/loading, create, edit, delete, generation payload and failure,
journal-entry loading/empty/retry, and network retry.

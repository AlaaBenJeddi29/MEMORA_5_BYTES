# Summaries feature

AI-generated recaps of journal entries (Module 3).

## Status

**Implemented** against the Module 3 API in `apps/summaries/`:

- list, manual create, view, edit, and delete (Django + SQLite)
- generation from a temporary mock journal entry (Django calls Gemini)
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
| `components/GenerateSummaryDialog.tsx` | Mock entry picker; posts only the entry ID. |
| `summaryForm.ts` | Validation mirroring the backend field limits. |
| `mockJournalEntries.ts` | **Temporary** UI mirror of the backend fixtures (IDs 900001–900003). |
| `src/services/summaries.ts` | API calls on top of the shared `apiClient`. |
| `src/types/summaries.ts` | `Summary`, `SummaryInput`, `GenerateSummaryInput`. |

## API usage

- `GET /api/summaries/` — list the signed-in user's summaries.
- `POST /api/summaries/` — manual create; `owner` comes from the session.
- `PATCH /api/summaries/{id}/` — update; only the owner can reach it.
- `DELETE /api/summaries/{id}/` — delete; only the owner can reach it.
- `POST /api/summaries/generate/` — body is `{ "journal_entry_id": 900001 }`.

All requests use `src/services/apiClient.ts`, so the session cookie and
`X-CSRFToken` header are handled consistently. Summary data is never stored in
`localStorage` or a mock array, and Gemini is never called from the browser.

## Mock journal entries

The backend has no journal-entry list endpoint yet, so
`mockJournalEntries.ts` mirrors `apps/summaries/mock_journal_entries.py`. It is
display data only: Django resolves the entry and its content. Remove this file
once Module 1 provides a real endpoint.

## Tests

`npm test` (Vitest + Testing Library). The page tests stub `fetch` and cover
list/empty/loading, create, edit, delete, generation payload and failure, and
network retry.

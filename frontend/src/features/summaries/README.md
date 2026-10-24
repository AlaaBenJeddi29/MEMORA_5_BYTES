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
| `components/GenerateSummaryDialog.tsx` | Loads the mock entry picker; posts only the entry ID. |
| `summaryForm.ts` | Validation mirroring the backend field limits. |
| `src/services/summaries.ts` | API calls on top of the shared `apiClient`. |
| `src/types/summaries.ts` | `Summary`, `SummaryInput`, `MockJournalEntryOption`, `GenerateSummaryInput`. |

## API usage

- `GET /api/summaries/` — list the signed-in user's summaries.
- `POST /api/summaries/` — manual create; `owner` comes from the session.
- `PATCH /api/summaries/{id}/` — update; only the owner can reach it.
- `DELETE /api/summaries/{id}/` — delete; only the owner can reach it.
- `GET /api/summaries/mock-journal-entries/` — temporary read-only picker.
- `POST /api/summaries/generate/` — body is `{ "journal_entry_id": 900001 }`.

All requests use `src/services/apiClient.ts`, so the session cookie and
`X-CSRFToken` header are handled consistently. Summary data is never stored in
`localStorage` or a mock array, and Gemini is never called from the browser.

## Mock journal entries

The picker calls `GET /api/summaries/mock-journal-entries/`, which returns only
`id`, `title`, and `created_at` for the development fixtures. There is no
frontend fixture copy, so the backend stays the single source of truth.
Generation sends only the selected ID; Django loads the entry content and calls
Gemini server-side.

**Replacement point:** `apps/summaries/journal_provider.py`. Swap the
`journal_provider` singleton from `MockJournalProvider` to a provider backed by
Module 1's real `JournalEntry` model once its model/API contract and migrations
are agreed. Nothing in this feature or in the views needs to change if the new
provider implements `JournalEntryProvider`.

## Tests

`npm test` (Vitest + Testing Library). The page tests stub `fetch` and cover
list/empty/loading, create, edit, delete, generation payload and failure, and
network retry.

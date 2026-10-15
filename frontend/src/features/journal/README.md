# Journal feature

Text journal entries: write, read, and revisit.

## Status

**Shell only.** `apps/journal/` has no models or endpoints yet, so
`pages/JournalListPage.tsx` renders the shared `ModulePlaceholder`. Nothing is
loaded or saved.

## Where to add UI

- `pages/` — one file per screen (list, detail, composer/editor). Register routes
  in `src/app/router.tsx` under the authenticated `AppLayout` (e.g.
  `/app/journal`, `/app/journal/:id`).
- Reuse `src/components/` (PageHeader, EmptyState, Alert, Button, FormField,
  LoadingState, StatusBadge) and the design tokens in `src/styles/global.css`.

## Where to add API integration

- `services/` — add a thin client, e.g. `services/journal.ts`, built on
  `src/services/apiClient.ts` (it already sends credentials and the CSRF header).
  Keep one exported function per endpoint.
- `types/` — add request/response types alongside `types/api.ts`.

## API reference

Proposed endpoints only — see `docs/API_CONTRACT.md` §3.2. Do not call them until
they are marked **[IMPLEMENTED]**.

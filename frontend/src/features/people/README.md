# People feature

The people who appear in your entries (with future opt-in face grouping).

## Status

**Shell only.** `apps/people/` has no models or endpoints yet, so
`pages/PeoplePage.tsx` renders the shared `ModulePlaceholder`.

## Where to add UI

- `pages/` — a people list and a create/edit form. Register routes in
  `src/app/router.tsx` under the authenticated `AppLayout`.
- Face grouping is **opt-in** and sensitive: keep it behind an explicit action,
  never log face data, and show only the user's own groupings.

## Where to add API integration

- `services/` — add `services/people.ts` on top of `src/services/apiClient.ts`.
- `types/` — add the people types next to `types/api.ts`.

## API reference

Proposed endpoints only — see `docs/API_CONTRACT.md` §3.6. The `identify-faces`
path is still an unresolved team decision (§4.10); do not assume it. Do not call
any of these until marked **[IMPLEMENTED]**.

# Summaries feature

AI-generated recaps of journal entries over a date range.

## Status

**Shell only.** `apps/summaries/` has no models or endpoints yet, so
`pages/SummariesPage.tsx` renders the shared `ModulePlaceholder`.

## Where to add UI

- `pages/` — a request form (date range) and a list/detail of summaries. Register
  routes in `src/app/router.tsx` under the authenticated `AppLayout`.
- Use `StatusBadge` for the `status` values (`pending` / `processing` /
  `succeeded` / `failed`) and `LoadingState` while polling.

## Where to add API integration

- `services/` — add `services/summaries.ts` on top of `src/services/apiClient.ts`.
  Generation is async-shaped (`202`), so poll the resource until it settles and
  surface `error` honestly when `status === "failed"`.
- `types/` — add the summary types next to `types/api.ts`.

## API reference

Proposed endpoints only — see `docs/API_CONTRACT.md` §3.4 (async states §1.9).
Do not call them until marked **[IMPLEMENTED]**.

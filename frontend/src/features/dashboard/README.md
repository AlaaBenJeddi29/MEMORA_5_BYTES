# Dashboard feature

The authenticated landing page (`/app`). It welcomes the signed-in user and links
to the other modules.

## Status

Shell only — **no data**. By design it shows no counts, entries, summaries,
people, or media, because none of those models exist yet.

## Where to add UI

- `pages/DashboardPage.tsx` — the landing screen. Keep it to navigation and
  honest status text until modules actually have data.
- New sections go here, reusing shared components from `src/components/` and the
  design tokens in `src/styles/global.css`.

## Where to add API integration

Only once module endpoints exist. If the dashboard later shows real aggregates,
add an API module under `services/` built on `src/services/apiClient.ts` and call
it here. Until then, **do not** call module endpoints.

## API reference

None. Proposed module endpoints live in `docs/API_CONTRACT.md` §3.

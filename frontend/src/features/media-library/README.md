# Media library feature

Photos and videos attached to the journal.

## Status

**Shell only.** `apps/media/` has no models or endpoints yet, so
`pages/MediaLibraryPage.tsx` renders the shared `ModulePlaceholder`.

## Where to add UI

- `pages/` — a gallery/list and an upload control. Register routes in
  `src/app/router.tsx` under the authenticated `AppLayout`.
- Delete actions should confirm first and reflect the `204` result; reuse
  `EmptyState` for the no-items case.

## Where to add API integration

- `services/` — add `services/media.ts` on top of `src/services/apiClient.ts`.
  Uploads are `multipart/form-data`; the client passes `FormData` through as-is.
- `types/` — add the media types next to `types/api.ts`.

## API reference

Proposed endpoints only — see `docs/API_CONTRACT.md` §3.5 (upload rules §1.8).
Do not call them until marked **[IMPLEMENTED]**.

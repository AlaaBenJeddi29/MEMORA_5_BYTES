# Audio / voice memos feature

Record and store voice memos (with future transcription and sentiment).

## Status

**Shell only.** `apps/audio/` has no models or endpoints yet, so
`pages/AudioListPage.tsx` renders the shared `ModulePlaceholder`.

## Where to add UI

- `pages/` — recorder/upload screen and a list/detail view. Register routes in
  `src/app/router.tsx` under the authenticated `AppLayout`.
- For uploads, reuse `FormField`/`Button` and handle the file input's own
  validation, mirroring the server rules (see API reference).

## Where to add API integration

- `services/` — add `services/audio.ts` on top of `src/services/apiClient.ts`.
  Uploads are `multipart/form-data`; the client already passes `FormData`
  through untouched (it does not force a JSON content type).
- Poll the detail endpoint for async fields (`status`, `transcript`, `sentiment`)
  per the AI processing states in the contract.
- `types/` — add the audio types next to `types/api.ts`.

## API reference

Proposed endpoints only — see `docs/API_CONTRACT.md` §3.3 (upload rules §1.8,
AI states §1.9). Do not call them until marked **[IMPLEMENTED]**.

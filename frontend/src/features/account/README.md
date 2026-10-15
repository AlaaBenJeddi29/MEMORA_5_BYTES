# Account feature

The signed-in user's own account page (`/app/account`).

## Status

Read-only, against the **real** endpoint. It displays only the fields returned by
`GET /api/accounts/me/`: `username`, `email`, `first_name`, `last_name`,
`date_joined`.

## Why there is no editing

There is no update endpoint today — `PUT`/`PATCH`/`DELETE /api/accounts/me/`
return `405`. Profile editing (`PATCH /api/accounts/me/`) is only *proposed*
(`docs/API_CONTRACT.md` §3.1) and is an unresolved team decision (§4.2–4.3). Do
not add an edit form until that endpoint exists.

## Where to add UI

- `pages/MyAccountPage.tsx` — the account screen.

## Where to add API integration

If `PATCH /api/accounts/me/` is approved and implemented, add an `updateMe`
function to `src/services/auth.ts` (or a new `services/account.ts`) using
`src/services/apiClient.ts`, then add the edit form here. Auth state lives in
`features/auth`; `useAuth()` exposes `refresh()` to re-read the user after a
successful update.

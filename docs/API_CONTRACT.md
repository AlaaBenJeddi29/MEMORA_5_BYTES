# MEMORA — API Contract

> **Status: proposal for team discussion.** This document describes the target API
> so the five modules can be built in parallel without drifting. It is **not** a
> claim that everything here exists yet.

## 0. How to read this document

Every endpoint is tagged:

- **[IMPLEMENTED]** — already in the code today (verified).
- **[PROPOSED]** — agreed direction, not built yet. Do not assume it exists.

Base URL for local development: `http://127.0.0.1:8000`

| Area | Mounted prefix today | Implemented endpoints today |
| --- | --- | --- |
| Accounts | `/api/accounts/` | register, login, logout, me, csrf |
| Journal | `/api/journal/` | none (empty router) |
| Audio | `/api/audio/` | none (empty router) |
| Summaries | `/api/summaries/` | none (empty router) |
| Media | `/api/media/` | none (empty router) |
| People | `/api/people/` | none (empty router) |

There are **no models** yet in any app — every `models.py` is an empty stub. So the
field lists in section 3 are proposals, not existing schema.

---

## 1. Shared conventions

### 1.1 Base path, format, headers

- All endpoints live under `/api/`.
- Request and response bodies are `application/json`, **except** file uploads,
  which use `multipart/form-data`.
- Send `Content-Type: application/json` on JSON requests.

### 1.2 Authentication — sessions + CSRF **[IMPLEMENTED, team-approved]**

MEMORA uses **Django session authentication** (the `SessionAuthentication` class
already configured in `settings.REST_FRAMEWORK`). No JWT, no tokens, no social login.

Flow:

1. `POST /api/accounts/login/` with credentials → Django sets an **`sessionid`**
   cookie (HttpOnly) identifying the server-side session. **[IMPLEMENTED]**
2. The browser sends `sessionid` automatically on later requests.
3. **CSRF:** because the cookie travels automatically, Django protects unsafe
   methods. The client must echo the **`csrftoken`** cookie in the
   **`X-CSRFToken`** header on any `POST`/`PUT`/`PATCH`/`DELETE` made *while
   authenticated*. `GET /api/accounts/csrf/` exists to make sure that cookie is set.

React example (dev-server proxy so this is same-origin — simplest option).
**Note:** `PATCH /api/accounts/me/` is *proposed* (see §3.1) — today `/me/` accepts
only `GET`, so the snippet below illustrates the CSRF header pattern, not a call
that works yet.

```js
// read the csrftoken cookie, then:
await fetch("/api/accounts/me/", {
  method: "PATCH",
  credentials: "include",
  headers: { "Content-Type": "application/json", "X-CSRFToken": getCookie("csrftoken") },
  body: JSON.stringify({ first_name: "Ada" }),
});
```

Notes:
- `register` and `login` are **anonymous** requests, so DRF does not enforce CSRF
  on them (there is no session to protect yet).
- If the SPA is *not* same-origin, the API must allow credentials
  (`CORS_ALLOW_CREDENTIALS = True`, already set) and the SPA origin must be listed
  in `CORS_ALLOWED_ORIGINS` **and** `CSRF_TRUSTED_ORIGINS` (the latter is not yet
  configured — see unresolved decisions).

### 1.3 Authorization & ownership **[team rule]**

- Being **authenticated** is not enough; every object is **owned**.
- Every business model has an owner FK to `settings.AUTH_USER_MODEL`, and **every
  queryset is filtered to `request.user`**. A user must never be able to read,
  update, or delete another user's data.
- Object-level access on a non-owned id should behave as **404 Not Found** (do not
  reveal that someone else's object exists). List endpoints return only the
  caller's objects.
- Permission classes: `AllowAny` for `register`/`login`/`csrf`; `IsAuthenticated`
  for everything else (the project default).

### 1.4 Identifiers

Integer primary keys (`BigAutoField`). Example: `"id": 1`.

### 1.5 Timestamps & time zone **[convention]**

- Project runs with `USE_TZ = True`; times are stored in **UTC**.
- Serialized as ISO-8601 with a `Z` suffix, e.g. `"2026-10-15T17:38:36.271891Z"`.
- Business models should expose `created_at` and `updated_at`
  (`auto_now_add=True` / `auto_now=True`). Clients display in local time.

### 1.6 Pagination **[PROPOSED — not configured yet]**

Lists use DRF `PageNumberPagination` with `page_size = 20`, overridable with
`?page_size=` (max 100) and `?page=`.

```json
{
  "count": 42,
  "next": "http://127.0.0.1:8000/api/journal/entries/?page=3",
  "previous": "http://127.0.0.1:8000/api/journal/entries/?page=1",
  "results": [ { "id": 1 }, { "id": 2 } ]
}
```

> Currently `settings.REST_FRAMEWORK` has **no** `DEFAULT_PAGINATION_CLASS`, so list
> endpoints return a bare array. Adding pagination is a shared-settings change.

### 1.7 Error format **[convention — matches DRF]**

Field-level validation errors are keyed by field; general errors use
`non_field_errors`; auth/permission problems use `detail`.

| Status | When | Body shape |
| --- | --- | --- |
| `400 Bad Request` | Validation fails | `{"<field>": ["msg", ...]}`, `{"non_field_errors": ["msg"]}` |
| `403 Forbidden` | Not authenticated (session auth) or not permitted | `{"detail": "Authentication credentials were not provided."}` |
| `404 Not Found` | Object absent **or not owned by caller** | `{"detail": "No <Resource> matches the given query."}` |
| `405 Method Not Allowed` | Wrong verb for the route | `{"detail": "Method \"PUT\" not allowed."}` |
| `409 Conflict` | Duplicate where uniqueness is a business rule (optional) | `{"detail": "..."}` |

> Note: with `SessionAuthentication`, **unauthenticated** requests return **403**
> (not 401), because no `WWW-Authenticate` header is sent.

### 1.8 Uploads **[PROPOSED]**

- Uploads are `multipart/form-data` with the file in a `file` field.
- Server-side validation is mandatory: **size limit** and **allowed content types**
  (never trust the client's filename/extension).
  - Audio: allow `audio/mpeg`, `audio/wav`, `audio/webm`, `audio/mp4`; max **25 MB**.
  - Image: allow `image/jpeg`, `image/png`, `image/webp`; max **10 MB**.
- Validation failure → `400` with the file field:
  ```json
  { "file": ["File too large. Maximum size is 25 MB."] }
  ```
  ```json
  { "file": ["Unsupported file type. Allowed: audio/mpeg, audio/wav, ..."] }
  ```
- Django/DRF do **not** emit `413 Payload Too Large` by default; we return `400`
  with a clear message (or add custom middleware later — unresolved decision).
- Files are stored under `MEDIA_ROOT` with per-user `upload_to` paths (local
  filesystem in dev; cloud later).

### 1.9 AI processing states **[PROPOSED]**

AI work (transcription, sentiment, summaries, illustrations, face grouping) is
asynchronous-shaped even if the first version runs synchronously. Every AI-backed
resource exposes:

| Field | Values |
| --- | --- |
| `status` | `pending` · `processing` · `succeeded` · `failed` |
| `error` | `null`, or a human-readable string when `status == "failed"` |
| `created_at` / `updated_at` | timestamps (see 1.5) |

```json
{ "id": 7, "status": "processing", "error": null }
```

- Submitting AI work returns **`202 Accepted`** with `status: "pending"` (or
  `processing`) so the client can poll.
- Poll the resource's detail endpoint until `succeeded`/`failed`.
- **Never** log journal text, transcripts, tokens, face encodings, or raw media.
- AI providers are wrapped in a service layer with timeouts and mocked in tests;
  the test suite never makes a real paid call.

### 1.10 Versioning

Unversioned `/api/` for now. Introducing `/api/v1/` later is a team decision.

---

## 2. Implemented endpoints — Accounts **[IMPLEMENTED]**

All payloads below were captured from the running code.

### 2.1 `POST /api/accounts/register/`

| | |
| --- | --- |
| **Auth** | None (`AllowAny`) |
| **Ownership** | Creates the caller's own account |
| **Request** | `username` (unique), `email` (unique, optional), `password`, `password_confirm` |
| **Response** | `201` + user object |
| **Never accepted** | `is_staff`, `is_superuser`, `groups`, `user_permissions` — silently ignored |

Request:
```json
{
  "username": "ada",
  "email": "ada@example.com",
  "password": "S3cure-Passw0rd!",
  "password_confirm": "S3cure-Passw0rd!"
}
```

Response `201`:
```json
{
  "id": 1,
  "username": "ada",
  "email": "ada@example.com",
  "first_name": "",
  "last_name": "",
  "date_joined": "2026-10-15T17:38:36.271891Z"
}
```

Validation errors (`400`):
```json
{ "username": ["A user with that username already exists."] }
```
```json
{ "password_confirm": ["Passwords do not match."] }
```
```json
{ "password": [
  "This password is too short. It must contain at least 8 characters.",
  "This password is too common.",
  "This password is entirely numeric."
] }
```
> Password rules come from `AUTH_PASSWORD_VALIDATORS`. Passwords are hashed via
> Django's APIs and never returned.

### 2.2 `POST /api/accounts/login/`

| | |
| --- | --- |
| **Auth** | None (`AllowAny`) |
| **Request** | `username`, `password` |
| **Response** | `200` + user object, and sets the `sessionid` cookie |

Request:
```json
{ "username": "ada", "password": "S3cure-Passw0rd!" }
```

Response `200` (same shape as 2.1). Invalid credentials:
```json
{ "non_field_errors": ["Invalid username or password."] }
```

### 2.3 `POST /api/accounts/logout/`

| | |
| --- | --- |
| **Auth** | Required (`IsAuthenticated`) |
| **Request** | empty |
| **Response** | `204 No Content` (session cleared) |

Anonymous → `403`:
```json
{ "detail": "Authentication credentials were not provided." }
```

### 2.4 `GET /api/accounts/me/`

| | |
| --- | --- |
| **Auth** | None — this doubles as the SPA's session probe |
| **Ownership** | Returns **only** `request.user` — no id parameter exists |
| **Response** | `200` + the caller's user object, or `204` when signed out |

Response `200`:
```json
{
  "id": 1,
  "username": "ada",
  "email": "ada@example.com",
  "first_name": "Ada",
  "last_name": "Lovelace",
  "date_joined": "2026-10-15T17:38:36.271891Z"
}
```
Anonymous → `204 No Content` (no body), so the SPA can check auth state
without treating a signed-out visitor as an error.
`PUT`/`PATCH`/`DELETE` → `405` (only `GET` exists today).

### 2.5 `GET /api/accounts/csrf/`

| | |
| --- | --- |
| **Auth** | None (`AllowAny`) |
| **Response** | `200` + sets the `csrftoken` cookie |

```json
{ "detail": "CSRF cookie set." }
```

---

## 3. Proposed endpoints **[PROPOSED — not implemented]**

> These are the target for the five modules. Field names are proposals; confirm in
> review. Shared shape: `id`, `created_at`, `updated_at`, and the owner is implicit
> (`request.user`).

### 3.1 Accounts — profile

| Method | Path | Auth | Ownership |
| --- | --- | --- | --- |
| `PATCH` | `/api/accounts/me/` | Required | Own profile only |

- Editable fields: `first_name`, `last_name`, `email`. **Never** `username`,
  `is_staff`, `is_superuser`, groups, permissions (read-only / ignored).
- Unknown fields are ignored; updating another user is impossible (no id in path).

```json
// PATCH request
{ "first_name": "Ada", "last_name": "Lovelace" }
// 200 response
{ "id": 1, "username": "ada", "email": "ada@example.com",
  "first_name": "Ada", "last_name": "Lovelace",
  "date_joined": "2026-10-15T17:38:36.271891Z" }
```

> Whether a separate `Profile` model is needed is **unresolved** (see §4). If we add
> one (`OneToOneField(settings.AUTH_USER_MODEL)`), its extra fields (`display_name`,
> `avatar`, `bio`, `timezone`) would nest here.

### 3.2 Journal — entries

| Method | Path | Auth | Ownership |
| --- | --- | --- | --- |
| `GET` | `/api/journal/entries/` | Required | Only the caller's entries |
| `POST` | `/api/journal/entries/` | Required | Created for `request.user` |
| `GET` | `/api/journal/entries/{id}/` | Required | 404 if not owner |
| `PATCH` | `/api/journal/entries/{id}/` | Required | 404 if not owner |
| `DELETE` | `/api/journal/entries/{id}/` | Required | 404 if not owner |

Fields (proposal): `id`, `title`, `content`, `entry_date`, `created_at`, `updated_at`.

```json
// POST request
{ "title": "Morning", "content": "First coffee...", "entry_date": "2026-10-15" }
// 201 response
{ "id": 12, "title": "Morning", "content": "First coffee...",
  "entry_date": "2026-10-15", "created_at": "2026-10-15T08:00:00.000000Z",
  "updated_at": "2026-10-15T08:00:00.000000Z" }
```

> **Path conflict to resolve:** your proposal table used `/api/entries/`, but the
> project already mounts the app at `/api/journal/`. Recommended:
> `/api/journal/entries/` (keeps one app = one prefix). See §4.

### 3.3 Audio

| Method | Path | Auth | Ownership |
| --- | --- | --- | --- |
| `POST` | `/api/audio/` | Required | Upload owned by caller |
| `GET` | `/api/audio/{id}/` | Required | 404 if not owner |

Fields (proposal): `id`, `file`, `duration_seconds`, `transcript`, `sentiment`,
`status` (§1.9), `created_at`. Upload via `multipart/form-data`.

```json
// POST (multipart) -> 201
{ "id": 5, "file": "http://127.0.0.1:8000/media/audio/1/memo.mp3",
  "duration_seconds": 42.5, "transcript": null, "sentiment": null,
  "status": "pending", "created_at": "2026-10-15T09:00:00.000000Z" }
```

Upload errors → `400` (`{"file": ["File too large. Maximum size is 25 MB."]}`).

### 3.4 Summaries

| Method | Path | Auth | Ownership |
| --- | --- | --- | --- |
| `POST` | `/api/summaries/generate/` | Required | Only summarizes entries owned by requester |
| `GET` | `/api/summaries/` | Required | Only the caller's summaries |

```json
// POST request
{ "date_from": "2026-10-14", "date_to": "2026-10-15" }
// 202 response (async-shaped)
{ "id": 8, "status": "pending", "content": null, "error": null,
  "created_at": "2026-10-15T21:00:00.000000Z" }
```
- Requesting a range with **no owned entries** → `400`
  `{"non_field_errors": ["No entries found for the requested period."]}`.
- AI failures never leak internals: `{"status": "failed", "error": "Summarization failed."}`.

#### Implemented Module 3 shape (temporary journal source)

The current implementation differs from the async proposal above and will be
reconciled when Module 1 lands:

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/summaries/` | Required | Caller's summaries only |
| `POST` | `/api/summaries/` | Required | Manual create; owner from session |
| `PATCH` | `/api/summaries/{id}/` | Required | 404 if not owner |
| `DELETE` | `/api/summaries/{id}/` | Required | 404 if not owner |
| `GET` | `/api/summaries/mock-journal-entries/` | Required | **Temporary**, read-only picker |
| `POST` | `/api/summaries/generate/` | Required | Body `{"journal_entry_id": 900001}` |

`mock-journal-entries/` returns only `id`, `title`, and `created_at`; it never
exposes journal content and supports `GET` only (other verbs → `405`). The
fixtures are not stored in SQLite, have no detail route, and cannot be created,
edited, or deleted through the API. Generation accepts only the ID; the server
resolves the content from the provider and calls Gemini.

**Replacement point:** `apps/summaries/journal_provider.py`. Once Module 1's
`JournalEntry` model/API contract and migrations are agreed, implement
`JournalEntryProvider` against it (filtering by `user`) and replace the
`journal_provider` singleton. Views, serializers, and the React feature do not
change. Do not add a `JournalEntry` foreign key to `Summary` before that contract
exists.

### 3.5 Media

| Method | Path | Auth | Ownership |
| --- | --- | --- | --- |
| `GET` | `/api/media/` | Required | Only the caller's uploads |
| `POST` | `/api/media/` | Required | Upload owned by caller |
| `DELETE` | `/api/media/{id}/` | Required | 404 if not owner |

Fields (proposal): `id`, `file`, `kind` (`image`/`video`), `status` (§1.9),
`created_at`. Delete returns `204`.

### 3.6 People (faces)

| Method | Path | Auth | Ownership |
| --- | --- | --- | --- |
| `GET` | `/api/people/` | Required | Only the caller's people |
| `POST` | `/api/people/` | Required | Created for `request.user` |
| `POST` | `/api/media/{id}/identify-faces/` | Required | 404 if media not owner's; **opt-in** |

Fields (proposal): `id`, `name`, `notes`, `created_at`.

```json
// POST /api/people/
{ "name": "Sam", "notes": "met at the library" }
// 201
{ "id": 3, "name": "Sam", "notes": "met at the library",
  "created_at": "2026-10-15T10:00:00.000000Z" }
```

> **Cross-module note:** `identify-faces` lives under `/api/media/{id}/` but is a
> People feature. Either mount it under People (`/api/people/identify-faces/?media={id}`)
> or keep it in Media and have the Media app own it. Decide in §4. Face data is
> sensitive: it is **opt-in**, scoped to the owner, never logged, and returns only
> the requester's own grouping.

---

## 4. Unresolved team decisions

1. **Journal path:** `/api/journal/entries/` (recommended) vs the proposed `/api/entries/`.
2. **`Profile` model:** create one (with which fields) or extend `/api/accounts/me/`
   to edit built-in `User` fields only? *Blocking for §3.1.*
3. **`PATCH /api/accounts/me/`:** approve self-service profile updates?
4. **Admin ownership:** who registers which models in `/admin/` — is that this task
   or the separate admin task?
5. **Pagination:** adopt DRF `PageNumberPagination` (page size, max) — changes shared settings.
6. **Error envelope:** keep DRF defaults (recommended) or add a uniform wrapper?
7. **CSRF_TRUSTED_ORIGINS:** set it for cross-origin React, or standardize on a Vite proxy?
8. **Upload limits:** confirm size caps (25 MB audio / 10 MB image) and allowed MIME types,
   and whether to emit `400` or a custom `413`.
9. **AI execution:** hosted APIs vs local models (affects latency, quotas, privacy);
   see §1.9. Also: synchronous vs Celery/background for `status` transitions.
10. **Face recognition / People:** opt-in mechanism and privacy policy wording; where
    `identify-faces` lives (§3.6).
11. **Media storage:** local filesystem (dev) vs S3 from the start.
12. **Rate limiting:** add DRF throttling on `login`/`register`?
13. **API versioning:** introduce `/api/v1/` now or later.
14. **`docs/API_CONTRACT.md` ownership:** who updates it, and when (per PR?).

---

## 5. Change log

| Date | Change | Author |
| --- | --- | --- |
| 2026-10-15 | Initial draft: conventions + implemented Accounts endpoints + proposed module endpoints | — |
| 2026-10-15 | §1.2: mark the React `PATCH /me/` example as proposed (today `/me/` is `GET` only) | — |

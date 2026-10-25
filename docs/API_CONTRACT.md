# MEMORA — API Contract

> **Status: implemented endpoints are marked below; remaining proposals are part
> of the target API.** The modules were built in parallel, so this document
> records what the code does today and what is still open.

## 0. How to read this document

Every endpoint is tagged:

- **[IMPLEMENTED]** — already in the code today (verified).
- **[PROPOSED]** — agreed direction, not built yet. Do not assume it exists.

Base URL for local development: `http://127.0.0.1:8000`

| Area | Mounted prefix today | Implemented endpoints today |
| --- | --- | --- |
| Accounts | `/api/accounts/` | register, login, logout, me, csrf |
| Journal | `/api/journal/` | entries CRUD + search (§3.2) |
| Audio | `/api/audio/` | list, upload, detail, patch, delete (§3.3) |
| Summaries | `/api/summaries/` | list, manual CRUD, generate (§3.4) |
| Media | `/api/media/` | list, detail, update, delete, upload, generate (§3.5) |
| People | `/api/people/` | none (empty router) |

Accounts, Journal, Audio, Summaries, and Media are implemented. People and the
account profile update in §3.1 remain proposals.

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
  in `CORS_ALLOWED_ORIGINS` **and** `CSRF_TRUSTED_ORIGINS` (both are configured
  in `config/settings.py` for the local development origins).

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

### 1.6 Pagination

Journal list and search use DRF `PageNumberPagination` (`page_size = 10`,
overridable with `?page_size=`, max 100). The envelope is
`count`/`next`/`previous`/`results`.

```json
{
  "count": 42,
  "next": "http://127.0.0.1:8000/api/journal/entries/?page=3",
  "previous": "http://127.0.0.1:8000/api/journal/entries/?page=1",
  "results": [ { "id": 1 }, { "id": 2 } ]
}
```

> `settings.REST_FRAMEWORK` still has no `DEFAULT_PAGINATION_CLASS`; Journal sets
> `pagination_class` on its viewset. Audio, Summaries, and Media lists return a
> bare array. A shared pagination default remains a team decision (§4.5).

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

- Submitting asynchronous AI work returns **`202 Accepted`** with
  `status: "pending"` (or `processing`) so the client can poll.
- Poll the resource's detail endpoint until `succeeded`/`failed`.
- **Media generation is synchronous** in Module 4: the request polls local
  ComfyUI with a bounded deadline and returns `201` only after storing a
  successful image. Persisted rows are `succeeded`; failures return an error and
  create no row. The status choices remain ready for a future async queue.
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
| **Session** | Starts an authenticated session; the SPA lands signed in |
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

## 3. Module endpoints **[IMPLEMENTED unless tagged PROPOSED]**

> Journal, Audio, Summaries, and Media are implemented. §3.1 (profile update) and
> §3.6 (People) are still proposals. Shared shape: `id`, `created_at`,
> `updated_at`, and the owner is implicit (`request.user`).

### 3.1 Accounts — profile **[PROPOSED]**

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

### 3.2 Journal — entries **[IMPLEMENTED]**

| Method | Path | Auth | Ownership |
| --- | --- | --- | --- |
| `GET` | `/api/journal/entries/` | Required | Only the caller's entries; paginated (§1.6) |
| `POST` | `/api/journal/entries/` | Required | Created for `request.user` |
| `GET` | `/api/journal/entries/{id}/` | Required | 404 if not owner |
| `PUT`/`PATCH` | `/api/journal/entries/{id}/` | Required | 404 if not owner |
| `DELETE` | `/api/journal/entries/{id}/` | Required | 404 if not owner |
| `GET` | `/api/journal/entries/search/` | Required | Title/date search over the caller's entries |

Fields: `id`, `title`, `text`, `audio_file`, `summary_text`, `sentiment`,
`created_at`, `user`, `photos` (read-only media IDs linked through
`journal_journalentry_photos`). `user` is set from the session and cannot be
changed by the client. Search accepts `q` (title contains), `date_from`,
`date_to`, and `page`.

```json
// POST request
{ "title": "Morning", "text": "First coffee..." }
// 201 response
{ "id": 12, "title": "Morning", "text": "First coffee...",
  "audio_file": "", "summary_text": "", "sentiment": "",
  "created_at": "2026-10-15T08:00:00.000000Z", "user": "ada", "photos": [] }
```

Module 4 reuses this API for its journal picker and for owner-scoped generation
validation. Only `title` and `summary_text` are eligible for an illustration
prompt; the entry body (`text`) is never sent to ComfyUI.

### 3.3 Audio **[IMPLEMENTED]**

| Method | Path | Auth | Ownership |
| --- | --- | --- | --- |
| `GET` | `/api/audio/` | Required | Only the caller's entries |
| `POST` | `/api/audio/` | Required | Upload owned by caller |
| `GET` | `/api/audio/{id}/` | Required | 404 if not owner |
| `PATCH` | `/api/audio/{id}/` | Required | 404 if not owner; `transcript`/`summary`, or a new `file` that re-runs the AI |
| `DELETE` | `/api/audio/{id}/` | Required | 404 if not owner; deletes file too |

Fields: `id`, `file` (absolute URL), `duration_seconds`, `transcript`,
`language_code`, `language_name`, `sentiment`, `sentiment_score`, `summary`,
`status` (§1.9), `error`, `created_at`, `updated_at`. Upload via
`multipart/form-data` (max 25 MB; allowed MIME types per §1.8 —
mp3/wav/webm/mp4/ogg).

AI processing (Groq: Whisper transcription, then an LLM for language detection,
sentiment analysis and summary) runs on a **background thread**: the upload
answers immediately with `status: "pending"`, and the client **must** poll
`GET /api/audio/{id}/` (`pending → processing → succeeded|failed`) until a final
status. Celery is the production successor; the contract does not change.

Models used (configured in `apps/audio/services.py`, overridable through `.env`):
`whisper-large-v3-turbo` (ASR, `GROQ_ASR_MODEL`) and `openai/gpt-oss-20b`
(language, sentiment, summary — `GROQ_LLM_MODEL`). Groq's Whisper endpoint does
not report the spoken language, so language detection is a separate LLM call over
the transcript. `response_format: json_object` is requested for the structured
language/sentiment answers, with a plain-text retry when a model rejects JSON
mode.

```json
// POST (multipart) -> 201, processing continues in the background
{ "id": 5, "file": "http://127.0.0.1:8000/media/audio/1/memo.webm",
  "duration_seconds": null, "transcript": null,
  "language_code": null, "language_name": null,
  "sentiment": null, "sentiment_score": null, "summary": null,
  "status": "pending", "error": null,
  "created_at": "2026-10-15T09:00:00.000000Z",
  "updated_at": "2026-10-15T09:00:00.000000Z" }

// GET /api/audio/5/ a few seconds later -> 200
{ "id": 5, "status": "succeeded", "transcript": "aujourd'hui il fait beau",
  "language_code": "fr", "language_name": "French",
  "sentiment": "positive", "sentiment_score": 0.93,
  "summary": "A note about the nice weather.",
  "duration_seconds": 3.2, "error": null }
```

**Correcting the transcript.** The AI can mishear a word, so
`PATCH /api/audio/{id}/` accepts `transcript` and `summary` — language, sentiment
and `status` stay read-only because they are derived from the audio, not typed.
Body may be partial (JSON), but at least one editable field is required.

```json
// PATCH /api/audio/5/  { "transcript": "aujourd'hui il fait très beau" } -> 200
{ "id": 5, "status": "succeeded", "transcript": "aujourd'hui il fait très beau",
  "summary": "A note about the nice weather.", "…": "same read fields as GET" }
```

**Replacing the recording.** The same route also accepts `file` as
`multipart/form-data`, with the upload constraints of §1.8 (25 MB, same MIME
allow-list). A new recording invalidates everything computed from the old one, so
`duration_seconds`, `transcript`, `language_code`, `language_name`, `sentiment`,
`sentiment_score`, `summary` and `error` are cleared, `status` goes back to
`pending`, the previous file is deleted from storage, and the AI pipeline runs
again — exactly like `POST /api/audio/`. The answer is the entry in `pending`
state and the client resumes polling.

`file` cannot be combined with `transcript`/`summary` in one request (the
replacement empties them): `400`.

```json
// PATCH /api/audio/5/  multipart: file=prise_2.wav -> 200
{ "id": 5, "status": "pending", "transcript": null, "summary": null,
  "language_code": null, "language_name": null, "sentiment": null,
  "sentiment_score": null, "duration_seconds": null, "error": null,
  "file": "http://127.0.0.1:8000/media/audio/1/prise_2.wav" }
```

Only a real upload is accepted: a storage path sent as a string → `400`
(`{"file": ["Send the recording as a file upload, not a stored path."]}`), so no
client can attach — and therefore read — another user's saved recording.

An empty payload → `400`
(`{"non_field_errors": ["Provide at least one editable field: transcript, summary or file."]}`).
Editing while `status` is `pending`/`processing` → `409`
(`{"detail": "This memo is still being transcribed. Save your edit once it finishes."}`),
because the worker would overwrite the correction. A `failed` memo stays editable,
so the user can type the text by hand or send a better recording.

Upload errors → `400` (`{"file": ["File too large. Maximum size is 25 MB."]}`).
AI failures never leak internals, but stay actionable:
`{"status": "failed", "error": "AI processing failed. Please try again."}`, and a
server without credentials returns
`{"status": "failed", "error": "AI service not configured. Set GROQ_API_KEY in the server environment."}`.
Quota/rate-limit, unavailable model, rejected audio format and timeout each get
their own message; none of them is ever replaced by a fake transcript.
`Delete` returns `204`.

### 3.4 Summaries **[IMPLEMENTED]**

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/summaries/` | Required | Caller's summaries only |
| `POST` | `/api/summaries/` | Required | Manual create; owner from session; optional owned `journal_entry_id` |
| `PATCH` | `/api/summaries/{id}/` | Required | 404 if not owner; entry must be owned |
| `DELETE` | `/api/summaries/{id}/` | Required | 404 if not owner |
| `POST` | `/api/summaries/generate/` | Required | Body `{"journal_entry_id": 12}` |

The response shape does not include the source journal text. Fields: `id`,
`owner`, `journal_entry_id`, `summary_text`, `mood`, `themes`,
`illustration_prompt`, `created_at`, `updated_at`.

Generation accepts only the ID of one of the caller's entries. Django resolves
it through `apps/summaries/journal_provider.py` (ORM query on
`journal.JournalEntry` filtered by `user`), so another user's or a missing entry
returns `404` and is never sent to Gemini. The entry's `title` and `text` are
sent to the existing Gemini service, and the saved `Summary` stores a nullable
FK (`journal_entry`, column `journal_entry_id`, `SET_NULL`) to the source entry.
The React picker reuses Module 1's `GET /api/journal/entries/`.

### 3.5 Media **[IMPLEMENTED]**

| Method | Path | Auth | Ownership |
| --- | --- | --- | --- |
| `GET` | `/api/media/` | Required | Only the caller's media |
| `POST` | `/api/media/` | Required | Upload owned by caller |
| `GET` | `/api/media/{id}/` | Required | 404 if not owner |
| `PATCH` | `/api/media/{id}/` | Required | 404 if not owner; `prompt` only |
| `PUT` | `/api/media/{id}/` | Required | 404 if not owner; `prompt` required |
| `DELETE` | `/api/media/{id}/` | Required | 404 if not owner |
| `POST` | `/api/media/generate/` | Required | Generated media owned by caller |

Fields: `id`, `file`, `media_type` (`original` / `ai_generated`), `prompt`,
`status` (§1.9), `journal_entry_id`, `journal_entries`, `summary_id`,
`provider`, `model`, `created_at`, `updated_at`.

- `journal_entries` is a read-only list of `{ "id", "title" }` for the real
  Module 1 entries linked through the existing `JournalEntry.photos`
  many-to-many. `journal_entry_id` is the first linked ID (or `null`).
- `summary_id` is the nullable Module 3 `Summary` provenance FK. Deleting a
  summary clears this link (`SET_NULL`) but keeps the image.
- `provider` and `model` describe how an AI image was produced (`comfyui`
  and the configured checkpoint name); original uploads leave both empty.
- `owner`, `file`, `media_type`, `status`, `journal_entry_id`,
  `journal_entries`, `summary_id`, `provider`, and `model` are
  server-controlled; sending them in an update is ignored. `prompt` is the only
  client-writable metadata once a media row exists.

> **Media access model:** API reads and writes are owner-scoped, but the `file`
> value is an unguessable capability URL
> (`/media/users/{owner_id}/{year}/{month}/{uuid}.ext`). With `DEBUG=True`,
> Django serves `/media/` without authentication, so anyone holding the URL can
> read the file. The URL does not expose a filesystem path, but it is not an
> access-control boundary. Authenticated delivery, signed URLs, or private
> object storage is unresolved (§4.11); until then, do not describe stored
> media as owner-only at the file level.

#### Upload — `POST /api/media/`

`multipart/form-data` with a single `file` field. Uploads are not attached to a
journal entry or summary; `journal_entry_id`/`summary_id` sent by a client are
ignored. Decoded image content is authoritative; JPEG, PNG, and WebP are
accepted up to the configured byte and pixel limits. Files are stored under a
per-user, unguessable path and remain byte-for-byte unchanged. Uploads are
created as `media_type=original`, `status=succeeded`.

> **Upload metadata caveat:** because original uploads are stored unchanged,
> any EXIF/ICC metadata in the source file (including GPS coordinates and
> device details) is preserved. Generated images are re-encoded and stripped
> (§ below). Stripping upload metadata would change stored bytes and needs a
> product decision.

```json
// 201
{
  "id": 11,
  "file": "http://127.0.0.1:8000/media/users/1/2026/10/<uuid>.png",
  "media_type": "original",
  "prompt": "",
  "status": "succeeded",
  "journal_entry_id": null,
  "journal_entries": [],
  "summary_id": null,
  "provider": "",
  "model": "",
  "created_at": "2026-10-24T20:15:00.000000Z",
  "updated_at": "2026-10-24T20:15:00.000000Z"
}
```

#### Generate — `POST /api/media/generate/`

`Content-Type: application/json`. The backend is the only caller of local
ComfyUI; React never receives the ComfyUI endpoint or workflow.

```json
{
  "prompt": "A quiet lake at dawn, watercolor",
  "journal_entry_id": 1,
  "summary_id": 4,
  "width": 512,
  "height": 512,
  "steps": 20,
  "seed": 1234
}
```

- At least one of `prompt`, `journal_entry_id`, or `summary_id` is required. The
  default maximum is 1000 characters and is configurable with
  `MEDIA_GENERATION_MAX_PROMPT_LENGTH`; the server always re-validates the
  resolved prompt. The UI shows scene-focused examples and guidance that the
  local model cannot faithfully recreate a real person's likeness and that
  prompts should omit names or private details about real people.
- **Prompt precedence is deterministic:** an explicit `prompt` wins; otherwise
  the selected summary's stored `illustration_prompt` is used; otherwise the
  journal entry's title and existing recap (`summary_text`) build the prompt.
  If none of those yields text, the request is rejected before ComfyUI runs.
- `journal_entry_id` and `summary_id` are resolved through owner-scoped ORM
  queries. A missing or foreign ID returns a generic `400` that does not reveal
  whether the record exists. If both are supplied, the summary must belong to
  that journal entry; a mismatched pairing is rejected. A summary linked to a
  foreign journal entry is rejected as unavailable.
- The journal entry's **body text is never sent to ComfyUI**; only the title and
  recap are eligible. Client-supplied title/text/content fields are ignored.
  Summary generation is not repeated: the stored `illustration_prompt` is used
  verbatim.
- A successful response stores the resolved prompt, `media_type=ai_generated`,
  `status=succeeded`, `provider=comfyui`, the configured checkpoint as `model`,
  the `summary` FK when a summary was used, and the journal link through
  `JournalEntry.photos`. No row or stored file is left behind when generation
  or storage fails.
- Default allowed sizes are `512x512`, `512x768`, and `768x512`; the first is
  used when no size is supplied. `steps` defaults to 20 within the default
  1-30 range. Both are server-side guardrails configured with
  `MEDIA_GENERATION_ALLOWED_SIZES`, `MEDIA_GENERATION_MIN_STEPS`,
  `MEDIA_GENERATION_MAX_STEPS`, and `MEDIA_GENERATION_DEFAULT_STEPS`. Unknown
  request fields (for example `cfg_scale` or `negative_prompt`) are ignored
  rather than forwarded to the provider.
- The response is `201` only after a validated, metadata-free PNG is stored as
  `media_type=ai_generated`, `status=succeeded`. The image is re-encoded before
  storage and every source metadata block (prompt/workflow text chunks, EXIF,
  ICC, DPI) is cleared; its dimensions must match the requested size. The UI
  labels the result as AI-generated and states that it is not an original
  photograph, and the detail dialog repeats that disclosure for stored AI
  images.
- Generation only starts from an explicit authenticated `POST`. The React form
  requires a consent checkbox, disables the submit/retry controls while a
  request is in flight, and uses an in-flight guard against double clicks.
  The endpoint itself is **not idempotent**: there is no idempotency-key store,
  so a repeated successful POST creates another image. This is a documented
  limitation until the architecture adds a durable request ledger.
- **No server-side throttle/concurrency guard yet.** The in-flight guard is
  per browser tab; any authenticated caller can open additional requests, and
  each synchronous request occupies a Django worker until ComfyUI finishes or
  the bounded deadline expires. Add DRF throttling or a queue with a bounded
  worker before exposing this endpoint beyond a trusted local setup (§4.11
  item 12).
- Application logs record only user ID, size, steps, prompt character count,
  and journal ID. Prompt text, provider response bodies, and tokens are never
  logged.
- Failures: `400` validation, `403` unauthenticated, `502` generation/invalid
  output, `503` ComfyUI unavailable or misconfigured, `504` generation timeout,
  `500` storage failure. Error bodies contain safe messages only; provider
  details and internal exceptions are not exposed.
- See [`docs/COMFYUI.md`](COMFYUI.md) for local installation, configuration,
  model licensing, and the real-generation smoke test.

#### Detail, update, delete — `/api/media/{id}/`

`GET` returns the same representation as the upload example. Every query is
scoped to `request.user`; another user's media ID returns `404`.

`PATCH`/`PUT` accept JSON and update only `prompt` (max 1000 chars, may be
empty on `PUT`; `PUT` requires the field). Ownership, file, type, status, and
provenance fields (`journal_entry_id`, `journal_entries`, `summary_id`,
`provider`, `model`) are read-only and are ignored if supplied.

```json
// PATCH request
{ "prompt": "A memory rewritten in watercolor." }
```

`DELETE` returns `204`. The database row is deleted first; the stored file is
removed after that transaction commits, and only when no other media row
references the same stored name. A storage-cleanup failure does not resurrect
the row: the request still returns `204` and a warning is logged.

### 3.6 People (faces) **[PROPOSED]**

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

1. **Journal path:** resolved — `/api/journal/entries/` is implemented.
2. **`Profile` model:** create one (with which fields) or extend `/api/accounts/me/`
   to edit built-in `User` fields only? *Blocking for §3.1.*
3. **`PATCH /api/accounts/me/`:** approve self-service profile updates?
4. **Admin ownership:** who registers which models in `/admin/` — is that this task
   or the separate admin task?
5. **Pagination:** adopt DRF `PageNumberPagination` (page size, max) — changes shared settings.
6. **Error envelope:** keep DRF defaults (recommended) or add a uniform wrapper?
7. **Dev API origin:** the React dev server now uses a Vite proxy for `/api`
   and `/media`, so the browser stays on one origin and session/CSRF cookies
   are first-party. Revisit `CSRF_TRUSTED_ORIGINS` only if the API is served
   from a different origin.
8. **Upload limits:** confirm size caps (25 MB audio / 10 MB image) and allowed MIME types,
   and whether to emit `400` or a custom `413`.
9. **AI execution:** Module 4 uses local ComfyUI with a local SD model
   (synchronous bounded polling). The other modules' providers and whether any
   should move to Celery/background jobs remain open; see §1.9.
10. **Face recognition / People:** opt-in mechanism and privacy policy wording; where
    `identify-faces` lives (§3.6).
11. **Media storage:** local filesystem (dev) vs S3 from the start.
12. **Rate limiting:** add DRF throttling on `login`/`register` and on
    `/api/media/generate/` (the generation endpoint has no server-side
    throttle or concurrency cap today)?
13. **API versioning:** introduce `/api/v1/` now or later.
14. **`docs/API_CONTRACT.md` ownership:** who updates it, and when (per PR?).

---

## 5. Change log

| Date | Change | Author |
| --- | --- | --- |
| 2026-10-15 | Initial draft: conventions + implemented Accounts endpoints + proposed module endpoints | — |
| 2026-10-15 | §1.2: mark the React `PATCH /me/` example as proposed (today `/me/` is `GET` only) | — |
| 2026-10-24 | §3.5: implement owner-scoped media upload/list and local ComfyUI generation; add `status`; document sync behavior and safe errors | Module 4 |
| 2026-10-24 | §3.5: implement detail/update/delete with post-commit file cleanup and `prompt`-only updates | Module 4 |
| 2026-10-25 | §3.4–3.5: remove the mock journal fixture; integrate real Module 1 entries and Module 3 summaries, prompt precedence, provenance fields, and owner-scoped validation | Module 4 |
| 2026-10-25 | Merge reconciliation: restore one implemented-endpoints table, document the real Journal fields and search, mark implemented module sections, and correct pagination/CSRF notes | Merge resolution |

# MEMORA

A private, multimodal personal journal. MEMORA lets a single user capture
their life as **text entries, voice memos, photos, and the people around
them**, and — later on — get AI-generated summaries of it all.

This repository contains the **backend scaffold, shared accounts /
session-authentication foundation, and the Module 4 media library** (owner-scoped
uploads, gallery API, and local ComfyUI image generation). The journal, audio,
summaries, and people modules are still empty — no models and no endpoints yet.
Image generation uses **local ComfyUI and a locally installed Stable Diffusion
model**; there are no hosted generation APIs, API credits, or Hugging Face
tokens. ComfyUI must be installed and configured separately (see
[`docs/COMFYUI.md`](docs/COMFYUI.md)).

- **Backend:** Django 5 + Django REST Framework
- **Database (local dev):** SQLite
- **Admin:** Django's built-in admin site (`/admin/`)
- **Frontend:** React app in `frontend/` (separate dev server)
- **Image generation:** local ComfyUI HTTP API (not installed by this repo)

---

## Project layout

```
MEMORA/
├── manage.py                 # Django's command-line entry point
├── requirements.txt          # Python dependencies (pinned)
├── .env.example              # Template for your local .env (no secrets committed)
├── config/                   # Project configuration ("the Django project")
│   ├── settings.py           # All settings live here
│   ├── urls.py               # Root URL routes
│   ├── wsgi.py / asgi.py     # Server entry points
├── apps/                     # All local Django apps live under this package
│   ├── accounts/             # Users & session authentication
│   ├── journal/              # Text journal entries
│   ├── audio/                # Voice memos / recordings
│   ├── summaries/            # AI-generated summaries (future)
│   ├── media_library/        # Photos, uploads & AI-generated images
│   └── people/               # People mentioned in entries
├── docs/
│   ├── API_CONTRACT.md       # Shared API contract
│   ├── COMFYUI.md            # Local image-generation setup and smoke test
│   └── TEAM_WORKFLOW.md      # How we work together (branches, commits, PRs)
└── frontend/                 # React app (separate dev server)
```

Each app under `apps/` follows the same standard Django layout
(`models.py`, `views.py`, `admin.py`, `urls.py`, `tests.py`, `migrations/`).

---

## Getting started (first time)

All commands are run from the project root (the folder with `manage.py`).

### 1. Create and activate a virtual environment

A virtual environment keeps this project's packages separate from the rest
of your computer.

```bash
python -m venv .venv
```

Activate it:

- **Windows (Git Bash):** `source .venv/Scripts/activate`
- **Windows (PowerShell):** `.venv\Scripts\Activate.ps1`
- **macOS / Linux:** `source .venv/bin/activate`

### 2. Install the dependencies

```bash
pip install -r requirements.txt
```

This installs everything listed in `requirements.txt` (Django, DRF,
django-cors-headers, python-dotenv, Pillow, requests, ...).

### 3. Create your local `.env` file

The app reads secrets and machine-specific values from a `.env` file that
is **never committed**. Copy the template:

```bash
cp .env.example .env
```

Then open `.env` and fill in values. For local development the defaults
already work — you can leave it as-is for now. `.env` is listed in
`.gitignore`, so your secrets stay on your machine.

### 4. Create the database tables

```bash
python manage.py migrate
```

This creates `db.sqlite3` and the standard Django tables (users, sessions,
etc.). The file is git-ignored.

### 5. (Optional) Create an admin user

```bash
python manage.py createsuperuser
```

Follow the prompts, then you can log in at `http://127.0.0.1:8000/admin/`.

### 6. Run the development server

```bash
python manage.py runserver
```

Open `http://127.0.0.1:8000/` in your browser. Press `Ctrl+C` to stop.

---

## Command reference

| Command | What it does |
| --- | --- |
| `pip install -r requirements.txt` | Install the Python dependencies. |
| `python manage.py check` | Sanity-check the project for configuration errors. Fast, touches nothing. |
| `python manage.py migrate` | Apply database migrations (create/update tables). |
| `python manage.py makemigrations` | Generate migrations after you change a `models.py`. |
| `python manage.py createsuperuser` | Create an admin login for `/admin/`. |
| `python manage.py runserver` | Start the local development server at `127.0.0.1:8000`. |

---

## URLs available

| URL | What it is |
| --- | --- |
| `/admin/` | Django admin site (built-in). |
| `/api/accounts/` | Accounts API — session authentication (see below). |
| `/api/journal/` | Journal API — no endpoints yet (planned). |
| `/api/audio/` | Audio API — no endpoints yet (planned). |
| `/api/summaries/` | Summaries API — no endpoints yet (planned). |
| `/api/media/` | Media library API — list, upload, and local ComfyUI generation. |
| `/api/people/` | People API — no endpoints yet (planned). |

### Accounts / authentication endpoints

Session-based authentication: a Django session cookie plus CSRF protection.
No tokens and no extra dependencies.

| Method | Path | Auth | What it does |
| --- | --- | --- | --- |
| `POST` | `/api/accounts/register/` | public | Create a user. Never grants staff/superuser. |
| `POST` | `/api/accounts/login/` | public | Authenticate and start a session. |
| `POST` | `/api/accounts/logout/` | required | End the current session. |
| `GET` | `/api/accounts/me/` | required | Return the authenticated user's own data. |
| `GET` | `/api/accounts/csrf/` | public | Set the `csrftoken` cookie for the frontend. |

While authenticated, unsafe requests (`POST`/`PUT`/`PATCH`/`DELETE`) must
echo the `csrftoken` cookie back in the `X-CSRFToken` header and be sent
with credentials from the browser.

### Media library endpoints

| Method | Path | Auth | What it does |
| --- | --- | --- | --- |
| `GET` | `/api/media/` | required | List only the caller's media. |
| `POST` | `/api/media/` | required | Upload an image (`multipart/form-data`, `file` field). |
| `GET` | `/api/media/{id}/` | required | Read one owned media item (404 otherwise). |
| `PATCH` | `/api/media/{id}/` | required | Update the `prompt` metadata of an owned item. |
| `PUT` | `/api/media/{id}/` | required | Replace the `prompt` metadata (field required). |
| `DELETE` | `/api/media/{id}/` | required | Delete an owned item and its unshared stored file. |
| `POST` | `/api/media/generate/` | required | Generate with local ComfyUI and store an AI-generated image. |
| `GET` | `/api/media/mock-journal-entries/` | required | Read the isolated mock journal fixture; never writes rows. |

Uploads are validated from decoded image content and stored unchanged.
`owner`, `file`, `media_type`, `status`, and `journal_entry_id` are set by the
server; detail updates only accept `prompt`. Deletion removes the database row
first and the stored file after commit, unless another row still references it.
API access is owner-scoped, but the stored file URL is an unguessable capability
URL: while `DEBUG=True`, Django serves `/media/` without authentication, so the
URL is not an access-control boundary. Production delivery is unresolved; see
[`docs/API_CONTRACT.md`](docs/API_CONTRACT.md) §3.5 and §4.11.
Generation accepts a JSON prompt (or a mock `journal_entry_id`) and returns
`201` only after the validated image is stored. It uses **local ComfyUI**, so
ComfyUI and a Stable Diffusion checkpoint must be installed and running first:
see [`docs/COMFYUI.md`](docs/COMFYUI.md) for configuration, licensing, hardware
limits, and the real-generation smoke test. No model or ComfyUI installation is
bundled or verified by this repository.

---

## Environment variables

See `.env.example` for the full list of supported variables. Nothing
secret is committed to this repository — only placeholder names.

Media generation reads `COMFYUI_BASE_URL`, `COMFYUI_WORKFLOW_PATH`,
`COMFYUI_CHECKPOINT`, `COMFYUI_TIMEOUT`, and `COMFYUI_REQUEST_TIMEOUT`.
`COMFYUI_CHECKPOINT` is empty until a local model is installed. No token is
used for image generation.

Server-side generation limits are configurable with
`MEDIA_GENERATION_MAX_PROMPT_LENGTH`, `MEDIA_GENERATION_ALLOWED_SIZES`,
`MEDIA_GENERATION_MIN_STEPS`, `MEDIA_GENERATION_MAX_STEPS`, and
`MEDIA_GENERATION_DEFAULT_STEPS`. Only these provider-supported inputs are
forwarded to ComfyUI; unknown request fields are ignored. Sample-memory
generation sends only the memory **title** to the provider, never the journal
body, and prompts are excluded from application logs.

---

## What's intentionally NOT here yet

The journal, audio, summaries, and people modules are still empty — no models,
serializers, or endpoints. AI summarization, audio transcription, cloud storage,
and face recognition are also not implemented. The React app is a separate
project in `frontend/`. See `docs/TEAM_WORKFLOW.md` for how we'll build the
remaining work together.

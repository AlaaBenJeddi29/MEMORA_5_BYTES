# MEMORA

A private, multimodal personal journal. MEMORA lets a single user capture
their life as **text entries, voice memos, photos, and the people around
them**, and — later on — get AI-generated summaries of it all.

This repository currently contains a **backend scaffold plus the shared
accounts / session-authentication foundation**. The five business modules
(journal, audio, summaries, media, people) are still empty — no models and
no endpoints yet — and there are no AI calls.

- **Backend:** Django 5 + Django REST Framework
- **Database (local dev):** SQLite
- **Admin:** Django's built-in admin site (`/admin/`)
- **Frontend:** a separate React app will live in `frontend/` (not started)

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
│   ├── media_library/        # Photos & videos
│   └── people/               # People mentioned in entries
├── docs/
│   └── TEAM_WORKFLOW.md      # How we work together (branches, commits, PRs)
└── frontend/                 # Reserved for the future React app
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
| `/api/media/` | Media library API — no endpoints yet (planned). |
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

---

## Environment variables

See `.env.example` for the full list of supported variables. Nothing
secret is committed to this repository — only placeholder names.

---

## What's intentionally NOT here yet

The five business modules are still empty — no models, no serializers, and
no endpoints yet for journal, audio, summaries, media, or people. AI
summarization, cloud storage, and face recognition are also not
implemented. See `docs/TEAM_WORKFLOW.md` for how we'll build them together.

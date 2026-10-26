# MEMORA — frontend

The MEMORA single-page application, built with **React + Vite + TypeScript** and
**React Router**. It talks to the Django REST Framework backend under `/api/`.

This is the **frontend foundation only**: app shell, routing, session
authentication, shared UI, and placeholder pages for the five business modules.
No business-module API calls are implemented yet — those modules have no
backend models or endpoints today (see `../docs/API_CONTRACT.md`).

## Requirements

- **Node.js 18+** (developed on Node 22) and npm 9+.
- The Django backend running locally (default `http://127.0.0.1:8000`).

## Setup

From this `frontend/` directory:

```bash
# 1. Install dependencies
npm install

# 2. (Optional) Create your local env file (git-ignored)
cp .env.example .env.local
# Leave VITE_API_BASE_URL empty: the dev server proxies /api and /media to
# http://127.0.0.1:8000

# 3. Start the dev server
npm run dev
```

Open the app at the URL Vite prints (usually **http://localhost:3000**). The
browser only talks to the Vite origin; Vite proxies `/api` and `/media` to
Django, so the session and CSRF cookies stay first-party and the hostname no
longer affects authentication. Do not set `VITE_API_BASE_URL` to an absolute
URL during local development, or you bypass the proxy and reintroduce the
cross-site cookie problem described below.

The dev server is pinned to **port 3000** and **fails if the port is taken**
(`strictPort`), because the backend CORS allowlist is configured for
`http://localhost:3000` and `http://127.0.0.1:3000` (`DJANGO_CORS_ALLOWED_ORIGINS`).

Start the backend in another terminal:

```bash
cd ..            # project root (the folder with manage.py)
source .venv/Scripts/activate   # Windows Git Bash
python manage.py migrate
python manage.py runserver
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server on port 3000 (fails if occupied). |
| `npm run build` | Type-check, then build the production bundle into `dist/`. |
| `npm run preview` | Serve the built `dist/` locally on port 3000. |
| `npm run typecheck` | Run `tsc --noEmit` over the source. |
| `npm test` | Run the Vitest suite once. |
| `npm run test:watch` | Run Vitest in watch mode. |
| `npm run lint` | Run ESLint. |
| `npm run lint:fix` | Run ESLint and auto-fix what it can. |

## Environment variables

Only `VITE_`-prefixed values are exposed to the browser bundle — **never put
secrets here**.

| Variable | Purpose | Default |
| --- | --- | --- |
| `VITE_API_BASE_URL` | Base URL of the backend API (no trailing slash). | empty → same origin (Vite proxy) |

Leave it unset or empty to call the API on the app's own origin. Set an absolute
URL only if the API is hosted on a different origin.

## Authentication & CSRF

Auth uses **Django session cookies** (`sessionid`) plus **CSRF** protection. No
credential or token is ever written to `localStorage`/`sessionStorage` — the
session lives entirely in the Django cookie. The app's API client
(`src/services/apiClient.ts`):

- sends `credentials: 'include'` so the session cookie travels;
- before any `POST`/`PUT`/`PATCH`/`DELETE`, ensures a readable `csrftoken`
  cookie exists (fetching `GET /api/accounts/csrf/` once if not) and echoes it
  in the `X-CSRFToken` header — it never assumes the endpoint returns the token
  in its JSON body;
- calls `GET /api/accounts/csrf/` on startup to warm the cookie.

Shared session state lives in `AuthProvider` / `useAuth`
(`src/features/auth/`). On startup it calls `GET /api/accounts/me/`; a `403`
means "signed out" and is handled without an error state. `RequireAuth` and
`RedirectIfAuthenticated` guard the private and public-only routes, showing a
loading state until the initial check finishes.

Sign-out is honest: if `POST /api/accounts/logout/` fails while the backend still
reports an active session, the failure is surfaced (an inline alert in the app
shell) and local state is **not** cleared. If the request fails only because the
session was already gone, sign-out completes locally.

Login/register forms validate required fields (and password confirmation) before
submitting, then render whatever the backend returns field-by-field — the DRF
serializers remain the single source of truth for names and error messages.

Implemented flows (all against real endpoints):

| Flow | Endpoint |
| --- | --- |
| Register | `POST /api/accounts/register/` |
| Sign in | `POST /api/accounts/login/` |
| Sign out | `POST /api/accounts/logout/` |
| Current user | `GET /api/accounts/me/` |
| CSRF cookie | `GET /api/accounts/csrf/` |

### Dev proxy (enabled)

The Vite dev server proxies `/api` and `/media` to `http://127.0.0.1:8000`
(`vite.config.ts`), and `VITE_API_BASE_URL` defaults to empty. The browser
therefore only talks to `localhost:3000` (or `127.0.0.1:3000`); the session and
CSRF cookies are first-party and are sent normally. The proxy preserves the
original `Host` header, so Django's CSRF `Origin` check still matches.

This deliberately replaces the old cross-origin dev setup. `localhost` and
`127.0.0.1` are different sites, so a direct call from `localhost:3000` to
`127.0.0.1:8000` makes the session cookie cross-site; Django's default
`SameSite=Lax` then prevents it from being sent, and authenticated reads return
`403` even after a successful login. Setting `VITE_API_BASE_URL` to an absolute
URL bypasses the proxy and reintroduces that problem. `CSRF_TRUSTED_ORIGINS`
only relaxes CSRF origin checks — it does not make a cross-site session cookie
readable or sent.

CORS remains configured on the backend for non-proxied clients and tests.

## Testing

Unit/component tests use **Vitest** (jsdom) + **Testing Library**, configured in
`vitest.config.ts` with setup in `src/test/setup.ts`. `fetch` is stubbed per
test, so the suite runs without a backend.

```bash
npm test          # run once
npm run test:watch
```

Covered today: the API client (credentials, CSRF header + lazy acquisition, 204,
error shape), the error normalizer, the CSRF cookie helpers, the env base-URL
default, `AuthProvider` (startup `/me/`, honest logout), and the auth forms'
client-side validation.

### Manual verification sequence

With the backend running (`python manage.py runserver`) and `npm run dev`:

1. Visit `/app` while signed out → redirected to `/login`.
2. Submit `/register` empty → required-field errors, no network call; submit with
   mismatched passwords → "Passwords do not match."; complete the form → land on
   `/app` with your username in the top bar.
3. Reload `/app` → still signed in (session cookie restored via `/me/`).
4. Visit `/login` while signed in → redirected to `/app`.
5. Click **Log out** → returned to `/login`; reload `/app` → redirected again.
6. Stop the backend and click **Log out** again (while signed in) → an inline
   "We couldn't sign you out" alert appears and you stay on `/app`.


## Project structure

```
frontend/
├── index.html
├── vite.config.ts            # dev server on port 3000, strictPort
├── vitest.config.ts          # test runner config (jsdom)
├── tsconfig.json             # app TypeScript config
├── tsconfig.node.json        # config for vite.config.ts
├── eslint.config.js          # flat ESLint config
├── .env.example
└── src/
    ├── main.tsx              # React entry point
    ├── app/                  # App, router (React Router), route guards
    ├── assets/               # static assets (logo)
    ├── components/           # shared UI (see "Component library" below)
    ├── layouts/              # PublicLayout, AppLayout, AdminLayout
    ├── features/             # one folder per module (each has its own README)
    │   ├── account/          # My Account (read-only, GET /me/)
    │   ├── auth/             # session auth: context, provider, hook, pages
    │   ├── dashboard/        # authenticated landing
    │   ├── journal/          # shell
    │   ├── audio/            # shell
    │   ├── summaries/        # shell
    │   ├── media-library/    # shell
    │   └── people/           # shell
    ├── pages/                # Home, 404, Error, Admin
    ├── services/             # API client, CSRF helpers, auth API, error helpers
    ├── hooks/                # useDocumentTitle, useMediaQuery
    ├── test/                 # test setup + helpers (Vitest)
    ├── types/                # shared TypeScript types
    ├── utils/                # small helpers (env, date formatting)
    └── styles/               # global stylesheet + design tokens
```

### Layouts

| Layout | Used for | Structure |
| --- | --- | --- |
| `PublicLayout` | `/`, `/login`, `/register`, 404 | Responsive header (brand + account nav), main, footer |
| `AppLayout` | All `/app/*` screens | Full-height grid: desktop sidebar; sticky top bar with account + log out; main content; on mobile the sidebar becomes a drawer opened by a "Menu" button (closes on navigate, Escape, or backdrop) |
| `AdminLayout` | `/admin` | Distinct dark admin bar with an "Administration" chip and a "Back to app" link |

A top-level `ErrorPage` (React Router `errorElement`) renders for any route
error, and `NotFoundPage` handles unknown paths.

### Component library (`src/components/`)

| Component | Purpose |
| --- | --- |
| `Button` | Variants `primary`/`secondary`/`ghost`/`danger`, sizes `md`/`sm`, `block`; includes hover + disabled states |
| `TextInput` | Styled native `<input>` |
| `PasswordInput` | Password field with an accessible show/hide toggle (`aria-pressed`) |
| `FormField` | Label + hint + error wrapper; wires `id`, `aria-invalid`, `aria-describedby`, and `role="alert"` to its input via a render prop |
| `Alert` | `info`/`error`/`success`/`warning`, optional title, correct `role` |
| `LoadingState` | Accessible busy indicator (`role="status"`), optional centered mode |
| `EmptyState` | Neutral "nothing here yet" panel with optional actions |
| `PageHeader` | Page `<h1>`, optional badge/description/actions — keeps heading order consistent |
| `StatusBadge` | Status pill using the API-contract vocabulary (`pending`/`processing`/`succeeded`/`failed`/`neutral`) |
| `Brand`, `SkipLink` | Wordmark link and "skip to main content" link |
| `ModulePlaceholder` | Shared "not built yet" view for the five business modules |

Design tokens (color, type scale, spacing, radii, shadows, focus ring) live at
the top of `src/styles/global.css` and are reused by every component.

### Routes

| Path | Access | Screen |
| --- | --- | --- |
| `/` | Public | Landing page |
| `/login`, `/register` | Public (redirects if signed in) | Auth pages |
| `/app` | Signed in | Dashboard (welcome + module links) |
| `/app/journal`, `/app/audio`, `/app/summaries`, `/app/media`, `/app/people` | Signed in | Module shells (empty until their API exists) |
| `/app/account` | Signed in | My Account (read-only details from `GET /me/`) |
| `/admin` | Signed in | Admin landing (links to Django admin) |
| `*` | Public | Not found |

## Django admin vs. the React app

These are deliberately two different things:

- **Django admin** (`http://127.0.0.1:8000/admin/`) is where real user and data
  administration happens — accounts, permissions, and (later) model data. It is
  Django's built-in admin site, requires a **staff** account, and is enforced
  entirely by Django. The React app does not touch or reimplement it.
- **The React app's `/admin` page** is only an honest **entry point**: it
  explains the distinction and links to Django admin. It is not a management
  dashboard and displays no real data.

**Why the React page can't gate on admin status.** `GET /api/accounts/me/`
(`apps/accounts/serializers.py` → `UserSerializer`) returns only `id`,
`username`, `email`, `first_name`, `last_name`, and `date_joined` — it does
**not** expose `is_staff` or `is_superuser`. So the SPA has no way to know who is
an administrator and does not pretend to: the `/admin` route is behind the same
`RequireAuth` guard as the rest of the app, and Django enforces real access at
its own admin login.

**Registration never grants privileges.** `RegisterSerializer.create` uses
`User.objects.create_user`, which forces `is_staff`/`is_superuser = False`, and
any privilege keys a client sends are ignored.

A full in-app admin dashboard would need backend work that does not exist yet
(the "Future work" list on `/admin`): expose a role on `/me/` and/or add
read-only admin REST endpoints guarded by `IsAdminUser`. Until that exists,
nothing is simulated — no role toggles, user tables, or metrics.

## Accessibility & styling

- Semantic landmarks (`header`, `nav`, `main`, `footer`), a "Skip to main
  content" link, and a `lang="en"` document.
- Form fields have associated labels; `FormField` adds `aria-invalid` /
  `aria-describedby` and announces errors via `role="alert"`.
- Visible `:focus-visible` focus ring on every interactive element, plus a
  `prefers-reduced-motion` fallback that disables animation/transition.
- Consistent heading order: one `<h1>` per page (`PageHeader`), sections use
  `<h2>`, cards/rows use `<h3>`.
- The app shell's mobile drawer exposes `aria-expanded`/`aria-controls`, moves
  focus on open, and closes on Escape, backdrop click, or navigation.
- Planned, unimplemented features are shown as honest empty/under-construction
  states (see `ModulePlaceholder`) rather than inert controls that silently do
  nothing. Buttons are only `disabled` while a real action is in flight.
- Responsive, framework-free CSS driven by design tokens in
  `src/styles/global.css`.

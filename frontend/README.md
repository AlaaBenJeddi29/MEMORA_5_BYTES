# frontend/ (reserved)

This folder is reserved for MEMORA's **React** single-page application.

It is intentionally empty for now — the current milestone is the Django +
Django REST Framework **backend scaffold** only. No frontend tooling
(Node, Vite, packages) has been set up yet.

When frontend work begins, a React app (e.g. created with Vite) will be
scaffolded here. It will talk to the backend API at `/api/...`; the backend
already allows the usual dev-server origins via `DJANGO_CORS_ALLOWED_ORIGINS`
(see `.env.example`).

This file exists so the folder is tracked by git (git does not track empty
directories).

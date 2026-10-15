# Team Workflow

How the MEMORA team works on this repository. Keep it short, follow it
consistently.

---

## 1. One-time setup per teammate

```bash
git clone <repository-url>
cd MEMORA
python -m venv .venv
source .venv/Scripts/activate     # Windows Git Bash (see README for others)
pip install -r requirements.txt
cp .env.example .env              # then fill in your own values
python manage.py migrate
python manage.py runserver
```

Everyone runs the **same pinned dependency versions** from
`requirements.txt`. If you add a package, update that file (see §5).

---

## 2. Branching model

`main` is always working and deployable. Never commit directly to `main`.

For every piece of work, create a short-lived branch:

```bash
git checkout main
git pull
git checkout -b feat/journal-create-entry
```

Branch name prefixes:

| Prefix | Use for |
| --- | --- |
| `feat/` | A new feature. |
| `fix/` | A bug fix. |
| `docs/` | Documentation only. |
| `chore/` | Tooling, dependencies, config. |
| `refactor/` | Code change that isn't a feature or a fix. |

Use lowercase and hyphens: `feat/audio-upload-endpoint`.

---

## 3. Commit messages

Follow the **Conventional Commits** style:

```
<type>: <short description in the imperative mood>
```

Examples:

```
feat: add journal entry model
fix: reject audio uploads over 20 MB
docs: explain how to run migrations
chore: pin djangorestframework to 3.18.3
```

Rules:
- Keep the summary under ~70 characters.
- The message describes **why**, not just what.
- Commit small and often; each commit should do one thing.

---

## 4. Pull requests

1. Push your branch: `git push -u origin feat/your-branch`.
2. Open a pull request against `main`.
3. In the PR description, include:
   - **What** changed and **why**.
   - **How to test** it (commands or steps).
   - Any **migrations** added.
4. Ask at least **one teammate** to review.
5. Merge only after review and a passing `python manage.py check`.
6. Delete the branch after merging.

---

## 5. Adding a dependency

Only add a package if the team agrees it's needed.

```bash
pip install <package>
pip freeze > requirements.txt     # or hand-edit the pinned version
```

Then commit the updated `requirements.txt` (and mention it in the PR).

---

## 6. Database & migrations

- After changing any `models.py`, run:
  ```bash
  python manage.py makemigrations
  python manage.py migrate
  ```
- **Always commit** the generated migration files — teammates need them.
- Never edit an already-committed migration that others have applied.
- `db.sqlite3` is local and git-ignored; never commit it.

---

## 7. Secrets and configuration

- **Never commit secrets**, API keys, tokens, or passwords.
- All configuration lives in `.env` (git-ignored). Add new keys to
  `.env.example` with placeholder values so teammates know what's required.
- If you accidentally commit a secret, tell the team immediately and rotate
  the key — deleting the file is not enough (it stays in git history).

---

## 8. Code style

- Follow PEP 8. Keep functions and files small and readable.
- Use Django's conventions: fat models, thin views, `apps/<app>/` layout.
- Write clear names; add a short comment only where the reason isn't obvious.
- Run `python manage.py check` before pushing.

---

## 9. Where things go

| Concern | App |
| --- | --- |
| Users, profiles | `apps/accounts` |
| Text journal entries | `apps/journal` |
| Voice memos / recordings | `apps/audio` |
| AI summaries | `apps/summaries` |
| Photos & videos | `apps/media_library` |
| People in entries | `apps/people` |

Rules of thumb:
- Keep apps focused; put shared helpers in a small `common` module if needed.
- API endpoints live in each app's `views.py` + `urls.py`.
- Use Django's built-in admin (`/admin/`) for management — we are **not**
  building a custom admin dashboard.

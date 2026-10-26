# Summaries feature

AI-generated recaps of journal entries (Module 3).

## Status

**Implemented** against the Module 3 API in `apps/summaries/`:

- list, manual create, view, edit, and delete (Django + SQLite)
- generation from the signed-in user's real Module 1 journal entries
- loading, empty, success, validation, network, and provider-failure states
- list refresh after every create/update/delete/generation
- local concept search (`GET /api/summaries/search/`) with ranked results and pagination
- interactive memory book (“My Story”) over the summaries already in memory
- per-user book customization: six covers, six page themes, three typography
  presets, live preview, and saved defaults
- audio reading of each memory page with the native Web Speech API

## Files

| Path | Purpose |
| --- | --- |
| `pages/SummariesPage.tsx` | List/book views, load states, dialog orchestration, refresh after mutations. |
| `components/SummaryCard.tsx` | Card with summary excerpt, mood, themes, and actions. |
| `components/SummarySearchBar.tsx` | Concept-search form; submits to Django on Enter or click. |
| `components/MemoryBook.tsx` | Book shell: cover/pages phases, ordering, paging, keyboard and swipe input. |
| `components/MemoryBookCover.tsx` | Cover with branding, count, period, contents, and empty state. |
| `components/MemoryBookPage.tsx` | One dated paper page; hides missing mood/themes. |
| `components/MemoryBookNavigation.tsx` | Previous/next controls and live page indicator. |
| `components/BookCustomizationDialog.tsx` | Cover/theme/typography picker with live preview, save, cancel, and defaults. |
| `bookThemes.ts` | Allowed identifiers, French labels, defaults, normalization, scope classes. |
| `useBookPreferences.ts` | Loads saved preferences once, falls back to defaults, applies saved choices. |
| `src/services/bookPreferences.ts` | Owner-scoped book preference API calls. |
| `src/types/bookPreferences.ts` | `BookPreferences` and the allowed identifier unions. |
| `components/SummaryAudioPlayer.tsx` | Per-page listen/pause/resume/stop controls and speed selector. |
| `speech.ts` | Shared speech queue, language detection, voice matching, and state store. |
| `components/Dialog.tsx` | Accessible modal: focus trap, Escape/backdrop close, focus restore. |
| `components/SummaryDetailDialog.tsx` | Read-only view of all summary fields. |
| `components/SummaryFormDialog.tsx` | Shared create/edit form with client validation. |
| `components/DeleteSummaryDialog.tsx` | Destructive confirmation. |
| `components/GenerateSummaryDialog.tsx` | Loads the caller's journal entries; posts only the entry ID. |
| `memoryBook.ts` | Pure helpers: chronological sort, date formatting, previews. |
| `summaryForm.ts` | Validation mirroring the backend field limits. |
| `src/services/summaries.ts` | Summary API calls on top of the shared `apiClient`. |
| `src/services/journal.ts` | Module 1 journal API, reused for the entry picker. |
| `src/types/summaries.ts` | `Summary`, `SummaryInput`, `GenerateSummaryInput`, search types. |

## API usage

- `GET /api/summaries/` — list the signed-in user's summaries.
- `GET /api/summaries/search/?q=…&page=1&page_size=20` — owner-scoped concept search.
- `POST /api/summaries/` — manual create; `owner` comes from the session.
- `PATCH /api/summaries/{id}/` — update; only the owner can reach it.
- `DELETE /api/summaries/{id}/` — delete; only the owner can reach it.
- `GET /api/journal/entries/` — real Module 1 entries for the picker.
- `POST /api/summaries/generate/` — body is `{ "journal_entry_id": 12 }`.
- `GET /api/summaries/book-preferences/` — the caller's saved book look, or defaults.
- `PUT /api/summaries/book-preferences/` — save cover, theme, and typography.
- `DELETE /api/summaries/book-preferences/` — reset the caller to defaults.

All requests use `src/services/apiClient.ts`, so the session cookie and
`X-CSRFToken` header are handled consistently. Summary data is never stored in
`localStorage` or a mock array, and Gemini is never called from the browser.

## Journal entries

The generation picker calls the existing Module 1 `journalApi.listAll()`, which
loads the caller's entries from `GET /api/journal/entries/` (100 per page).
Only the selected entry ID is posted to Django; the backend re-checks ownership,
loads the title and text, and calls Gemini server-side.

The backend provider lives in `apps/summaries/journal_provider.py` and queries
`journal.JournalEntry` directly. Summaries store a nullable FK back to that
entry; deleting an entry keeps the summary and clears the link.

## Memory book

“Open memory book” switches `SummariesPage` to the book without a network call:
it reuses the `summaries` array already returned by `GET /api/summaries/`.
Search results can also jump straight to a page with “Read in book”. No new
endpoint, Django model, or AI call is involved, so owner filtering is unchanged.

`MemoryBook` copies the array and sorts it oldest-first by `created_at`, using
the summary ID as a stable tie-breaker (`memoryBook.ts`). The input array and
the page's state are never mutated. Missing mood or themes are simply not
rendered; no placeholder memories are invented.

Navigation:

- cover → “Open my book”, or a page from the contents list
- “Previous page” / “Next page” with disabled boundary states
- “Page X of Y” live indicator (“Pages X–Y of Z” for a spread)
- ArrowLeft/ArrowRight when the book has focus, and horizontal swipe
- “Back to cover”, “Close book”, and “Back to summaries”; closing restores
  focus to the control that opened the book

Layout: one page at a time below 900px, a two-page spread at 900px and above.
The breakpoint uses `useMediaQuery`, and the current position is realigned when
the viewport crosses it. Styles live in `src/styles/global.css` section 7c and
honour the global `prefers-reduced-motion` rule.

## Book customization

“Personnaliser mon livre” opens a dedicated dialog with three groups:

- **Choisir ma couverture** — Classique, Nature, Minimaliste, Voyage,
  Souvenirs, Nuit étoilée. Each thumbnail reuses the real CSS cover texture.
- **Choisir mon thème** — Papier classique, Nature apaisante, Océan, Rose
  poudré, Nuit, Minimaliste. A theme changes page background, main text,
  titles, borders/separators, buttons and reading controls, chips, the book
  shell, and the cover ornament accent. “Nuit” is a dark page palette with
  light ink and dark-on-app navigation labels for contrast outside the book.
- **Choisir ma typographie** — Éditorial, Contemporain, Manuscrit (handwritten
  titles only; body copy stays in the readable serif).

Selecting an option updates the preview immediately. “Enregistrer” sends the
three identifiers, applies the returned settings to the open book without a
reload, and closes the dialog; a failure keeps the dialog, the draft, and the
error visible. “Annuler” discards the draft, and “Rétablir les valeurs par
défaut” resets the draft to Classique / Papier classique / Éditorial (saved only
when you press Save).

Preferences live in `BookPreference`, one row per user (`OneToOneField`,
`apps/summaries/models.py`). The server accepts only the known identifiers,
rejects anything else with a 400, and always uses the session user as owner.
`GET` returns defaults without creating a row, `PUT`/`PATCH` upsert, and
`DELETE` resets. The frontend loads them before enabling “Open memory book” so
the saved theme applies on the first paint; a failed load falls back to the
defaults instead of blocking the book. The three allowed values are mirrored
client-side in `bookThemes.ts`, which normalizes each field independently.

Theming is CSS-only: `book-theme--*`, `book-font--*`, and `book-cover-style--*`
scope classes set `--book-*` custom properties consumed by the cover, pages,
navigation, audio panel, and preview. No user-provided HTML or CSS is stored or
rendered, and summary content is never modified.

## Audio reading

Each page with a summary shows “Écouter ce souvenir”. The text is read with the
browser's native `window.speechSynthesis` and `SpeechSynthesisUtterance`; there
is no dependency, backend endpoint, API key, or network transmission. The exact
displayed summary text is passed to synthesis — nothing is generated, rewritten,
or sent anywhere.

Controls:

- “Écouter ce souvenir” → “Mettre en pause” while speaking → “Reprendre
  l’écoute” after a pause; a finished reading becomes “Réécouter ce souvenir”.
- “Arrêter” cancels the reading. A live `role="status"` region announces the
  current state (“Lecture en cours”, “Lecture en pause”, “Lecture terminée”).
- A speed selector offers 0.75×, 1×, 1.25×, and 1.5×. Changing it during a
  reading restarts that reading at the new speed.
- The player is hidden for empty text. When the Web Speech API is missing, a
  non-blocking note explains that audio is unavailable. Nothing autoplays.

`speech.ts` owns a single queue for the whole book, exposed through
`useSyncExternalStore`. Starting any page cancels the previous reading, so two
pages can never speak at once. A playback token ignores stale `onend`/`onerror`
events from a cancelled utterance. Page changes and book close unmount the
player, whose effect cleanup calls `stopSpeech`; unmounting the whole app also
cancels synthesis.

Language and voice: a lightweight French/English scorer uses common words and
French accents, falling back to `document.documentElement.lang` when the text is
ambiguous. The utterance's `lang` is set accordingly, and `pickVoice` prefers an
exact locale, then another locale of the same language, then a bare language
voice. If no voice matches, the browser's default voice is used; playback still
works and the app makes no claim that a specific voice is installed.

Browser limits: support and installed voices vary by browser and OS. Some
browsers only populate `getVoices()` after the first user interaction, so the
first reading may use the default voice. Browsers may also require a user
gesture before speaking, which the button click provides. Audio preferences and
the speech queue live only in memory and reset on reload.

## Tests

`npm test` (Vitest + Testing Library). The page tests stub `fetch` and cover
list/empty/loading, create, edit, delete, generation payload and failure,
journal-entry loading/empty/retry, network retry, concept search, and memory
book integration. `MemoryBook.test.tsx` covers cover/contents, opening, page
content, mood/themes presence, chronological order and ID ties, boundaries,
keyboard and swipe navigation, wide-spread resizing, empty state, focus
return, and stopping audio when the page changes. `memoryBook.test.ts` covers
the pure sorting and formatting helpers.

`speech.test.ts` covers language detection, fallback, voice matching, and
support detection. `SummaryAudioPlayer.test.tsx` stubs
`speechSynthesis`/`SpeechSynthesisUtterance` (no real voice or audio device) and
covers the accessible button, empty text, French/English synthesis, pause and
resume, stop, end state, error handling, stale cancellation events, unsupported
browsers, one-reading-at-a-time behaviour, speed selection, and the extra
restart when speed changes during playback.

Book customization is covered by `bookThemes.test.ts` (defaults and per-field
normalization), `BookCustomizationDialog.test.tsx` (all options render, the
preview updates immediately, Save sends the exact identifiers, Cancel and
Restore defaults do not persist, API errors keep the draft), and
`SummariesPage.test.tsx` (saved theme applied on open, live preview, save
applied without reloading, cancel discards). Backend coverage lives in
`apps/summaries/tests_book_preferences.py`.

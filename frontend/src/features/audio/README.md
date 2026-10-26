# Audio / voice memos feature

Record or upload voice memos, transcribe them with AI (Groq Whisper),
and detect the spoken language, the sentiment and a short summary. The page also
carries an accessibility widget and reads the transcript or the summary aloud
with the browser's own speech synthesis.

## Status

**Implemented** (backend + frontend). See `docs/API_CONTRACT.md` §3.3.

- Backend: `apps/audio/` — `AudioEntry` model, upload/list/detail/patch/delete
  endpoints under `/api/audio/`, Groq service layer, background AI processing.
- Frontend: recorder, upload fallback, entry list with status polling,
  transcript correction, read-aloud and the accessibility widget —
  route `app/audio` in `src/app/router.tsx`.

## AI pipeline

| Step | Groq model | Result stored |
| --- | --- | --- |
| Transcription | `whisper-large-v3-turbo` (`/v1/audio/transcriptions`) | `transcript` |
| Language detection | `openai/gpt-oss-20b` (`/v1/chat/completions`, JSON) | `language_code`, `language_name` |
| Sentiment | `openai/gpt-oss-20b` (JSON: label + confidence) | `sentiment`, `sentiment_score` |
| Summary | `openai/gpt-oss-20b` (≤ 40 words) | `summary` |

Model ids come from `GROQ_ASR_MODEL` / `GROQ_LLM_MODEL` and are multilingual on
purpose: MEMORA memos are French/Arabic as often as English, and an English-only
classifier silently returns nonsense on other languages. Groq's Whisper endpoint
does not report the spoken language, so detection is an LLM call over the
transcript.

Uploads answer `201` with `status: "pending"` and the AI runs on a background
thread; the UI polls `GET /api/audio/{id}/` every 3 s and shows the live stage
(recording → sending → transcribing → done / error).

## Structure

- `pages/AudioListPage.tsx` — recorder + file-upload fallback + list, plus the
  floating `AccessibilityWidget` and the page-level "this browser cannot speak"
  notice;
  injects the transcript of the just-analysed memo into the banner and shows
  fetch and save errors above the list.
- `components/VoiceRecorder.tsx` — MediaRecorder UI (idle → recording →
  preview → send) plus the live AI status line.
- `components/AudioEntryCard.tsx` — audio player + the 4 AI results
  (language, sentiment + confidence, summary, transcript) + read-aloud controls
  + inline editing of the transcript and summary + audio replacement +
  "Use in journal" + delete.
- `hooks/useAudioRecorder.ts` — MediaRecorder API wrapper (start/stop/reset,
  blob + preview URL).
- `hooks/useAudioEntries.ts` — list fetching, upload, update, delete, polling of
  `pending`/`processing` entries every 3 s, and `activeEntry` (the memo
  uploaded in this session, updated live).
- `hooks/useTranscriptJournal.ts` — "Use in journal": saves the transcript
  through the journal API, dedupes, tracks per-card button state and the
  success/error message.
- `services/audio.ts` — `/api/audio/` calls on top of `apiClient`
  (multipart upload handled natively; CSRF included).
- `types/audio.ts` — mirrors `AudioEntrySerializer` + §1.9 status contract.

Outside the feature folder, because they are shared: `components/AccessibilityWidget.tsx`,
`components/ReadAloudControls.tsx`, `hooks/useAccessibilityPreferences.ts`,
`hooks/useSpeech.ts`, `utils/accessibilityPreferences.ts`,
`utils/announcements.ts`, `utils/speech.ts`, and `test/fakeSpeech.ts` (the Web
Speech stub the tests run on).

## Layout (wide, horizontal)

The page fills the app content column (`.app-main` already caps every page at
`--content-max`, 1152px), so the memos get the same horizontal room as the
journal instead of the old 720px reading column.

- `.audio-page__intake` — recorder and file upload side by side
  (`1.5fr / 1fr`), one column below 720px.
- `.audio-card__body` — `repeat(auto-fit, minmax(19rem, 1fr))`, i.e. three
  equal columns when there is room: **player + language detected** |
  **sentiment + summary** | **transcript**. A memo still being analysed has a
  single column, so the player keeps the whole width.
- `.audio-card__footer` — `space-between`: 🔁 Replace audio on the left, and
  the main actions grouped right (✏️ Edit · 📝 Use in journal · Delete).
  In edit mode the same group holds 🎙 Re-record · Save changes · Cancel.
  `margin-inline-start: auto` keeps that group right-aligned even when a card
  has no left-hand action.
- Below 720px everything stacks in one column and the action buttons stretch to
  the row so they stay easy to tap; the floating ♿ trigger keeps its reserved
  bottom space, so it never covers a footer.

All of it lives in audio-specific classes (`.audio-page*`, `.audio-card*`)
inside the "Audio feature styles" section of `src/styles/global.css`. No shared
rule, no Journal file (`features/journal/journal.css` and its components) and no
`.app-main`/`.card`/`.btn` selector was touched.

## Correcting the transcript

Whisper mishears names and accents, so each finished card has **✏️ Edit**: the
transcript and the summary become textareas and `PATCH /api/audio/{id}/` saves
them. Language, sentiment and status stay read-only — they are derived from the
audio by the AI.

- The Edit button only appears once the memo reaches `succeeded` or `failed`; a
  failed memo can still be typed by hand.
- Saving while the worker is running is refused by the API with `409`, and the
  server message is shown in the list ("This memo is still being transcribed…")
  so the correction is never silently overwritten.
- A rejected save keeps the card in edit mode with the draft on screen;
  **Cancel** discards it.
- The corrected text is what the journal banner re-injects.

## Replacing the recording

**🔁 Replace audio** on a finished card picks another file and PATCHes it as
`multipart/form-data`. The new recording goes through the whole pipeline again:
the entry comes back as `pending` with empty AI fields, the old file is deleted
from storage, and the list resumes its 3 s polling until the new analysis ends.

Inside edit mode, **🎙 Re-record** opens `components/AudioReplaceRecorder.tsx` —
the same MediaRecorder flow as the page recorder (`hooks/useAudioRecorder`), but
scoped to this card: record → preview → "Replace with this take" sends the blob
(the browser gives `audio/webm;codecs=opus`) through the same PATCH, so a memo can
be re-done from the microphone without deleting it and starting over.

- Same 25 MB / MIME rules as the first upload (`services.py` shares one
  validator), and the same `409` guard while an analysis is running.
- A file and a text correction cannot be sent together — the replacement empties
  `transcript`/`summary`, so the API answers `400` instead of losing one of them.
  The recorder warns about this before sending and leaves edit mode on success.

## Transcript → journal injection

Each finished card offers **📝 Use in journal**, and the banner has the same
action for the memo just analysed. Clicking it does not pre-fill a form — it
saves the transcript for real, through the journal module's own service
(`src/services/journal.ts` → `POST /api/journal/entries/`), so the entry lives
in the database, appears in `/app/journal`, and survives a refresh. The audio
module never touches the journal model directly.

`hooks/useTranscriptJournal.ts` owns that flow:

- Sends `title: "Voice memo #<audio id>"`, the transcript as `text`, plus the
  AI `summary` and `sentiment` and the stored file path when present. The
  journal API binds the entry to the signed-in user (`perform_create`).
- **No duplicates:** before creating, it searches the journal for that title; a
  match re-uses the existing entry, the button switches to "📓 In your journal"
  and a second click navigates to `/app/journal` instead of posting again. An
  in-flight guard covers double clicks on the same card.
- **Explicit feedback:** a success or error `Alert` above the list, with an
  "Open the journal" shortcut. Errors come from `normalizeApiError`, so a DRF
  `400` shows the field message ("Text: This field may not be blank.").
- A memo with no transcript yet is refused with a clear message — no empty
  journal row is created.

## Accessibility widget (♿)

`AudioListPage` mounts `src/components/AccessibilityWidget.tsx`: a fixed round
trigger in the bottom-right corner, always visible, opening a panel of six
option groups. It is a shared component — another module gets the same behaviour
by rendering `<AccessibilityWidget />` once in its page.

| Option | What really changes |
| --- | --- |
| Text size A− / A / A+ | `data-a11y-text-size` on `<html>` → root font size 15px / browser default / 19px; every token is rem-based, so text **and** spacing scale together and nothing clips |
| High contrast | `data-a11y-contrast="high"` → black-on-white tokens (21:1), 2px borders, underlined links |
| Dark mode | `data-a11y-theme="dark"` → dark surfaces with ≥ 4.5:1 body text and AA-contrast primary buttons |
| Keyboard navigation | `data-a11y-focus="enhanced"` → 3px outline on any focused control, pointer clicks included |
| Screen-reader support | `data-a11y-screen-reader="on"` → the polite live region starts announcing option changes and any `announce()` message; the same text appears as a visible caption in the panel |
| Keyboard shortcuts | Alt+Shift+A/T/C/D/K/R + Escape, listed in the panel |

The shortcuts only claim Alt+Shift+letter: they bail out when Ctrl or Meta is
also held (so no browser shortcut is stolen) and when the keystroke arrives in
an `<input>`, `<textarea>`, `<select>` or `[contenteditable]` — typing "d" with
Alt+Shift in the transcript editor writes a character, it does not flip the
theme. Escape is the one exception: it closes the menu from anywhere.

Mechanics, and why they belong outside the component:

- `src/utils/accessibilityPreferences.ts` is the single source of truth: it
  validates what comes back from `localStorage` (key `memora:accessibility`),
  writes the `data-a11y-*` attributes, and seeds the defaults from
  `prefers-color-scheme` / `prefers-contrast`, so a user who already asked the OS
  for dark mode gets it before touching the menu.
- `main.tsx` applies the stored preferences **before** React renders — a refresh
  in dark mode or A+ shows no light flash.
- `src/hooks/useAccessibilityPreferences.ts` owns the state, persists every
  change and announces it through `src/utils/announcements.ts`, a small external
  store any module can publish to.
- The styling lives in `src/styles/global.css`, section "Accessibility widget &
  user preferences". Nothing in the widget paints the page itself.

WCAG 2.2 AA notes: the trigger is a real `<button>` with an accessible name and
`aria-expanded` (Tab, Enter, Space); each option is a `role="switch"` built on a
`<button>` so Enter works as well as Space, and its state is written as
"On"/"Off" instead of colour alone; Escape closes the panel and returns focus to
the trigger; clicking outside closes it; the panel scrolls and never covers the
cards (`.audio-page` reserves bottom space, and the last card's action buttons
stay reachable); labels stay English, as in the rest of the module.

## Read-aloud (Text-to-Speech)

Each finished card speaks its own texts: **🔊 Read transcript** and
**🔊 Read summary**, rendered by `src/components/ReadAloudControls.tsx` under the
summary and the transcript. It runs entirely on the browser's Web Speech API
(`window.speechSynthesis`) — no key, no service, no cost, and the recorded file
is never touched: the `<audio controls>` player keeps its original `src`, and
nothing here calls `PATCH /api/audio/{id}/`.

| Control | Behaviour |
| --- | --- |
| 🔊 Read transcript / summary | speaks that text; the button is labelled per memo ("Read the transcript of the memo from … aloud") |
| ⏸ Pause / ▶ Resume | `speechSynthesis.pause()` / `resume()`, with the state shown as "Reading …" / "Paused — …" |
| ⏹ Stop | `cancel()` and back to the read button |

How it works:

- `src/utils/speech.ts` is the engine — one module-level speaker, because
  `speechSynthesis` is global. Starting a second text cancels the first, so two
  memos can never overlap; stale utterance callbacks are dropped with a
  generation counter.
- The text is split into ≤ 180-character sentence chunks: Chrome cuts a single
  long utterance after ~15 s, so chunking is what makes a full transcript
  finish. `status` only returns to `idle` after the last chunk.
- The voice follows the AI's `language_code`: `pickVoice()` looks for an exact
  tag (`fr-FR`), then any voice of that language, and still sends the tag when
  no voice matches. Verified live on a French memo with the Windows French
  voices (Microsoft Hortense, `lang="fr-FR"`). `getVoices()` being async in
  Chrome is handled by caching the list and refreshing on `voiceschanged`.
- `hooks/useSpeech.ts` exposes that store to React with `useSyncExternalStore`,
  and `useStopSpeechOnLeave()` silences the reading when the page unmounts.
  Entering edit mode also stops it — the controls unmount, and a control that
  disappears while speaking stops the engine instead of leaving a voice with no
  Pause button.
- No speech synthesis? The page shows one `role="note"` banner ("This browser
  does not support speech synthesis…"), the read buttons point at it with
  `aria-describedby`, and a click reports the reason in `role="alert"` on that
  card only — never a silent success. Engine failures are translated too
  ("The browser blocked the reading. Interact with the page and try again.",
  "No voice is installed for this language yet.").
- Announcements ("Reading the transcript with a fr-FR voice", "End of the
  transcript") go through the same `utils/announcements.ts` live region as the
  accessibility widget, so screen readers follow the reading state when
  screen-reader support is on.

Styling: `.read-aloud*` and `.audio-page__notice` in `src/styles/global.css`;
the buttons are the shared `Button variant="secondary" size="sm"`, which keeps
them at the module's usual 33px height — above the 24×24 CSS px minimum of
WCAG 2.2 SC 2.5.8.

## Environment

Backend `.env` only — no AI key is ever read from React, logged, or committed.

- `GROQ_API_KEY` — Groq API key (<https://console.groq.com/keys>). **Required for
  real AI results**: without it the memo ends in `status: "failed"` with
  "AI service not configured. Set GROQ_API_KEY…" rather than fake AI output.
- `GROQ_ASR_MODEL` — Whisper model for transcription
  (default `whisper-large-v3-turbo`).
- `GROQ_LLM_MODEL` — model for language, sentiment and summary
  (default `openai/gpt-oss-20b`).
- `GROQ_MOCK=true` — tests / offline demos only. Every stub is prefixed
  `[Mock]`, so it can never be mistaken for a real AI answer.

## Tests

- Backend: `python manage.py test apps.audio` (upload validation, Groq request
  shape, structured LLM output handling, language/sentiment normalisation,
  credentials, quota, model-unavailable, format and timeout errors, background
  worker, ownership isolation, CRUD flows including transcript correction).
- Frontend: `npx vitest run src/features/audio` — editor behaviour in
  `components/AudioEntryCard.test.tsx` (save, rejected save keeps the draft,
  no editor while processing, hand-written failed memo, cancel), the read-aloud
  block of the same file (one button per text, French voice for a French memo,
  the `<audio>` `src` unchanged, controls hidden while editing, replace/edit/
  delete still working), and the journal injection in
  `hooks/useTranscriptJournal.test.tsx` (payload sent, duplicate click re-uses
  the entry, missing transcript refused, DRF `400` surfaced, double click posts
  once). Accessibility, run with `npx vitest run src/components src/utils`:
  `components/AccessibilityWidget.test.tsx` (open/close by click, Close button
  and Escape, every option really writing its `data-a11y-*` attribute,
  live-region announcement, global shortcuts, shortcuts ignored while typing in
  a field, persistence, reset), `utils/accessibilityPreferences.test.ts` /
  `utils/announcements.test.ts` (storage validation, attribute mapping, cycle
  order, message bus), `utils/speech.test.ts` (chunking, voice choice, single
  speaker, pause/resume/stop, empty text, unsupported browser, engine errors)
  and `components/ReadAloudControls.test.tsx` (button labels, Pause/Resume/Stop
  wiring, status line, only the playing memo shows controls, the unsupported
  notice link, errors on the right card). Shared `apiClient`/CSRF tests in
  `src/services/*.test.ts`.

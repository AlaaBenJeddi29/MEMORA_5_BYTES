# Audio / voice memos feature

Record or upload voice memos, transcribe them with AI (Groq Whisper),
and detect the spoken language, the sentiment and a short summary.

## Status

**Implemented** (backend + frontend). See `docs/API_CONTRACT.md` §3.3.

- Backend: `apps/audio/` — `AudioEntry` model, upload/list/detail/patch/delete
  endpoints under `/api/audio/`, Groq service layer, background AI processing.
- Frontend: recorder, upload fallback, entry list with status polling —
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

- `pages/AudioListPage.tsx` — recorder + file-upload fallback + list;
  injects the transcript of the just-analysed memo into the banner and shows
  save errors above the list.
- `components/VoiceRecorder.tsx` — MediaRecorder UI (idle → recording →
  preview → send) plus the live AI status line.
- `components/AudioEntryCard.tsx` — audio player + the 4 AI results
  (language, sentiment + confidence, summary, transcript) + inline editing of
  the transcript and summary + audio replacement + delete.
- `hooks/useAudioRecorder.ts` — MediaRecorder API wrapper (start/stop/reset,
  blob + preview URL).
- `hooks/useAudioEntries.ts` — list fetching, upload, update, delete, polling of
  `pending`/`processing` entries every 3 s, and `activeEntry` (the memo
  uploaded in this session, updated live).
- `services/audio.ts` — `/api/audio/` calls on top of `apiClient`
  (multipart upload handled natively; CSRF included).
- `types/audio.ts` — mirrors `AudioEntrySerializer` + §1.9 status contract.

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

When polling reports `succeeded`, `AudioListPage` injects the transcript into
the "ready to use in your journal" banner, and each card offers
"📝 Use in journal". Actual pre-fill of the journal form is blocked on the
journal API (module 3, not yet implemented): the plan is to navigate to the
journal entry form with the transcript as initial content once
`/api/journal/entries/` exists.

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
  no editor while processing, hand-written failed memo, cancel). Shared
  `apiClient`/CSRF tests in `src/services/*.test.ts`.

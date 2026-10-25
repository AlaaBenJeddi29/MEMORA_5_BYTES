# Media library feature

Uploaded photos and AI-generated illustrations for the journal.

## Status

Implemented against the Module 4 Django API. The page lives at `/app/media`
and uses `services/media.ts` on top of the shared `apiClient`.

## Generation safeguards

- The generation form requires an explicit consent checkbox and a submit
  action; nothing is generated on page load.
- A ref-based in-flight guard plus disabled controls prevent duplicate clicks.
  The API itself has no idempotency ledger, so repeated successful requests
  are recorded as separate images.
- Only the typed prompt or the selected sample-memory ID leaves the browser.
  The server resolves sample memories and sends only the title to ComfyUI,
  never the body text.
- Prompt guidance and scene-only examples state that the model cannot
  faithfully recreate a real person's likeness and that names or private
  details should not be included.
- AI results are labelled in the gallery, the result panel, and the detail
  dialog; each states that the image is AI-generated, not an original
  photograph.
- Generated outputs are re-encoded to PNG with all provider metadata removed
  (prompt/workflow text chunks, EXIF, ICC, DPI).
- Prompt length and server-side size/step limits mirror configurable backend
  settings; the server remains authoritative.
- Gallery/API access is owner-scoped. Stored media URLs are unguessable
  capability URLs (unauthenticated in `DEBUG`), not owner-scoped file access
  control; production delivery is a team decision (API contract §4.11).

## API reference

See `docs/API_CONTRACT.md` §3.5 and `docs/COMFYUI.md`.

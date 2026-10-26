# Local ComfyUI image generation

Module 4 generates images with **ComfyUI running on the same machine as
Django**. React never calls ComfyUI, and no hosted provider, API credit,
Hugging Face token, `fal-ai`, Replicate, or paid fallback is used.

## Verification status

**Verified from the official ComfyUI source (master branch):**

- `POST /prompt` accepts `{"prompt": <API-format workflow>, "client_id": ...}`
  and returns `{"prompt_id", "number", "node_errors"}`.
- `GET /history/{prompt_id}` returns `{}` while pending and a completed entry
  with `outputs` and `status: {status_str, completed, messages}` afterwards.
- `GET /view?filename=...&subfolder=...&type=output` serves the output image.
- `SaveImage` returns `{"filename", "subfolder", "type": "output"}` and embeds
  prompt/workflow metadata inside the PNG unless ComfyUI is started with
  `--disable-metadata`.

**Not verified on this machine:**

- ComfyUI was not running at `http://127.0.0.1:8188` while this integration was
  written (`/system_stats` refused the connection).
- No ComfyUI installation or Stable Diffusion checkpoint was found.
- No real image has been generated, no model has been benchmarked, and no claim
  is made that a specific model/settings combination fits in 4 GB of VRAM.
- The installed ComfyUI version may differ from the master-source contract above.

The automated tests use a fake HTTP session and a fake image response. They
require no ComfyUI server, GPU, checkpoint, network, or credits.

## Architecture

```
React -> Django session-authenticated API -> apps/media_library/comfyui.py
                                              -> local ComfyUI HTTP API
                                              -> SaveImage output
                                              -> validate + re-encode PNG
                                              -> MediaFile (ai_generated)
```

- `apps/media_library/comfyui.py` is the only module that talks to ComfyUI.
- The endpoint is synchronous: it submits a job, polls with a bounded deadline,
  and returns only after the validated image is stored.
- The API never returns the ComfyUI URL, workflow, filesystem path, or internal
  error text.
- The backend validates the output content type, byte size, decoded format,
  safety, and that its dimensions match the requested size. Only a
  metadata-free PNG is stored.
- Only successful generations create rows: `media_type=ai_generated`,
  `status=succeeded`, with `owner`, `prompt`, and optional `journal_entry_id`.
  Uploads remain `media_type=original` and are otherwise unchanged.

## Configuration

Add these values to `.env` (see `.env.example`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `COMFYUI_BASE_URL` | `http://127.0.0.1:8188` | Local ComfyUI HTTP endpoint |
| `COMFYUI_WORKFLOW_PATH` | `apps/media_library/workflows/stable_diffusion_1_5_text_to_image.json` | API-format workflow template |
| `COMFYUI_CHECKPOINT` | empty | Exact checkpoint filename shown by ComfyUI, e.g. `my-sd15-model.safetensors` |
| `COMFYUI_TIMEOUT` | `180` | Total generation deadline in seconds |
| `COMFYUI_REQUEST_TIMEOUT` | `15` | Per-HTTP-request timeout in seconds |

There are no token or credential variables for generation. `COMFYUI_CHECKPOINT`
is intentionally empty until a model is installed, so generation returns
`503` rather than submitting a broken workflow.

## Workflow template

`apps/media_library/workflows/stable_diffusion_1_5_text_to_image.json` is an
API-format (not UI-format) workflow:

```
CheckpointLoaderSimple
  -> CLIPTextEncode (positive + fixed negative)
  -> EmptyLatentImage
  -> KSampler
  -> VAEDecode
  -> SaveImage
```

The backend replaces each placeholder **exactly once**:

| Placeholder | Value |
| --- | --- |
| `__CHECKPOINT__` | `COMFYUI_CHECKPOINT` |
| `__PROMPT__` | Approved prompt or server-built journal prompt |
| `__SEED__` | Request seed, or a random 63-bit seed |
| `__WIDTH__` / `__HEIGHT__` | Allowed dimensions |
| `__STEPS__` | Sampling steps |

If you export a different workflow from ComfyUI (`File -> Export (API)`), it
must contain each placeholder exactly once. Otherwise the backend returns a
safe configuration error. The template's model, sampler, scheduler, CFG, and
negative prompt are starting values, not guaranteed settings.

## Manual local installation (not performed here)

These steps are instructions, not claims that they have already worked on this
machine.

1. Install a current NVIDIA driver and the CUDA-enabled PyTorch build required
   by ComfyUI. Follow the official
   [ComfyUI repository](https://github.com/comfyanonymous/ComfyUI) installation
   instructions.
2. Install or download ComfyUI into a local folder and start its bundled Python
   environment. Keep ComfyUI's dependencies separate from MEMORA's `.venv`.
3. Obtain a Stable Diffusion 1.5 checkpoint that you are licensed to use and
   place it in ComfyUI's `models/checkpoints/` directory. Record the exact
   filename (including any subfolder) as ComfyUI displays it.
4. Start ComfyUI on loopback, for example:

   ```bash
   python main.py --listen 127.0.0.1 --port 8188
   ```

   If the 4 GB GPU runs out of memory, try ComfyUI's low-VRAM options and close
   other GPU applications. This is hardware-dependent and must be tested; do not
   assume a flag or resolution will work.
5. Confirm ComfyUI is reachable:

   ```bash
   curl http://127.0.0.1:8188/system_stats
   ```

6. In ComfyUI, load the SD 1.5 checkpoint and run one manual text-to-image
   generation at `512x512` with 20 steps. This proves the checkpoint and workflow
   work independently of Django.
7. Set `COMFYUI_CHECKPOINT` in MEMORA's `.env` to that exact checkpoint name.
   Leave `COMFYUI_WORKFLOW_PATH` on the provided template unless you have a
   compatible exported workflow with all placeholders.
8. Restart Django after changing `.env`, then run the smoke test below.

### Hardware and model notes

- Target machine: NVIDIA RTX 3050 Ti, **4 GB dedicated VRAM** (7.6 GB shared),
  AMD Ryzen 7 6000-series, 16 GB RAM.
- SD 1.5 at `512x512`, 20 steps, batch size 1 is the proposed baseline. The
  larger allowed sizes (`512x768`, `768x512`) need testing; they may fail or be
  slow on 4 GB.
- Do not assume SDXL or FLUX will fit. They are not configured by this
  integration.
- The endpoint has a 180-second default deadline. Only one local generation is
  practical at a time; ComfyUI will queue additional jobs. A timeout returns
  `504` and does **not** cancel the already-queued ComfyUI job.

### Model license

The SD 1.5 base model is commonly distributed under the CreativeML OpenRAIL-M
license, but individual checkpoints can carry different or additional terms.
Check the model card and license for the exact checkpoint you install before
using it or its generated images. This project does not bundle, download, or
redistribute any model or weights.

## API usage

`POST /api/media/generate/` requires an authenticated session and CSRF header,
like other unsafe MEMORA API calls.

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

- At least one of `prompt`, `journal_entry_id`, or `summary_id` is required.
  Default maximum: 1000 characters (`MEDIA_GENERATION_MAX_PROMPT_LENGTH`).
- `journal_entry_id` and `summary_id` are resolved through owner-scoped ORM
  queries. Missing or foreign IDs return a generic `400`; a summary paired with
  a different journal entry is rejected.
- Prompt precedence: manual `prompt` → the summary's stored
  `illustration_prompt` → the journal entry's title and recap. Journal body
  text is never sent to ComfyUI, and client-supplied title/text fields are
  ignored. Summary generation is not repeated; Gemini is not called by Module 4.
- Default allowed sizes: `512x512`, `512x768`, `768x512`
  (`MEDIA_GENERATION_ALLOWED_SIZES`; first value is the default).
- `steps`: 1-30 by default (`MEDIA_GENERATION_MIN_STEPS`,
  `MEDIA_GENERATION_MAX_STEPS`, default 20). `seed`: 0 to `2^63 - 1` optional.
- Only these provider-supported inputs are accepted and forwarded. Unknown
  request fields are not passed to the workflow.
- Generation is synchronous and starts only from an explicit POST. The UI
  requires consent, disables the controls while pending, and guards against
  double clicks. The API has no idempotency ledger, so a repeated successful
  POST would generate another image.
- Response is `201` with the normal `MediaFile` shape, including `status`:

```json
{
  "id": 12,
  "file": "http://127.0.0.1:8000/media/users/1/2026/10/<uuid>.png",
  "media_type": "ai_generated",
  "prompt": "A quiet lake at dawn, watercolor",
  "status": "succeeded",
  "journal_entry_id": 1,
  "journal_entries": [{ "id": 1, "title": "Morning walk" }],
  "summary_id": 4,
  "provider": "comfyui",
  "model": "v1-5-pruned-emaonly.safetensors",
  "created_at": "2026-10-24T20:30:00.000000Z",
  "updated_at": "2026-10-24T20:30:00.000000Z"
}
```

Safe failure responses:

| Status | Meaning |
| --- | --- |
| `400` | Invalid prompt, journal id, dimensions, steps, or seed |
| `403` | Not authenticated |
| `502` | ComfyUI rejected the job, failed, or returned an unusable image |
| `503` | Missing checkpoint/config, or ComfyUI is unreachable |
| `504` | Total generation deadline exceeded |
| `500` | The validated image could not be stored |

No stack trace, prompt, workflow, filesystem path, or ComfyUI response body is
included in error responses or application logs. Logs contain only the user ID,
requested size, steps, prompt character count, and journal ID. Output images are
re-encoded to PNG with all source metadata cleared (prompt/workflow text chunks,
EXIF, ICC, DPI), marked `media_type=ai_generated`, and the UI states that results
are AI-generated rather than original photographs in both the result panel and
the detail dialog.

## Smoke test against real ComfyUI

Start ComfyUI and Django first, then run this from the project root. It uses
Django's test client to bypass browser CSRF for a local smoke test only; it still
executes the real ComfyUI service and stores a real file.

```bash
source .venv/Scripts/activate
python manage.py migrate
python manage.py shell
```

```python
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from apps.media_library.models import MediaFile

user, _ = get_user_model().objects.get_or_create(username="comfy-smoke")
client = APIClient()
client.force_authenticate(user=user)

response = client.post(
    "/api/media/generate/",
    {"prompt": "A quiet lake at dawn, watercolor", "width": 512, "height": 512, "steps": 20},
    format="json",
)
print(response.status_code, response.data)

media = MediaFile.objects.get(pk=response.data["id"])
print(media.media_type, media.status, media.file.path)
```

Expected result: `201`, `ai_generated succeeded`, and a real PNG under
`media/users/...`. Open that path and confirm it is the generated image, not a
placeholder and not a metadata-bearing ComfyUI output.

If it fails:

- `503` with "not configured" -> `COMFYUI_CHECKPOINT` is empty or wrong.
- `503` with "unavailable" -> ComfyUI is not running at `COMFYUI_BASE_URL`.
- `502` -> the checkpoint/workflow was rejected or produced no valid output;
  check the ComfyUI console.
- `504` -> raise `COMFYUI_TIMEOUT` only after checking the actual generation time,
  or reduce size/steps and test again.

## Remaining limitations

- The integration has not been exercised against a real ComfyUI install or GPU.
- No background task queue exists. The request blocks while polling, and a
  timed-out job keeps running in ComfyUI.
- Only one image per request and a single fixed workflow are supported.
- Failed generations are not persisted as `failed` rows because no file exists;
  the `MediaFile.Status` choices are ready for a future asynchronous workflow.
- No automatic model download, licensing check, or GPU capability detection.
- `GET /api/media/` returns the caller's uploads and generated images; uploads
  are still stored byte-for-byte unchanged and continue to be `original`.

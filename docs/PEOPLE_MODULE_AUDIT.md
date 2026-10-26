# MEMORA — `apps/people` Read-Only Audit

**Audit date:** 2026-10-26  
**Branch at audit time:** `FaceRecognition`  
**Scope:** `apps/people/`, its templates, the React `features/people` module, and its integration with `media_library`, shared config, docs, and tests.

**Verification basis**

I inspected `apps/people/`, its templates, the React `features/people` module, `media_library`, `config/`, and the relevant docs/tests. I made **no changes** to any application file during the audit. I did **not** run migrations, tests, or inspect/mutate database contents. I did verify that the installed environment can import the recognition stack:

- `face_recognition` **1.2.3** (requirements pin **1.3.0**), `Pillow 12.3.0`, `numpy 2.4.6`.
- Actual recognition accuracy/speed was **not** measured; performance statements below are code-derived.

---

## 1. Executive summary

Your module is a working **manual face-tagging MVP**, not yet a face-grouping system.

Implemented end-to-end:

- Person CRUD with an owner FK and avatar.
- Automatic face detection, 128-float encoding, bounding boxes, and JPEG face crops whenever a `MediaFile` row is created.
- Nearest-known-face suggestion using Euclidean distance with a hard-coded threshold of `0.6`.
- Manual assignment, suggestion confirmation, clearing, and per-face deletion.
- Person albums (“all photos where this person appears”).
- HTML pages and a React/TypeScript UI.
- Owner-scoped REST API and decent backend isolation tests.

Not implemented:

- Clustering/grouping of **unassigned** faces.
- Duplicate-person detection or merging.
- “Photos with friends” / co-occurrence.
- Reprocessing when the model or threshold changes.
- Processing status, retry, or background jobs.
- User-controlled opt-in/opt-out or bulk biometric deletion.
- Face boxes over the full photo, bulk tagging, or a global suggestions inbox.

| Area | Verdict |
|---|---|
| Person management | **Implemented** |
| Photo intake | **Implemented**, but two disconnected paths |
| Face detection/encoding/crops | **Implemented**, synchronous and full-resolution |
| Matching/suggestions | **Implemented**, basic single-candidate matching |
| Manual association/confirmation | **Implemented**; rejection is not |
| Grouping | **Partial** — person album only; unknown-face grouping missing |
| Duplicate detection/merge | **Missing** |
| Reprocessing/status | **Missing** |
| Privacy controls | **Partial and weak** |
| Automated tests | **Partial** — core suggestion/isolation tests exist; pipeline untested |
| Documentation accuracy | **Stale** — README/docs still describe People as empty/proposed |

The biggest risks are not cosmetic: biometric processing is automatic, face crops/avatars are stored at guessable paths and served unauthenticated in DEBUG, deleting a person leaves face encodings and crops behind, and the upload request blocks on full-resolution CPU recognition.

---

## 2. Complete list of existing features

### 2.1 Person model and CRUD

**User view:** A user can create a person, optionally upload an avatar, see their people list, rename a person, replace their avatar, open a person’s album, and delete the person.

**Technical:** `Person` has `owner` (FK to `AUTH_USER_MODEL`), `name`, `avatar`, `created_at`, and `unique_together = ('owner', 'name')` in `apps/people/models.py:5-20`. CRUD exists in both layers:

- HTML: `person_list`, `person_detail`, `person_edit` in `apps/people/views.py:10-67`.
- API: `person_list` GET/POST and `person_detail` GET/PATCH/DELETE in `apps/people/api_views.py:22-55`, with `PersonSerializer` in `apps/people/serializers.py:8-26`.

**Status:** Fully implemented.

**Limitations:**

- HTML creation silently ignores a duplicate name rather than showing an error (`views.py:15-16`).
- Names are case-sensitive in SQLite because there is no case-insensitive constraint; “Alice” and “alice” can both exist.
- Avatar uploads through HTML are not validated for type or size (`views.py:14-16`, `views.py:48-57`). The API serializer uses DRF’s `ImageField`, so it validates more, but there is still no size cap.
- Replacing an avatar leaves the old file on disk; deleting a person leaves the avatar file on disk. There is no `post_delete` receiver for `Person`.
- Deleting a person does not show how many faces/photos will be unassigned; it silently relies on `SET_NULL`.
- The `exists()`-then-`create()` pattern in HTML and the serializer validation are vulnerable to a race condition; a concurrent duplicate could cause an `IntegrityError` / 500.
- No aliases, notes, birthday, relationship metadata, or merge support.

### 2.2 User ownership and isolation

**User view:** Users only see their own people, photos, faces, and albums. Requesting another user’s object returns 404.

**Technical:** API views use `IsAuthenticated` and filter by `owner=request.user` or `photo__owner=request.user` (`apps/people/api_views.py:22-143`). HTML views use `@login_required` plus owner-scoped `get_object_or_404` (`apps/people/views.py:10-140`). Tests cover list/detail/edit/delete/face-assignment isolation in `apps/people/tests.py:95-235` and API isolation in `apps/people/tests.py:237-313`.

**Status:** Implemented and reasonably well tested.

**Limitations:**

- Isolation is application-level only. In DEBUG, `/media/` is served without authentication (`config/urls.py:45-46`); see 5.1.
- Admin users can see all records, which is expected for admin but worth noting.
- `DetectedFace.suggested_person` has no database-level owner constraint. `face_confirm` does not re-check that the suggested person belongs to the same owner (`api_views.py:134-143`, `views.py:131-140`). The normal suggestion path prevents it, but admin-created data could violate it.

### 2.3 Photo intake — two disconnected paths

**User view:** Photos can be added through the React Media Library page or through the dev HTML page `/people/photos/`. AI-generated images can also enter the library.

**Technical:**

- React Media Library upload: `MediaFileListCreateView` → `MediaFileSerializer.create` (`apps/media_library/views.py:49-68`, `apps/media_library/serializers.py:161-181`). This path validates bytes, format, size, pixel count, and animation.
- HTML People upload: `MediaFile.objects.create(owner=request.user, file=photo)` in `apps/people/views.py:70-76`. This bypasses `MediaFileSerializer.validate_file` entirely.
- ComfyUI generation: `GenerateImageView` creates and saves a `MediaFile` in `apps/media_library/views.py:103-199`.

**Status:** Implemented, but the HTML path is a validation bypass.

**Limitations:**

- HTML upload accepts non-image files, oversized files, and animated images; it merely stores them. The face signal then logs an exception and leaves the row without faces.
- The React People pages do **not** provide upload; `MyPhotosPage` explicitly tells users to upload via the HTML page (`frontend/src/features/people/pages/MyPhotosPage.tsx:48-51`). This is disconnected from the Media Library upload UI.
- The People “My photos” API lists **all** `MediaFile` rows for the owner, including AI-generated images, not only photos tagged in People (`api_views.py:86-92`).
- No upload progress or processing status is exposed.

### 2.4 Automatic face detection, encoding, and storage

**User view:** After a photo is uploaded, detected faces appear automatically as cropped thumbnails on that photo’s tagging page.

**Technical:**

- `process_new_media_file` listens to `post_save` on `MediaFile` and calls `process_photo` only when `created=True` (`apps/people/signals.py:15-25`).
- `detect_and_encode` loads the full image, runs `face_recognition.face_locations`, then `face_encodings`, and returns `{bounding_box, encoding}` per face (`apps/people/services.py:21-42`).
- `process_photo` creates one `DetectedFace` per detected face with `photo`, `encoding`, and `bounding_box` (`services.py:91-112`).
- `DetectedFace` stores `encoding` as a JSON list of 128 floats, `bounding_box` as a JSON dict of `top/right/bottom/left`, and `face_crop` as an `ImageField` (`apps/people/models.py:23-47`).

**Status:** Implemented.

**Limitations:**

- Runs **synchronously inside the upload request**, inside the media serializer’s `transaction.atomic()` for Media Library uploads (`media_library/serializers.py:164-165`) and inside the generation transaction (`media_library/views.py:173-176`). Upload latency is therefore dominated by CPU recognition.
- Full-resolution detection; no downscaling. A 40 MP image is allowed by `MEDIA_IMAGE_MAX_PIXELS` (`config/settings.py:254-256`).
- `crop_face` opens the image again for every face (`services.py:45-59`), so an N-face photo is decoded N+1 times.
- Uses library defaults: HOG detector, `upsample=1`, and in the installed face_recognition 1.2.3 the default encoding model is `"small"` (5-point). There is no configuration in this project.
- `face_recognition` import failure sets the module to `None` and every upload silently produces zero faces (`services.py:9-13`, `services.py:23-24`, `services.py:93-94`).
- `media_file.file.path` assumes local filesystem storage (`services.py:96`, `services.py:110`). Remote/object storage would break.
- No transaction around `process_photo`; if cropping fails after a row is created, partial rows remain and later faces are skipped.
- No idempotency or uniqueness constraint on `(photo, bounding_box)`; calling processing twice duplicates rows and creates new crop files.
- No model/version metadata on the encoding, so you cannot tell which algorithm produced it.
- No face-size, blur, or quality filtering.
- EXIF orientation is not applied by `load_image_file`; crops can be rotated relative to how a browser displays the original. This is code-level expected behavior, but I did not test a rotated photo.
- No marker distinguishing “no face found” from “detection failed” or “library unavailable”.

### 2.5 Bounding boxes and face crops

**User view:** Each detected face is shown as a small square image. The full-photo tagging page shows the original photo and the crop cards, but not boxes drawn over the photo.

**Technical:** Bounding boxes are stored and serialized (`models.py:37`, `serializers.py:35-48`, frontend `types.ts:21-35`). Crops are created by `crop_face` and saved as `face_<media_id>_<index>.jpg` under `people/faces/` (`services.py:45-59`, `services.py:110-112`).

**Status:** Implemented; bounding boxes are stored/API-exposed but **unused by the UI**.

**Limitations:**

- No padding around crops; edge/tight crops can cut off context.
- Crops are always JPEG; transparency becomes an opaque conversion.
- Filenames expose the sequential media ID and face index, so they are guessable.
- No crop regeneration if a crop is missing.
- No UI overlay using `bounding_box`; the React type includes it but `FaceTaggingCard` does not render it.

### 2.6 Similarity matching and suggested people

**User view:** After upload, a face may show “Suggestion : Alice” with a raw distance and a “Confirmer” button.

**Technical:** `suggest_person(encoding, owner)` queries every assigned `DetectedFace` for the owner, computes `face_distance`, keeps the single nearest face, and returns its person only if `distance <= SEUIL_SUGGESTION` (`services.py:62-88`). The threshold is a module constant `0.6` (`services.py:18`). The suggestion and distance are stored during `process_photo` (`services.py:104-108`).

**Status:** Implemented, basic.

**Limitations:**

- Single best candidate only; no top-k alternatives, no runner-up margin, no confidence percentage.
- Threshold is hard-coded and not configurable per user, environment, or model.
- Matches against individual faces, not per-person aggregated templates. One mislabeled or unusual reference face can dominate.
- Suggestions are computed once at upload time and never refreshed after new people/faces/thresholds appear.
- Cold start: before the user has any assigned faces, no suggestions are possible; there is no fallback onboarding or clustering.
- Confirming one face does not rematch the other unknown faces in the same photo.
- The score is a distance, not a calibrated probability; the UI displays it as “Distance : 0.xxx” without interpretation.
- The loop performs one database query per detected face and one Python-level `face_distance` call per known face; this is O(F×N) per upload.
- Deleting a suggestion target sets `suggested_person` to NULL but leaves `distance`; the UI can show a distance with no suggestion (`FaceTaggingCard.tsx:114-118`).

### 2.7 Manual association, confirmation, and face deletion

**User view:** A user can choose a person from a dropdown, confirm a suggestion, clear the assignment, or remove a detected face entirely.

**Technical:**

- HTML: `face_assign` (`views.py:115-128`), `face_confirm` (`views.py:131-140`), `face_delete` (`views.py:106-112`).
- API: `face_detail` PATCH/DELETE (`api_views.py:102-131`), `face_confirm` (`api_views.py:134-143`).
- Frontend: `FaceTaggingCard.tsx:16-133`.

**Status:** Implemented.

**Limitations:**

- No explicit **reject suggestion** action. Assigning “Aucune” clears `person` but leaves `suggested_person`, so the suggestion remains visible.
- Confirming copies `suggested_person` to `person` but does not clear the suggestion or recompute distance.
- No bulk confirm/assign; each face is handled individually.
- Assigning the same person to multiple faces in the same photo is allowed without warning.
- Deleting a face removes its encoding and crop. The UI labels this “Retirer ce visage”, which may sound like untagging rather than deleting biometric data.
- The React select assigns immediately on change (`FaceTaggingCard.tsx:91`); there is no separate save/undo step.
- No audit trail of who/when a face was confirmed, only `DetectedFace.created_at`.

### 2.8 Person album / grouping

**User view:** Opening a person shows all photos where that person has been assigned.

**Technical:** HTML `person_detail` queries `DetectedFace` filtered by `person` and photo owner (`views.py:31-39`). API `person_photos` groups faces by photo and returns photo URL plus crops (`api_views.py:58-83`). React `PersonAlbumPage.tsx:17-167` renders this data.

**Status:** **Partial grouping.** This is a person-centric album, not automatic grouping of unlabeled faces.

**Limitations:**

- Only explicitly assigned faces appear; suggested-but-unconfirmed faces do not.
- No unknown-face groups, no similarity clusters, no “people who appear together.”
- No photo count per person on the People list.
- No pagination; large albums are returned in one response.
- The album includes crops, not clickable face boxes.

### 2.9 Duplicate detection and merging

**Status: Missing.**

- There is no duplicate-face detection, duplicate-person detection, merge service, merge endpoint, or merge UI.
- The only duplicate protection is `unique_together = ('owner', 'name')` (`models.py:15-17`), which is case-sensitive and only prevents identical spelling.
- Renaming exists; merging does not.

### 2.10 Signal handlers and deletion behavior

**User view:** Deleting a photo removes its faces and crops; deleting a face removes its crop; deleting a person unassigns their faces.

**Technical:**

- `process_new_media_file`: `post_save` on MediaFile, created only (`signals.py:15-25`).
- `delete_media_file`: `post_delete` on MediaFile, schedules storage cleanup with `transaction.on_commit` (`signals.py:28-53`).
- `delete_face_crop_file`: `post_delete` on DetectedFace, deletes `face_crop` immediately (`signals.py:56-60`).
- `Person` deletion is handled only by FK behavior: `DetectedFace.person` and `suggested_person` are `SET_NULL` (`models.py:29-46`).

**Status:** Implemented, with important gaps.

**Limitations:**

- Media-file cleanup is duplicated: `apps/people/signals.py:28-53` and `apps/media_library/views.py:85-100` both delete the same stored file. The second attempt is usually harmless but couples two modules.
- `delete_face_crop_file` has no exception guard, unlike media cleanup. A storage error could propagate during deletion.
- Crop file deletion happens in `post_delete`, before the enclosing transaction commits. If the transaction rolls back, the database row can return while the crop file is already gone.
- Deleting a person does **not** delete their encodings, crops, or faces; rows remain with `person=NULL`. Biometric templates therefore survive “deleting the person.”
- Replacing a person avatar does not delete the old avatar.
- There is no orphan-file cleanup command.
- If `process_photo` raises a database error inside the media upload’s outer atomic block, the signal swallows the exception (`signals.py:21-25`), which can leave the outer transaction in a broken state. This is a possible edge case, not observed at runtime.

### 2.11 HTML pages and forms

**User view:** A simple French-language server-rendered UI is available at `/people/`.

**Technical:** Routes in `apps/people/urls.py:7-17`:

- `/people/` — people list + create.
- `/people/<pk>/` — person detail + delete + face album.
- `/people/<pk>/edit/` — rename/avatar.
- `/people/photos/` — photo list + upload + delete.
- `/people/photos/<pk>/` — photo detail + faces.
- `/people/photos/<pk>/delete/`
- `/people/faces/<pk>/assign/`
- `/people/faces/<pk>/confirm/`
- `/people/faces/<pk>/delete/`

Templates are in `templates/people/`. `templates/base.html` provides navigation.

**Status:** Implemented as a dev/testing UI.

**Limitations:**

- Duplicates the React UI and can drift.
- No upload validation (`views.py:70-76`).
- No pagination.
- Login redirects to `/admin/login/` (`config/settings.py:218`), not the React login.
- Mixed French/English UI and messages.

### 2.12 REST API, serializers, permissions

**Endpoints** (`apps/people/api_urls.py:5-13`):

| Method | Path | Behavior |
|---|---|---|
| GET, POST | `/api/people/` | List/create own people |
| GET, PATCH, DELETE | `/api/people/<pk>/` | Retrieve/update/delete own person |
| GET | `/api/people/<pk>/photos/` | Photos containing that person |
| GET | `/api/people/photos/` | All own media with `faces_count` |
| GET | `/api/people/photos/<pk>/` | One photo with embedded faces |
| PATCH, DELETE | `/api/people/faces/<pk>/` | Assign/clear person or delete face |
| POST | `/api/people/faces/<pk>/confirm/` | Confirm stored suggestion |

**Serializers** (`apps/people/serializers.py`):

- `PersonSerializer`: `id`, `name`, `avatar`, `created_at`; duplicate-name validation.
- `PersonBriefSerializer`: `id`, `name`.
- `DetectedFaceSerializer`: `id`, `face_crop`, `bounding_box`, `person`, `suggested_person`, `distance`.
- `PhotoSerializer`: `id`, `photo`, `uploaded_at`, `faces_count`.
- `PhotoDetailSerializer`: `id`, `photo`, `uploaded_at`, `faces`.

**Permissions:** All API endpoints use `IsAuthenticated` (`api_views.py:23`, etc.); global DRF defaults also require authentication (`config/settings.py:312-319`). Ownership is enforced in queries.

**Status:** Implemented.

**Limitations:**

- No pagination on any list (`person_list`, `photo_list`, `person_photos`).
- No endpoint to list all unassigned faces or suggestions.
- No reprocess/retry endpoint.
- No merge endpoint.
- No bulk assignment.
- No biometric purge endpoint.
- No top-k/candidate endpoint.
- No face creation endpoint.
- `DetectedFace.encoding` is not exposed in API responses (good privacy) but is visible read-only in Django admin (`admin.py:13-18`).
- `photo_list` returns all media, not only people-tagged photos.
- Docs still call these endpoints “PROPOSED” (`docs/API_CONTRACT.md:655-677`) while they are implemented.

### 2.13 React frontend

**User view:** A French-language “People” module in the SPA: people list/create/edit/delete, “Mes photos” grid, photo tagging, and person albums.

**Technical:**

- Routes registered in `frontend/src/app/router.tsx:66-69`; sidebar link already exists in `AppLayout.tsx:18`.
- `peopleApi.ts` wraps `/api/people/` endpoints through the shared CSRF-aware `apiClient`.
- Pages: `PeoplePage.tsx`, `MyPhotosPage.tsx`, `PhotoTaggingPage.tsx`, `PersonAlbumPage.tsx`.
- Components: `PersonForm.tsx`, `FaceTaggingCard.tsx`, `PeopleNav.tsx`.
- Types: `types.ts`; error helper: `describeApiError.ts`.

**Status:** Implemented for the basic workflow.

**Limitations:**

- No upload UI; `MyPhotosPage` directs users to the HTML page (`MyPhotosPage.tsx:48-51`).
- No unknown-face inbox, merge, friends view, top-k suggestions, or reject action.
- No bounding-box overlay on the full image.
- No bulk tagging.
- `MyPhotosPage` is read-only and shows only face counts, not tagged names.
- Only `PeopleNav.test.tsx` exists; there are no page/API component tests.
- `frontend/src/features/people/README.md:5-8` still says “Shell only”, which is stale.

### 2.14 Admin and automated tests

**Admin:** `PersonAdmin` and `DetectedFaceAdmin` are registered (`apps/people/admin.py:6-18`); encodings and bounding boxes are read-only in admin.

**Tests:** `apps/people/tests.py` contains **23 tests**:

- Suggestion logic and owner filtering: `tests.py:24-72`.
- Signal creation/update behavior: `tests.py:75-93`.
- HTML isolation and CRUD: `tests.py:95-235`.
- API isolation and assignment: `tests.py:237-313`.

**Status:** Partial.

**Limitations:**

- No test exercises real detection, cropping, encoding dimensions, or the actual upload→face pipeline. `create_photo()` patches `process_photo` (`tests.py:18-21`).
- No tests for `DetectedFace` deletion/crop cleanup, avatar cleanup, reprocessing, duplicate processing, invalid encoding dimensions, or large images.
- No API authentication test (unauthenticated API request), though HTML login is tested.
- No frontend tests for people pages beyond navigation.
- `apps/media_library/tests.py` does **not** patch the People signal, so creating test media also triggers real face processing unless the library is unavailable. This is an integration coupling and potential test slowdown.

### 2.15 Integration with `media_library` and the rest of the project

**Technical:**

- `apps/people` imports `MediaFile` in `views.py`, `signals.py`, `api_views.py`, and `serializers.py`.
- `config/urls.py:29` mounts `/people/`; `config/urls.py:37` mounts `/api/people/`.
- `config/settings.py:124` registers `apps.people`; `apps.py:8-9` loads signals.
- Media Library API does **not** expose faces or people. Its serializers have no face fields (`apps/media_library/serializers.py:77-113`).
- Media Library React components contain no references to People/faces (verified by search).
- `MediaFile` has `journal_entries` via journal provenance and a `summary` FK (`apps/media_library/models.py:44-53`), which could support a future person/journal timeline, but nothing uses that today.

**Status:** Detection integration exists; UI/API integration is largely absent.

**Limitations:**

- Media Library upload does not tell the user that faces were processed or that tagging is available.
- People “My photos” is a separate, read-only grid rather than an integrated library view.
- The HTML People upload bypasses the Media Library validation path.
- Documentation is stale: `README.md:152`, `README.md:227`, `frontend/src/features/people/README.md:5-8`, and `docs/API_CONTRACT.md:23` describe People as empty/proposed.

---

## 3. File-by-file implementation map

| File | Responsibility | Key symbols / notes |
|---|---|---|
| `apps/people/models.py` | Data model | `Person`, `DetectedFace`; owner FK; JSON encoding/bbox; `SET_NULL` person/suggestion |
| `apps/people/services.py` | Recognition pipeline | `SEUIL_SUGGESTION=0.6`, `detect_and_encode`, `crop_face`, `suggest_person`, `process_photo` |
| `apps/people/signals.py` | Lifecycle hooks | `process_new_media_file`, `delete_media_file`, `delete_face_crop_file` |
| `apps/people/views.py` | HTML views | Person CRUD, photo list/detail/upload/delete, face assign/confirm/delete |
| `apps/people/api_views.py` | REST views | People CRUD, person album, photo list/detail, face patch/delete/confirm |
| `apps/people/serializers.py` | API shapes/validation | `PersonSerializer`, `PersonBriefSerializer`, `DetectedFaceSerializer`, `PhotoSerializer`, `PhotoDetailSerializer` |
| `apps/people/urls.py` | HTML routes | `/people/...`; `app_name='people'` |
| `apps/people/api_urls.py` | API routes | `/api/people/...` |
| `apps/people/apps.py` | App config | `ready()` imports signals |
| `apps/people/admin.py` | Admin | Person/DetectedFace admin registration |
| `apps/people/tests.py` | Tests | Suggestion, signal, HTML isolation, API isolation |
| `apps/people/migrations/0001_initial.py` | Schema | Initial Person/DetectedFace tables |
| `templates/people/person_list.html` | HTML UI | Create/list people |
| `templates/people/person_detail.html` | HTML UI | Person album/delete |
| `templates/people/person_edit.html` | HTML UI | Rename/avatar |
| `templates/people/photo_list.html` | HTML UI | Upload/list/delete photos |
| `templates/people/photo_detail.html` | HTML UI | Faces, suggestion, assign/confirm/delete |
| `templates/base.html` | Shared HTML shell | Navigation to Personnes/Photos/Admin |
| `frontend/src/features/people/peopleApi.ts` | API client | All people calls; FormData for create/update |
| `frontend/src/features/people/types.ts` | Types | `Person`, `DetectedFace`, `AlbumPhoto`, etc. |
| `frontend/src/features/people/pages/PeoplePage.tsx` | React page | List/create/edit/delete people |
| `frontend/src/features/people/pages/MyPhotosPage.tsx` | React page | Read-only photo grid; directs upload to HTML |
| `frontend/src/features/people/pages/PhotoTaggingPage.tsx` | React page | Photo + face cards |
| `frontend/src/features/people/pages/PersonAlbumPage.tsx` | React page | Person album + inline edit |
| `frontend/src/features/people/components/FaceTaggingCard.tsx` | React component | Assign/confirm/delete face; distance display |
| `frontend/src/features/people/components/PersonForm.tsx` | React component | Name/avatar form |
| `frontend/src/features/people/components/PeopleNav.tsx` | React component | Breadcrumb/tabs |
| `frontend/src/app/router.tsx` | Shared routing | `/app/people`, `/app/people/photos`, `/app/people/:id` |
| `frontend/src/layouts/AppLayout.tsx` | Shared nav | “People” sidebar link already present |
| `apps/media_library/models.py` | Teammate module | `MediaFile`, UUID upload path; do not modify |
| `apps/media_library/serializers.py` | Teammate module | Upload validation/create; no face fields |
| `apps/media_library/views.py` | Teammate module | Media upload/generate/delete; triggers people signal |
| `config/urls.py`, `config/settings.py` | Shared config | Mounts, app registration, auth, media settings |
| `docs/API_CONTRACT.md`, `README.md`, `frontend/src/features/people/README.md` | Docs | Stale relative to implementation |

---

## 4. End-to-end workflow

### Actual implemented flow

```text
Upload (React Media Library) ──► MediaFileSerializer validation ──► MediaFile.save()
                                                                        │
Upload (HTML /people/photos/) ──► MediaFile.objects.create() ────────────┤
                                                                        ▼
                                                       post_save(MediaFile, created=True)
                                                                        │
                                                                        ▼
                                                        process_photo(media_file)
                                                                        │
                                      ┌─────────────────────────────────┴─────────────────────────────┐
                                      ▼                                                               ▼
                          detect_and_encode(path)                                          for each face:
                          • load full image                                                • DetectedFace.create(encoding,bbox)
                          • HOG face_locations                                             • suggest_person(...)
                          • face_encodings                                                • save suggested_person/distance
                                                                                           • crop_face(...) → face_crop.save()
                                                                        │
                                                                        ▼
                                                          DetectedFace rows in DB
                                                                        │
                            ┌───────────────────────────────────────────┴──────────────────────────────┐
                            ▼                                                                          ▼
              People → Mes photos (all MediaFile)                                    Person album (assigned faces)
              Photo tagging: crop, assign, confirm, delete                            Photo grid + crops
```

### Step by step

1. **Upload.** Two entry points exist: the React Media Library API (`POST /api/media/`) and the legacy HTML page (`POST /people/photos/`). AI-generated images also enter through the Media Library generation view.
2. **Media storage.** `MediaFile` stores the original under `users/<owner_id>/<YYYY>/<MM>/<uuid>.<ext>` via `media_upload_path` (`apps/media_library/models.py:9-12`). The HTML path uses the same field and storage.
3. **Detection trigger.** `post_save` on `MediaFile` runs only when `created=True` (`signals.py:15-25`). There is no separate “detect” button or API.
4. **Image load.** `process_photo` calls `detect_and_encode(media_file.file.path)` (`services.py:96`). This is synchronous and assumes a local path.
5. **Face detection.** `face_recognition.face_locations` finds faces; `face_encodings` computes 128-float vectors (`services.py:26-41`).
6. **Database insert.** Each face becomes a `DetectedFace` with JSON encoding and bounding box (`services.py:98-102`).
7. **Suggestion.** `suggest_person` scans all assigned faces of the same owner and stores the nearest person if distance ≤ 0.6 (`services.py:62-88`, `services.py:104-108`). This is a manual-assignment-dependent step: before any person is assigned, no suggestions exist.
8. **Crop.** `crop_face` crops the original image and saves `face_<media_id>_<index>.jpg` (`services.py:45-59`, `services.py:110-112`).
9. **Review in UI.** The user opens “Mes photos” or `/people/photos/`, selects a photo, sees face crops, the assigned person, the suggestion, and the raw distance, then confirms/assigns/deletes (`PhotoTaggingPage.tsx`, `FaceTaggingCard.tsx`, `photo_detail.html`).
10. **Album.** Assigned faces are grouped into a person album via `person_photos` (`api_views.py:58-83`) and `PersonAlbumPage.tsx`.

### Missing, manual, and disconnected steps

- **Missing:** clustering of unassigned faces; automatic person creation; duplicate-person merge; friends/co-occurrence; reprocessing; processing status/retry; background jobs; face overlay boxes; bulk actions; opt-in/opt-out; biometric purge.
- **Manual:** the first person must be created and faces assigned by hand. Suggestions only work after manual reference data exists.
- **Disconnected:**
  - Media Library upload does not expose or link to face tagging.
  - People “Mes photos” says upload is only via the HTML page, even though Media Library uploads also trigger detection.
  - The React People module does not have its own upload.
  - Docs still describe People as empty/proposed.
  - `bounding_box` is available but not rendered on the full photo.

---

## 5. Missing, incomplete, and potentially problematic functionality

### 5.1 Confirmed problems

**P1 — privacy and security**

1. **Automatic biometric processing without consent/opt-in.** Every `MediaFile` creation triggers face detection (`signals.py:15-25`). There is no user setting, consent record, or per-photo opt-out. This contradicts the project docs’ “opt-in” description (`docs/API_CONTRACT.md:661`, `docs/API_CONTRACT.md:700`).
2. **Media assets are unauthenticated in DEBUG.** `config/urls.py:45-46` serves `/media/` directly. Original photos use UUID names, but face crops are `face_<media_id>_<index>.jpg` (`services.py:111`) and avatars use the client filename under `people/avatars/` (`models.py:12`). These are guessable and not capability URLs. Anyone who can reach the dev server can enumerate face crops/avatars without logging in.
3. **Deleting a person does not delete biometric data.** `DetectedFace.person` is `SET_NULL` (`models.py:29-35`), so encodings, crops, and rows remain. The avatar file also remains. “Delete person” is not “delete face data.”
4. **HTML upload bypasses all image validation.** `views.py:70-76` calls `MediaFile.objects.create` directly, bypassing the 10 MB/40 MP/format checks in `media_library/serializers.py:119-159`. The same applies to HTML avatar uploads.
5. **No opt-out/purge endpoint.** Per-face deletion exists, but there is no bulk “delete all face data for this person/user,” no retention policy, and no consent record.

**P1 — correctness/data integrity**

6. **Synchronous full-resolution pipeline.** Detection and cropping run in the request thread. For Media Library uploads this happens inside the serializer’s atomic transaction. Large photos can make the upload slow or time out; no status or retry exists.
7. **No transaction or idempotency.** `process_photo` creates rows one by one without `transaction.atomic` (`services.py:91-112`). A crop failure leaves partial rows; a second run creates duplicates and extra crop files. There is no unique constraint on `(photo, bounding_box)`.
8. **Suggestions become stale.** They are calculated once at upload (`services.py:104-108`). Creating a person later, assigning a face, changing the threshold, or deleting a suggestion target does not rematch existing faces. Confirming one face does not rematch others in the same photo.
9. **Single-candidate matching with no rejection/confidence.** Only one best person is stored. There is no top-k, no margin, no reject action, and no confidence interpretation; the UI shows a raw Euclidean distance. Wrong confirmations are easy and hard to undo.
10. **Duplicate person profiles are possible.** `unique_together(owner, name)` is case-sensitive (`models.py:15-17`); “Alice” and “alice” coexist. There is no merge, no duplicate detection, and no alias. A user can also create a new profile instead of assigning an existing suggestion.
11. **Deletion cleanup is inconsistent.** Media file cleanup is duplicated in `signals.py:28-53` and `media_library/views.py:85-100`. Crop cleanup is unguarded (`signals.py:56-60`) and occurs before transaction commit. Avatar cleanup is missing entirely.
12. **Same person can be assigned to multiple faces in one photo** with no validation or warning. This is usually a tagging error but is silently allowed.

**P2 — performance and scalability**

13. **N+1 image decoding.** `detect_and_encode` loads the image once; `crop_face` reopens it for every face (`services.py:45-59`, `services.py:110-112`). An N-face photo is decoded N+1 times.
14. **O(F×N) matching and one query per face.** `suggest_person` queries all known faces for every detected face and loops in Python (`services.py:67-84`). This grows poorly with library size.
15. **No pagination.** People, photos, and albums are returned as full lists (`api_views.py:22-99`). Large collections will produce large payloads.
16. **Local-path assumption.** `media_file.file.path` (`services.py:96`, `services.py:110`) breaks on remote/object storage.
17. **No downscaling.** 40 MP images are allowed; HOG and cropping operate at full resolution.
18. **No processing status or retry.** A failed/unreadable image is indistinguishable from a no-face image. The signal logs and returns (`signals.py:21-25`). The user gets no error.
19. **No algorithm/model metadata.** Encodings have no model name/version; reprocessing or threshold changes cannot be reasoned about per face.

**P2 — edge cases and UX**

20. **No EXIF orientation handling.** The library loads pixels without EXIF transpose; crops may appear rotated compared with browser-displayed originals. Needs a real rotated-photo test.
21. **No face-size/quality filter.** Tiny or blurred faces can be detected, crop poorly, and produce weak suggestions.
22. **HTML duplicate create is silent** (`views.py:15-16`); the API returns a validation error.
23. **Avatar size/type validation is inconsistent** between HTML and API.
24. **Distance is shown without a suggestion** after a suggestion target is deleted, because `distance` is not cleared (`FaceTaggingCard.tsx:114-118`).
25. **Frontend/Media Library integration is missing.** No face count, person names, or “tag faces” action in the Media Library UI.
26. **The React read-only photo page tells users to upload through HTML**, which is confusing now that Media Library upload also triggers detection.
27. **Mixed French/English UI** and a stale module README.
28. **No bulk confirm/assign**, so tagging many faces is repetitive.
29. **No person photo count** on the People page, so users cannot see who is well represented.

### 5.2 Likely issues that need testing

- False-positive/false-negative rate at distance `0.6` on your actual photos; the threshold was not tuned with a dataset.
- Clustering threshold behavior for siblings, twins, children, and different lighting/poses.
- Profile faces missed by the default HOG detector.
- Memory/time on 40 MP images and large batches.
- EXIF-rotated JPEGs: bounding box/crop alignment.
- SQLite write contention while synchronous detection runs during uploads.
- Transaction-state problems if a database error is swallowed inside the upload’s outer atomic block.
- Cross-owner `suggested_person` via admin data, then `face_confirm`.
- Face-crop filename collisions if reprocessing is added.
- `media_library` tests becoming slower because they invoke the People signal unpatched.

### 5.3 Missing functionality, explicitly

- No `FaceGroup`, `Cluster`, `Merge`, or duplicate model/logic.
- No global unassigned-face list or suggestion inbox.
- No “Photos with friends.”
- No reprocess/rematch command or endpoint.
- No processing status (`pending/processing/failed/no_faces`) or retry.
- No background/queue processing.
- No configurable detector/encoding/threshold.
- No bounding-box overlay on the full photo.
- No bulk tagging.
- No auto-avatar or best-face selection.
- No consent/opt-out or biometric purge.
- No person timeline across journal entries.
- No face search by selfie.
- No pagination.
- No person counts/search/sort.

### 5.4 Test gaps

- No real pipeline test (detection → encoding → crop → suggestion).
- No `crop_face` test.
- No face-delete/crop-cleanup test.
- No person-delete/avatar-cleanup test.
- No duplicate-processing/idempotency test.
- No invalid encoding dimension or corrupt image test.
- No large-image/performance test.
- No API unauthenticated-request test.
- No frontend tests for PeoplePage, MyPhotosPage, PhotoTaggingPage, PersonAlbumPage, FaceTaggingCard, or PersonForm.
- The People tests patch away the very pipeline they are testing (`tests.py:18-21`).

### 5.5 Documentation drift

- `README.md:152` says `/api/people/` has no endpoints.
- `README.md:227` says the People module and face recognition are not implemented.
- `docs/API_CONTRACT.md:23` says People is an empty router; `docs/API_CONTRACT.md:655-677` still marks endpoints as proposed and describes an `identify-faces` endpoint that does not exist.
- `frontend/src/features/people/README.md:5-8` says “Shell only.”
- The actual API differs from the proposed contract: no `notes`, no `identify-faces`, no opt-in.

---

## 6. 10–15 proposed new features

**Already implemented, so not proposed below:** person create/list/edit/delete, avatar upload, automatic detection on upload, encoding/bounding-box/crop storage, single suggestion + confirm, manual assign/clear, per-face delete, person album (“all photos with this person”), user isolation, and the basic HTML/React pages.

### 1. Unknown-face inbox with similarity clusters

- **User problem:** After uploading many photos, every unassigned face is isolated inside a photo. The user must open photos one by one and cannot see “these six faces are the same unknown person.”
- **Expected behavior:** A new “Visages à identifier” page groups all `person IS NULL` faces by encoding similarity. Each group shows a representative crop, number of faces, number of photos, and “Nommer cette personne” / “Assigner à une personne existante.” Naming creates a `Person` and assigns all selected faces.
- **Integration:** Add `cluster_unknown_faces(owner)` in `services.py` using `numpy`/`face_distance`; add `GET /api/people/unassigned-faces/` and a bulk naming/assignment endpoint; reuse `PersonSerializer` and `FaceTaggingCard` patterns. Add a React page and a People nav tab.
- **Files:** `apps/people/services.py`, `api_views.py`, `api_urls.py`, `serializers.py`, `tests.py`; `frontend/src/features/people/pages/`, `components/`, `peopleApi.ts`, `types.ts`; shared `router.tsx` additive route.
- **Difficulty:** Medium.
- **Migration:** No for an on-demand MVP; Yes if you persist `FaceCluster` rows.
- **Dependencies:** Existing `numpy` and `face_recognition`; no paid API. Naive O(N²) clustering is fine for demo-scale libraries.
- **Privacy:** This computes biometric similarity over all unknown faces. Make it an explicit user action, owner-only, and never log encodings. Provide delete/reject actions.

### 2. Confidence-aware suggestions: top-3 candidates, score labels, reject

- **User problem:** The current UI shows one candidate and a raw distance. Users cannot tell whether a match is strong, weak, or ambiguous, and cannot reject a bad suggestion.
- **Expected behavior:** Show “strong / uncertain / weak” labels derived from distance, show up to three candidates, and offer “Ce n’est pas cette personne.” Rejection should remove the suggestion and optionally suppress it from returning.
- **Integration:** Add a `candidates` serializer/endpoint or compute in `suggest_person`; add `POST /api/people/faces/<id>/reject/`; update `FaceTaggingCard`. Do not present distance as a calibrated probability.
- **Files:** `services.py`, `api_views.py`, `api_urls.py`, `serializers.py`, `frontend/.../FaceTaggingCard.tsx`, `types.ts`, tests.
- **Difficulty:** Easy–Medium.
- **Migration:** No for top-k/labels; Yes if persistent rejection feedback is stored.
- **Dependencies:** Existing numpy/face_recognition; free.
- **Privacy:** Negative feedback is still biometric-adjacent; store only the minimum flags, not logs of encodings.

### 3. Merge duplicate people

- **User problem:** “Alice” and “alice” or two profiles for the same person split the album and weaken recognition.
- **Expected behavior:** From a person page, choose “Fusionner avec…”. Show counts of faces/photos that will move. Move all `person` and `suggested_person` references from source to target, choose an avatar, delete the source, and optionally merge aliases.
- **Integration:** Add `POST /api/people/<target>/merge/` and a service in `apps/people/services.py`; reassign `DetectedFace.person` and `DetectedFace.suggested_person`; handle name conflicts and source avatar cleanup.
- **Files:** `services.py`, `api_views.py`, `api_urls.py`, `serializers.py`, `frontend/.../PeoplePage.tsx`, new dialog, tests.
- **Difficulty:** Medium.
- **Migration:** No for a simple merge; Yes if you want an audit trail/aliases/`merged_into`.
- **Dependencies:** Pure ORM; free.
- **Privacy:** Irreversible if you simply delete the source; require confirmation with counts. Never allow merging across owners.

### 4. “Photos with friends” / co-occurrence view

- **User problem:** The album only answers “photos with Alice.” It cannot answer “photos where Alice and Bob appear together” or “who appears most often with Alice?”
- **Expected behavior:** On a person page, show co-occurring people with counts and a photo grid for selected pairs; e.g. “Alice + Bob — 4 photos.”
- **Integration:** Query assigned `DetectedFace` rows grouped by photo; add `GET /api/people/<pk>/friends/` or extend the album payload. Reuse `PersonAlbumPage`.
- **Files:** `services.py` or `api_views.py` query helper, `serializers.py`, `frontend/.../PersonAlbumPage.tsx`, tests.
- **Difficulty:** Easy–Medium.
- **Migration:** No.
- **Dependencies:** Pure ORM; free.
- **Privacy:** Co-occurrence reveals relationships; owner-only, no sharing/export, and no inference shown to other users.

### 5. Person co-occurrence insights

- **User problem:** Users may want a lightweight “people who often appear together” summary without opening every album.
- **Expected behavior:** A small dashboard on the People page: top pairs, most photographed people, unassigned-face count.
- **Integration:** Aggregate `DetectedFace` by photo/person; add a read-only endpoint; render cards.
- **Files:** `services.py`, `api_views.py`, `serializers.py`, `frontend/.../PeoplePage.tsx`, tests.
- **Difficulty:** Easy.
- **Migration:** No.
- **Dependencies:** ORM; free.
- **Privacy:** Aggregates are still sensitive; owner-only and no cross-user benchmarks.

### 6. Reprocess/rescan photos and threshold changes

- **User problem:** The algorithm/threshold is hard-coded; existing photos are never re-evaluated. After adding people or changing settings, old “unknown” faces stay unknown.
- **Expected behavior:** “Re-analyser cette photo” and “Re-analyser toutes mes photos.” The operation removes old detected faces/crops or updates them idempotently, then recomputes suggestions. A management command supports batch runs.
- **Integration:** Add a service `reanalyze_photo(media_file, replace=True)`; delete existing `DetectedFace` rows first and regenerate crops with deterministic names; add `POST /api/people/photos/<id>/reprocess/`; add `apps/people/management/commands/reprocess_faces.py`.
- **Files:** `services.py`, `api_views.py`, `api_urls.py`, new management command, tests.
- **Difficulty:** Medium.
- **Migration:** No for MVP; Yes if you add `processed_at`, `model_version`, or job status.
- **Dependencies:** Existing stack; free.
- **Privacy:** Re-reads biometric data; opt-in and owner-only. Ensure old crops/encodings are actually deleted.

### 7. Face-processing status and retry

- **User problem:** A failed detection looks identical to “no faces.” Users cannot tell whether a photo is still processing, failed, or genuinely has no faces.
- **Expected behavior:** Each photo/face shows `pending`, `processing`, `succeeded`, `no_faces`, or `failed`, with a retry action and a short error reason.
- **Integration:** Prefer a People-owned model such as `FaceProcessingJob` rather than adding fields to teammate-owned `MediaFile`. Update the signal to create/update the job; expose status through the photo serializer.
- **Files:** `models.py` + new migration, `services.py`, `signals.py`, `serializers.py`, `api_views.py`, frontend photo pages, tests.
- **Difficulty:** Medium.
- **Migration:** Yes if a job/status model is added.
- **Dependencies:** Django/DB only; free.
- **Privacy:** Status should not include biometric content or raw error dumps; log safely.

### 8. Background/batch processing and downscaling

- **User problem:** Large photos block the upload request; uploading a collection is slow and fragile.
- **Expected behavior:** Upload returns quickly; processing happens in a worker/queue; faces appear when ready. Detection runs on a downscaled copy and boxes are scaled back to original coordinates. Crops are generated from the already-decoded image.
- **Integration:** MVP without new infrastructure: a management command or a People-owned job table + polling. Production: Celery/RQ/django-q with Redis. Reuse `process_photo` after refactoring it to accept an image buffer and scale factor.
- **Files:** `services.py`, `signals.py`, `models.py` + migration, new management command/worker module, frontend polling, tests.
- **Difficulty:** Hard.
- **Migration:** Yes if a job model is used.
- **Dependencies:** Existing stack for the command-based MVP; Celery/RQ is free but adds infrastructure/ops cost. No paid API.
- **Privacy:** Longer-lived queued biometric jobs require secure storage, retention limits, and no encodings in logs/queue payloads.

### 9. Configurable recognition profile

- **User problem:** The 0.6 threshold and detector defaults may be too permissive or too strict for a user’s photos.
- **Expected behavior:** A settings panel or environment configuration for threshold, detector (`hog`/`cnn` where available), upsample count, and encoder model; changes can trigger a rematch.
- **Integration:** Add `apps/people/conf.py` reading env/settings with defaults; replace `SEUIL_SUGGESTION`; expose the active profile in the UI; add a “recalculate suggestions” action.
- **Files:** `services.py`, new `conf.py`, `serializers.py`/API, frontend settings or People page, tests.
- **Difficulty:** Easy–Medium.
- **Migration:** No if global/env; Yes if per-user preferences are stored.
- **Dependencies:** Existing face_recognition options; free.
- **Privacy:** A more permissive threshold increases false matches; show explanatory text and keep the user in control.

### 10. Bounding-box overlay and click-to-tag

- **User problem:** The UI shows detached crop cards; users cannot see exactly where each face is in the photo.
- **Expected behavior:** Draw numbered boxes over the full photo using the stored `bounding_box`; clicking a box scrolls/highlights the matching face card and vice versa.
- **Integration:** Use `bounding_box` already returned by `PhotoDetailSerializer`; compute percentage positions in React; no backend changes needed for the basic version.
- **Files:** `frontend/src/features/people/pages/PhotoTaggingPage.tsx`, `FaceTaggingCard.tsx`, `types.ts`, `people.css`; optionally HTML template.
- **Difficulty:** Medium (responsive coordinate math).
- **Migration:** No.
- **Dependencies:** React only; free.
- **Privacy:** Same owner-only photo; keep crops/boxes out of public views.

### 11. Bulk tagging and bulk confirm

- **User problem:** Tagging 20 faces one by one is repetitive.
- **Expected behavior:** Select multiple faces and assign the same person; “Confirm all high-confidence suggestions for this photo”; “Assign all faces in this cluster.”
- **Integration:** Add a batch endpoint accepting face IDs and a person ID; reuse existing ownership checks; add checkboxes to the tagging page.
- **Files:** `api_views.py`, `api_urls.py`, `services.py` or a transaction helper, `frontend/.../PhotoTaggingPage.tsx`, tests.
- **Difficulty:** Easy–Medium.
- **Migration:** No.
- **Dependencies:** ORM; free.
- **Privacy:** Bulk mistakes are costly; require confirmation and show the count. Never allow IDs from another owner.

### 12. Automatic avatar / best-face selection

- **User problem:** Person avatars are manual; users may not upload one, and the album has good crops available.
- **Expected behavior:** “Use this face as avatar” and an automatic best crop choice based on crop size/sharpness.
- **Integration:** Copy a face crop into `Person.avatar` (copy the file, do not share the same stored name), or choose the largest/highest-quality crop. Optionally add a “set cover” action.
- **Files:** `services.py`, `api_views.py`, `api_urls.py`, `frontend/.../FaceTaggingCard.tsx`/`PersonAlbumPage.tsx`, tests.
- **Difficulty:** Easy.
- **Migration:** No.
- **Dependencies:** Pillow/numpy already installed; free.
- **Privacy:** The avatar becomes a person image; deleting the person should delete the avatar. Avoid copying from another user’s face.

### 13. Privacy and data control: opt-in/out, purge, cleanup

- **User problem:** Users cannot decide whether faces are processed, cannot erase all biometric data for a person, and cannot see what remains after deletion.
- **Expected behavior:** A consent/opt-out setting; “Delete all facial data for this person”; “Delete all my facial data”; orphan/crop cleanup; clear explanation of what is stored.
- **Integration:** A People-owned `FaceRecognitionConsent`/settings model (migration) or a minimal preference stored in a People model; a purge endpoint that deletes `DetectedFace` rows/crops and avatar files while keeping `Person` profiles; a management command for orphan cleanup.
- **Files:** `models.py` + migration, `services.py`, `api_views.py`, `api_urls.py`, `signals.py`, new command, frontend privacy page, tests.
- **Difficulty:** Medium.
- **Migration:** Yes for consent/preferences; No for a purge endpoint alone.
- **Dependencies:** Django/storage; free.
- **Privacy:** This is the main privacy feature. Make opt-out respected by the signal before any encoding is created; never process after opt-out; ensure deletion is real, not just unlinking.

### 14. Person timeline in journal entries

- **User problem:** People are only connected to photos; the user cannot see “journal entries where Alice appears” or a person’s timeline across entries.
- **Expected behavior:** On a person page, show journal entries linked to photos where the person appears, with dates and titles.
- **Integration:** Traverse `DetectedFace → MediaFile → journal_entries` using the existing `MediaFile.journal_entries` relation (`apps/media_library/models.py:44-53`); no media_library changes needed.
- **Files:** `api_views.py` or a query helper in `services.py`, `serializers.py`, `frontend/.../PersonAlbumPage.tsx`, tests.
- **Difficulty:** Medium.
- **Migration:** No.
- **Dependencies:** Existing journal/media relations; free.
- **Privacy:** This connects biometric identity to personal journal text; strictly owner-only, never expose through a shared link or another user’s API.

### 15. Face search by selfie (advanced)

- **User problem:** A user may want to find their own photos or a person’s photos by uploading a face instead of browsing albums.
- **Expected behavior:** Upload a temporary probe photo, compute its encoding locally, compare against only the current user’s assigned faces, and show ranked matches. The probe is not stored by default.
- **Integration:** Add a `POST /api/people/search-by-face/` endpoint using the existing detector/encoder; return photo IDs and distances; add a React page. Do not reuse the normal upload pipeline/signal.
- **Files:** `services.py`, `api_views.py`, `api_urls.py`, `serializers.py`, new React page, tests.
- **Difficulty:** Hard.
- **Migration:** No if no search history is stored.
- **Dependencies:** Existing face_recognition/numpy; free. Local CPU cost only.
- **Privacy:** Highest-risk feature: a probe is biometric data. Make it explicit, local-only, non-persistent by default, owner-scoped, and never log embeddings.

---

## 7. Feature comparison and prioritization table

| Feature | Current status | User value | Difficulty | Migration needed | Cost |
|---|---|---|---|---|---|
| Unknown-face inbox with clusters | Missing | High | Medium | No for MVP; Yes if clusters persisted | Free; local CPU, O(N²) at first |
| Confidence/top-k/reject suggestions | Partial (single suggestion + confirm only) | High | Easy–Medium | No for top-k/labels; Yes for persistent rejection | Free; negligible |
| Merge duplicate people | Missing (rename exists) | High | Medium | No for simple merge; Yes for audit/aliases | Free; low |
| Photos with friends / co-occurrence | Missing (single-person album exists) | High | Easy–Medium | No | Free; low DB |
| Co-occurrence insights | Missing | Medium | Easy | No | Free; low |
| Reprocess/rescan photos | Missing | High | Medium | No for MVP; Yes for version/status | Free; high CPU |
| Processing status and retry | Missing | Medium–High | Medium | Yes if a People-owned job model is added | Free; low storage |
| Background/batch + downscale | Missing (synchronous, full-res) | High for collections | Hard | Yes if job model; plus infra | Free software; optional Redis/worker ops cost |
| Configurable recognition profile | Partial (hard-coded 0.6 and library defaults) | Medium | Easy–Medium | No for global/env; Yes for per-user | Free; low |
| Bounding-box overlay / click-to-tag | Partial (bbox stored/exposed; UI unused) | Medium | Medium | No | Free; frontend only |
| Bulk tagging / bulk confirm | Missing | Medium | Easy–Medium | No | Free; low |
| Automatic avatar / best-face selection | Missing | Low–Medium | Easy | No | Free; low |
| Privacy: opt-in/out, purge, cleanup | Partial (per-face delete; no opt-out/purge) | High | Medium | Yes for consent/preferences; No for purge only | Free; low |
| Person timeline in journal entries | Missing | Medium–High | Medium | No | Free; low |
| Face search by selfie | Missing | Medium (niche, high demo impact) | Hard | No if no history stored | Free; high CPU + privacy review |

---

## 8. Top three recommended features

### Recommendation 1 — Unknown-face inbox with clusters and one-click naming

**Why it wins**

- It is the most visible missing capability: upload several photos of the same unlabeled person and immediately see one group instead of scattered unknown faces.
- It turns the current cold-start problem into a demo strength. Today, suggestions cannot exist until someone manually creates a person and assigns a face.
- It reuses `DetectedFace.encoding` and `Person`; no changes to `media_library` models or APIs are required.
- An MVP can compute clusters on demand and require **no migration**. O(N²) comparison is acceptable for a demo-sized library.
- It stays local and free: `numpy` and `face_recognition` are already installed.

**Architecture fit**

- New service: `cluster_unknown_faces(owner)` in `apps/people/services.py`.
- New read endpoint: `GET /api/people/unassigned-faces/`.
- New bulk action: assign a cluster to an existing person, or create a person and assign all selected faces.
- New React page under `frontend/src/features/people/pages/`, plus a tab in `PeopleNav`.
- Reuse `PersonSerializer` and existing `PersonForm` patterns.

**Main risks**

- Clustering threshold tuning; naive clustering can over-merge or under-merge.
- O(N²) cost on large libraries; move to a persisted cluster/index later.
- Privacy: this is biometric grouping; make it explicit, owner-only, and allow immediate deletion.

**Acceptance/demo scenario**

Upload five photos of the same unlabeled person. The inbox shows one cluster with five faces/five photos. Name the cluster “Alice.” All five faces become assigned to Alice, her album populates, and the People page shows the new profile.

### Recommendation 2 — Merge duplicate people

**Why it wins**

- It solves a concrete data-quality problem that the current model permits: case-sensitive names allow duplicate profiles, and users can create a new person instead of assigning an existing one.
- It has a strong visual demo: two profiles merge into one album with all photos, suggestions, and faces moved.
- It is a natural companion to the unknown-face inbox: naming clusters will create new profiles, and some will be duplicates.
- A simple merge needs **no migration** and only ORM reassignment plus avatar handling.

**Architecture fit**

- `POST /api/people/<target>/merge/` with a source person ID.
- Service in `apps/people/services.py`:
  - Move `DetectedFace.person_id` and `DetectedFace.suggested_person_id` from source to target.
  - Reassign photos/album implicitly through those FKs.
  - Choose target avatar (or source avatar if target has none), copy/clean files safely.
  - Delete source person within a transaction.
- React dialog with face/photo counts and explicit confirmation.

**Dependencies / sequencing**

- Depends on nothing new; can ship before or after the inbox.
- If the inbox creates duplicate profiles, merge becomes the cleanup path, so implementing it early is safer.
- Confidence/reject suggestions are a small companion: merge fixes wrong profiles; reject prevents wrong associations.

**Main risks**

- Irreversible merge; require counts and confirmation.
- Name conflict: source and target names may collide; decide whether to keep target name, add an alias, or allow a new name.
- Avatar file cleanup and suggestion reassignment must be tested.
- Never merge across owners.

### Recommendation 3 — “Photos with friends” / co-occurrence view

**Why it wins**

- It is visually compelling and easy to understand: select Alice; see photos with Alice + Bob and counts.
- It requires no migration and no teammate-owned model changes.
- It reuses the existing assignment data and person album UI.
- It is a natural extension of the already-implemented “photos with Alice” album, so the UI investment is small.

**Architecture fit**

- Query assigned faces grouped by photo, then count distinct persons per photo; filter photos with at least two assigned people.
- New endpoint such as `GET /api/people/<pk>/friends/` or an extension to the existing album response.
- Extend `PersonAlbumPage.tsx` with a “Souvent ensemble” section and pair filters.
- No changes to `media_library`.

**Dependencies / sequencing**

- Depends on tagging coverage: the view is only as good as the assigned faces.
- It benefits directly from Recommendation 1 (more people get tagged) and Recommendation 2 (duplicate profiles no longer split albums).
- Implement after the first two, or ship a basic version early and improve it as tagging improves.

**Main risks**

- Sparse tags produce empty/partial results; show an empty state explaining that more tagging is needed.
- Co-occurrence can be sensitive; keep it strictly owner-only.
- Avoid duplicate counts for multiple faces of the same person in one photo; count distinct people per photo.

### Companion quick win — confidence and reject

Confidence labels, top-3 candidates, and a reject action are listed separately because they are not a new browsing workflow. They are a low-cost, high-value companion to Recommendations 1 and 2: they improve the quality of the assignments that the inbox and friends view depend on. I would schedule this immediately after the inbox or alongside it.

---

## 9. Suggested implementation plan (small phases)

No implementation should begin until you approve the scope. The phases below are designed to avoid touching teammate-owned `media_library` code.

### Phase 0 — Baseline, safety net, and performance guardrails

**Goal:** Make the existing pipeline testable and stable before adding features.

1. Add a realistic pipeline test strategy:
   - Use mocked `detect_and_encode` for deterministic unit tests of `process_photo`.
   - Add a no-face image test.
   - Add a manual QA checklist for real face images (do not commit sensitive photos).
2. Add tests for `crop_face`, face deletion/crop cleanup, and person deletion behavior.
3. Refactor `process_photo` into a reusable function that:
   - Accepts an already-loaded image or file path.
   - Uses a transaction or explicit cleanup on failure.
   - Can replace existing faces idempotently.
4. Add downscaling for detection and map boxes back to original coordinates; reuse the decoded image for crops.
5. Add a People-local configuration module (for example `apps/people/conf.py`) for the threshold, with a safe default of 0.6, without editing shared `config/settings.py` unless coordinated.
6. Add a `reprocess_faces` management command (dry-run first) under `apps/people/management/commands/`.
7. Decide whether to add a People-owned `FaceProcessingJob`/status model (migration in `apps/people` only) or defer status to Phase 4.

**Files:** `apps/people/services.py`, `signals.py`, `tests.py`, new `conf.py`, new management command, optional `models.py` + migration.

**No changes:** `apps/media_library/*`, `config/settings.py`, `config/urls.py`.

### Phase 1 — Unknown-face inbox (Recommendation 1)

**Goal:** Turn unassigned faces into named groups.

1. Implement `cluster_unknown_faces(owner, threshold)` using only the owner’s `person IS NULL` faces.
2. Implement grouping/ordering and representative crop selection.
3. Add API:
   - `GET /api/people/unassigned-faces/` returns clusters with face IDs, photo count, representative crop.
   - `POST /api/people/unassigned-faces/assign/` accepts face IDs + either `person` or a new `name`.
4. Add serializers and ownership validation.
5. Add React page, tab, and loading/empty/error states.
6. Add backend tests with synthetic 128-float encodings; no real biometric data needed.
7. Add privacy copy: “Only you can see these groups; deleting a face removes it from grouping.”

**Files:** `services.py`, `api_views.py`, `api_urls.py`, `serializers.py`, `tests.py`; frontend people pages/components/api/types; shared `router.tsx` additive route.

**Migration:** None for MVP.

### Phase 2 — Identity cleanup: merge, confidence, reject (Recommendation 2 + companion)

**Goal:** Make assignments trustworthy and duplicate profiles mergeable.

1. Add merge service and endpoint with transaction, counts, avatar choice, and ownership checks.
2. Add `POST /api/people/faces/<id>/reject/`; decide whether rejection is transient or persisted.
3. Add top-k candidates/confidence labels, either computed on demand or stored as JSON; do not call it a probability.
4. Update `FaceTaggingCard` and People/Person album UI.
5. Add tests for merge face counts, suggested-person reassignment, duplicate-name conflicts, cross-owner rejection, and reject behavior.
6. Optional migration: `suggestion_rejected_at`/feedback model or merge audit fields.

**Files:** `services.py`, `api_views.py`, `api_urls.py`, `serializers.py`, `models.py` + optional migration, frontend components/pages, tests.

**No changes:** `media_library`.

### Phase 3 — Photos with friends (Recommendation 3)

**Goal:** Add co-occurrence browsing.

1. Add an ORM query helper that counts distinct assigned people per photo.
2. Add `GET /api/people/<pk>/friends/` or extend the album response.
3. Add co-occurring people and pair photo grids to `PersonAlbumPage`.
4. Add tests for duplicate faces, empty tags, and user isolation.
5. Add an empty state that explains the view needs more tagging.

**Files:** `api_views.py` or `services.py`, `serializers.py`, frontend album page, tests.

**Migration:** None.

### Phase 4 — Reliability and scale

**Goal:** Handle failures, large libraries, and reprocessing.

1. Add processing status/retry using a People-owned model or derived state.
2. Add per-photo and all-photo reprocess endpoints, using the idempotent service from Phase 0.
3. Add a background worker option (management command + polling first; Celery/RQ later if needed).
4. Add pagination to people/photos/albums, coordinated with the team if using shared DRF settings.
5. Add threshold/profile configuration and a rematch action.
6. Add tests for corrupt files, no-face images, duplicate processing, and large-image handling.

**Migration:** Yes if a job/status model or user preferences are added.

### Phase 5 — Privacy and polish

**Goal:** Make face recognition user-controlled and complete the demo experience.

1. Add consent/opt-out and ensure the signal checks it before any processing.
2. Add “delete all facial data for this person” and “delete all my facial data.”
3. Clean orphaned avatar/crop files; delete old avatars on replacement.
4. Add bounding-box overlay and click-to-tag.
5. Add bulk tagging/bulk confirm.
6. Add automatic avatar/best-face selection.
7. Add optional journal timeline and selfie search only after privacy review.
8. Update README/docs to match reality; rebuild `frontend/dist` only through the normal build.

**Migration:** Yes for consent/preferences; optional for aliases/merge audit.

---

## 10. Files and modules that must remain untouched

### Must not be modified

- `apps/media_library/models.py`
- `apps/media_library/migrations/*`
- `apps/media_library/serializers.py`
- `apps/media_library/views.py`
- `apps/media_library/urls.py`
- `apps/media_library/comfyui.py`
- `apps/media_library/journal_context.py`
- `apps/media_library/tests.py`
- `apps/journal/**`, `apps/audio/**`, `apps/summaries/**`, `apps/accounts/**`
- `config/settings.py` — shared project settings. Prefer a People-local `apps/people/conf.py`; coordinate before adding anything here.
- `config/urls.py` — no change is needed if all new routes go under the existing `/api/people/` include.
- `frontend/src/features/media-library/**`
- `frontend/src/services/apiClient.ts`, `frontend/src/services/errors.ts`
- `frontend/src/components/**` shared components
- `templates/base.html` — shared HTML shell; avoid unless coordinated.
- `apps/people/migrations/0001_initial.py` — never edit an applied migration; add `0002+`.
- `db.sqlite3`, `media/**` — no direct edits; use application code and migrations.
- `requirements.txt` — do not change for the top three features; they use existing dependencies. A background worker phase may introduce a free dependency, but that should be a separate team decision.
- `.env` — do not change secrets/configuration without the user.
- `frontend/dist/**` — generated output; rebuild via the project’s normal build, do not hand-edit.

### Safe to edit (your module)

- `apps/people/models.py` (with new migrations only)
- `apps/people/services.py`
- `apps/people/signals.py`
- `apps/people/views.py`
- `apps/people/api_views.py`
- `apps/people/serializers.py`
- `apps/people/urls.py`
- `apps/people/api_urls.py`
- `apps/people/admin.py`
- `apps/people/tests.py`
- `templates/people/**`
- `frontend/src/features/people/**`
- New files under `apps/people/` such as `conf.py`, `management/commands/*`, and `migrations/0002_*`.

### Shared but minimally additive

- `frontend/src/app/router.tsx` — adding `/app/people/...` routes is necessary; keep the change additive and coordinate with the team.
- `frontend/src/layouts/AppLayout.tsx` — already has a People link; no change expected.
- `docs/README` — update only after implementation so the documentation matches behavior.

---

### Bottom line

Your module already proves the core concept: upload → detect → encode → crop → suggest → confirm → person album, with owner isolation and a functional UI. The next step with the highest demonstration value is the **unknown-face inbox with clustering**, followed by **merging duplicate people**, then **“Photos with friends.”** Before or alongside those, fix the privacy and reliability basics (opt-in/purge, unauthenticated media exposure, synchronous full-resolution processing, and idempotent reprocessing) so the demo does not depend on fragile or unsafe behavior.

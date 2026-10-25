# Implementation Plan: Journal Module (CRUD + Frontend)

This plan implements the complete Journal feature for MEMORA: a Django backend with full CRUD API endpoints and a React frontend with entry form, list view, and search functionality.

## Backend: Django Models & Serializers

### 1. Create Photo model stub in media_library
   - **What**: Define a minimal Photo model in apps/media_library/models.py with fields: id (BigAutoField PK, auto), user (ForeignKey to settings.AUTH_USER_MODEL with CASCADE), image (FileField).
   - **Why**: The JournalEntry model requires a ManyToMany relation to Photo (per task specification). Photo does not exist yet; define it minimally so the relation can be built now.
   - **Files to create/modify**:
     - `apps/media_library/models.py`
   - **Verify**: Run Django shell: `python manage.py shell` then `from apps.media_library.models import Photo; print(Photo._meta.fields)` and confirm Photo is importable and has the three fields.

### 2. Create JournalEntry model in journal app
   - **What**: Define the JournalEntry model with fields: id (BigAutoField PK, auto), title (CharField max_length=255), text (TextField), audio_file (CharField max_length=255, blank=True, default=''), summary_text (TextField, blank=True, default=''), sentiment (CharField max_length=20, blank=True, default=''), created_at (DateTimeField auto_now_add=True), user (ForeignKey to settings.AUTH_USER_MODEL with CASCADE), photos (ManyToMany to Photo, blank=True).
   - **Why**: Core data model for journal entries with all specified fields, user ownership (CASCADE delete), and optional photo relation.
   - **Files to create/modify**:
     - `apps/journal/models.py`
   - **Verify**: Run `python manage.py makemigrations journal` and confirm migration is created; run `python manage.py migrate` and confirm no errors.

### 3. Create JournalEntrySerializer in journal app
   - **What**: Add JournalEntrySerializer class in a new file `apps/journal/serializers.py`. Read-only fields: id, created_at, user (username). Writable fields: title, text, audio_file, sentiment, summary_text. photos as PrimaryKeyRelatedField(many=True, read_only=True). Use ModelSerializer pointing to JournalEntry model.
   - **Why**: REST serializer validates and represents journal entries in API responses, enforces read-only created_at and user (set by backend), and surfaces the photo PKs.
   - **Files to create/modify**:
     - `apps/journal/serializers.py` (new file)
   - **Verify**: Run Python shell: `from apps.journal.serializers import JournalEntrySerializer; print(JournalEntrySerializer().fields.keys())` and confirm all expected fields are present.

### 4. Create JournalEntryViewSet in journal app
   - **What**: In `apps/journal/views.py`, create JournalEntryViewSet using ModelViewSet, filtered to request.user entries. Add IsAuthenticated permission. Set queryset to JournalEntry.objects.all() and serializer_class to JournalEntrySerializer. Define perform_create to set user=request.user. Add PageNumberPagination locally (page_size=10). Add a custom search action (GET) that filters by title and created_at (date_from, date_to as optional query params) and returns paginated results. Use DRF's filter_queryset internally and apply Q objects for date range. Return Response with data and pagination info.
   - **Why**: Full CRUD with automatic user filtering, pagination at 10/page, and search capability as a dedicated extra action.
   - **Files to create/modify**:
     - `apps/journal/views.py`
   - **Verify**: Run `python manage.py test apps.journal` (even if tests are minimal); ensure no import errors by running `python manage.py shell` and importing the ViewSet: `from apps.journal.views import JournalEntryViewSet`.

### 5. Wire JournalEntryViewSet routes in urls.py
   - **What**: In `apps/journal/urls.py`, import DefaultRouter from rest_framework.routers and JournalEntryViewSet. Create router = DefaultRouter(), register JournalEntryViewSet at 'entries', include router.urls in urlpatterns.
   - **Why**: DRF router auto-generates CRUD routes and supports the custom search action as an extra action.
   - **Files to create/modify**:
     - `apps/journal/urls.py`
   - **Verify**: Run Django development server: `python manage.py runserver`, then in another terminal: `curl -H "X-Requested-With: XMLHttpRequest" http://localhost:8000/api/journal/entries/` and confirm a 403 (not authenticated) is returned, not a 404 (route missing).

### 6. Register models in admin.py
   - **What**: In `apps/journal/admin.py`, register JournalEntry with admin.site.register(JournalEntry, ModelAdmin) where ModelAdmin displays title, created_at, user in list_display. In `apps/media_library/admin.py`, register Photo similarly with display fields id, user, image.
   - **Why**: Allows staff to manage entries and photos via Django admin.
   - **Files to create/modify**:
     - `apps/journal/admin.py`
     - `apps/media_library/admin.py`
   - **Verify**: Navigate to `http://localhost:8000/admin` (log in as superuser), confirm JournalEntry and Photo appear in the admin sidebar.

---

## Frontend: Services & Components

### 7. Create journal service (frontend/src/services/journal.ts)
   - **What**: Export a journalApi object with methods: list(params: { page?: number }) → Promise<{ results: JournalEntry[], count: number, next?: string, previous?: string }>, retrieve(id: number) → Promise<JournalEntry>, create(data: CreateJournalEntryInput) → Promise<JournalEntry>, update(id: number, data: Partial<CreateJournalEntryInput>) → Promise<JournalEntry>, delete(id: number) → Promise<void>, search(query: string, dateFrom?: string, dateTo?: string, page?: number) → Promise<{ results: JournalEntry[], count: number, ... }>. Each method calls apiRequest('/api/journal/entries/...', ...). Define TypeScript interfaces JournalEntry and CreateJournalEntryInput in the same file or reference from a shared types file (follow the pattern from auth.ts).
   - **Why**: Centralized API client for the journal feature, decouples component logic from HTTP details, enables consistent error handling via apiRequest.
   - **Files to create/modify**:
     - `frontend/src/services/journal.ts` (new file)
   - **Verify**: Run TypeScript check: `npm run typecheck` and confirm no errors; import the service in a test script: `import { journalApi } from './services/journal'` and verify it compiles.

### 8. Create JournalEntry types file (frontend/src/types/journal.ts)
   - **What**: Define TypeScript interfaces: JournalEntry (id, title, text, audio_file, summary_text, sentiment, created_at, user, photos), CreateJournalEntryInput (title, text, audio_file?, summary_text?, sentiment?).
   - **Why**: Type-safe serialization and deserialization of API responses, IDE support, compile-time error detection.
   - **Files to create/modify**:
     - `frontend/src/types/journal.ts` (new file)
   - **Verify**: `npm run typecheck` passes.

### 9. Create JournalEntryForm component (frontend/src/features/journal/components/JournalEntryForm.tsx)
   - **What**: A form component (controlled inputs) for creating/editing a journal entry. Fields: title (text input), text (textarea), audio_file (text input, optional), sentiment (select dropdown: empty, positive, neutral, negative), summary_text (textarea, optional). Submit button calls props.onSubmit(data: CreateJournalEntryInput). Cancel button calls props.onCancel(). If props.initialValue is provided, pre-fill fields. Show validation errors from props.errors (map by field name). Use Alert component for field errors.
   - **Why**: Reusable form for create and edit workflows, handles user input validation feedback.
   - **Files to create/modify**:
     - `frontend/src/features/journal/components/JournalEntryForm.tsx` (new file)
   - **Verify**: `npm run typecheck` passes; render the component in Storybook or a test page and verify inputs appear.

### 10. Create JournalEntryList component (frontend/src/features/journal/components/JournalEntryList.tsx)
   - **What**: Display a paginated list of journal entries as cards or rows. Each entry shows: title, created_at (formatted), first 100 chars of text, edit and delete buttons. Pagination controls show current page and allow next/previous. Props: entries: JournalEntry[], page: number, pageCount: number, onPageChange(page: number), onEdit(id: number), onDelete(id: number), isLoading: boolean. Show a loading indicator or skeleton while isLoading=true.
   - **Why**: Displays fetched entries and provides UI for pagination and CRUD actions.
   - **Files to create/modify**:
     - `frontend/src/features/journal/components/JournalEntryList.tsx` (new file)
   - **Verify**: `npm run typecheck` passes.

### 11. Create JournalSearch component (frontend/src/features/journal/components/JournalSearch.tsx)
   - **What**: A search/filter form with: text query input, date_from input (type="date"), date_to input (type="date"), search button. Props: onSearch(query: string, dateFrom?: string, dateTo?: string), isLoading: boolean. Search button disabled while isLoading=true.
   - **Why**: Allows users to search entries by title and date range, calls the search endpoint via props.onSearch.
   - **Files to create/modify**:
     - `frontend/src/features/journal/components/JournalSearch.tsx` (new file)
   - **Verify**: `npm run typecheck` passes.

### 12. Replace JournalListPage with full implementation
   - **What**: In `frontend/src/features/journal/pages/JournalListPage.tsx`, replace ModulePlaceholder with: state (entries, page, pageCount, loading, errors), hooks (useEffect to load entries on mount, useCallback for pagination), render PageHeader with title "Journal", JournalSearch, JournalEntryList, and JournalEntryForm in a modal or inline (initially hidden, show on "New Entry" button). On form submit, call journalApi.create(), refresh list, close form, show success Alert. On delete, confirm, call journalApi.delete(), refresh list. Handle ApiError via normalizeApiError() and display field/form errors via Alert. Use the existing apiRequest error handling pattern.
   - **Why**: Brings all components together into a cohesive page with full CRUD workflow.
   - **Files to create/modify**:
     - `frontend/src/features/journal/pages/JournalListPage.tsx`
   - **Verify**: `npm run typecheck` passes; start the dev server (`npm run dev` from frontend/) and navigate to /journal, confirm page loads without console errors, mock auth is working, and UI renders.

---

## Integration & Verification

### 13. Backend integration test
   - **What**: Run the full test suite (if tests are set up) or manually verify via curl/Postman: (1) ensure session/auth works (GET /api/accounts/me/), (2) create a journal entry (POST /api/journal/entries/ with title+text), (3) fetch entries (GET /api/journal/entries/), (4) search entries (GET /api/journal/entries/search/?q=title&date_from=2024-01-01), (5) update an entry (PATCH /api/journal/entries/{id}/), (6) delete an entry (DELETE /api/journal/entries/{id}/).
   - **Why**: Ensures backend CRUD is fully functional before frontend integration.
   - **Files to create/modify**: None (verification only).
   - **Verify**: All HTTP requests return 2xx status and correct data shape.

### 14. Frontend integration test
   - **What**: Start both dev servers (Django at 8000, React at 3000). Log in via the auth UI. Navigate to /journal. Create an entry (fill form, submit). Confirm entry appears in list. Edit entry, confirm changes persist. Delete entry, confirm it disappears. Search for entries by title, confirm results filter correctly.
   - **Why**: End-to-end verification that frontend and backend work together.
   - **Files to create/modify**: None (verification only).
   - **Verify**: All user workflows complete without console errors; network tab shows correct API calls.

---

## Notes

- **Photo Model**: Currently a stub (minimal). A future iteration will add photo upload, gallery, and advanced media management.
- **Audio File**: stored as a CharField for now; future iterations may upload to storage backend.
- **Sentiment**: currently a freeform CharField; could be enriched with NLP tagging or predefined choices.
- **Search**: basic title + date range; could be extended with full-text search or tag filtering.
- **Frontend State Management**: using React hooks (useState, useEffect, useCallback); no Redux or other state library needed at this scale.
- **Styling**: assuming existing CSS in frontend/src/styles/ covers layout; component styling via class names (page-header, alert, etc.) following established patterns.


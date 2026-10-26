# Advanced Search Frontend Integration Plan

## Overview
Integrate the existing AI-powered advanced search backend endpoint (`/api/journal/entries/advanced-search/`) into the frontend UI. The task is purely frontend-side: link the journal list page to the dedicated advanced search page and ensure a seamless search experience.

### Current State
- **Backend route exists:** POST `/api/journal/entries/advanced-search/` accepts `{ query, date_from, date_to, sentiment, use_ai }` and returns `{ results, total, ai_analysis }`.
- **Frontend services exist:** `advancedSearch.ts` defines request/response types and exposes `advancedSearchApi.search()`.
- **Frontend components exist:** `AdvancedSearchForm.tsx` (search UI), `AdvancedSearchResults.tsx` (results display), `AdvancedSearchPage.tsx` (dedicated page at `/app/journal/search`).
- **CSS exists:** `journal.css` already has all required classes (`.ai-analysis-summary`, `.sentiment-tag`, `.theme-tag`, etc.).
- **Types defined:** `AdvancedSearchRequest` and `AdvancedSearchResponse` in `advancedSearch.ts`; `JournalEntry` in `journal.ts`.

### Task
Add a visible link from the journal list page to the advanced search page so users can discover and access the feature.

---

## Implementation Plan

- [ ] 1. Add a link/button in JournalListPage to navigate to the Advanced Search page.
      The journal list page currently has only basic search. Add a "Advanced Search" button in the PageHeader or near the existing JournalSearch component to let users navigate to `/app/journal/search` where the full AdvancedSearchPage is available.
      Files: `frontend/src/features/journal/pages/JournalListPage.tsx`
      Verify: Compile with `cd "c:\Users\Haider\Documents\MEMORA\MEMORA_5_BYTES/frontend" && npm run typecheck` — should pass with no errors.

- [ ] 2. Ensure AdvancedSearchPage is accessible and renders correctly.
      The AdvancedSearchPage already exists and is routed at `/app/journal/search`. Verify that the component imports are correct, the form and results components are properly wired, and no TypeScript errors exist.
      Files: `frontend/src/features/journal/pages/AdvancedSearchPage.tsx` (review only, no changes needed unless import errors found)
      Verify: Navigate to `http://localhost:3000/app/journal/search` in the browser (after dev server is running) and confirm the Advanced Search page loads with the search form and an empty results area.

- [ ] 3. (Optional) Add a subtle UI indicator in JournalListPage showing that advanced search is available.
      If desired, add a small note or hint near the basic search form suggesting the Advanced Search feature (e.g., "Looking for more powerful search? Try Advanced Search with AI analysis.").
      Files: `frontend/src/features/journal/pages/JournalListPage.tsx`
      Verify: Compile with TypeScript check; no errors.

---

## Verification Checklist
1. Run `cd c:\Users\Haider\Documents\MEMORA\MEMORA_5_BYTES/frontend && npm run typecheck` — all changes pass TypeScript strict mode.
2. Start the dev server: `npm run dev` from the frontend directory.
3. Navigate to `http://localhost:3000/app/journal` — confirm journal list page loads with the new link/button visible.
4. Click the Advanced Search link/button — confirm navigation to `http://localhost:3000/app/journal/search` and the search page renders.
5. In the Advanced Search page, enter a search query, optionally select a sentiment, toggle "Use AI Analysis", and click Search — confirm results render with AI analysis (if enabled) and entry cards.
6. Verify no console errors in browser DevTools.

---

## Notes
- **No backend changes needed:** The endpoint already exists and is working.
- **No new types needed:** `AdvancedSearchRequest` and `AdvancedSearchResponse` are already defined.
- **No new components needed:** `AdvancedSearchForm`, `AdvancedSearchResults`, and `AdvancedSearchPage` are already implemented and functional.
- **CSS reuse:** All styling is already in place; no new CSS classes required.
- **User message context:** The user reported not finding the Advanced Search feature on the journal page. This plan makes the feature discoverable by adding a clear navigation link.

---

## Task Summary
This is a minimal, user-experience focused task: make the existing advanced search feature visible and accessible from the journal list page by adding a navigation link. The bulk of the functionality already exists and works correctly.

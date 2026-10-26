# AI-powered advanced search for journal entries

Adds semantic search to the journal with optional sentiment filtering and AI-powered analysis. The implementation introduces two parallel search paths: basic search (GET /search/) for simple queries by title and date range, and advanced search (POST /advanced-search/) when sentiment filters or AI analysis are requested. The UI layers sentiment selection and an AI toggle onto the existing search form without disrupting baseline functionality.

**Watch for:** Verify that sentiment values ("happy", "sad", "calm", "stressed", "neutral") match the backend enum. Confirm that the advanced-search endpoint is wired and returns the AdvancedSearchResult shape with results array and optional ai_analysis. Test both search paths to ensure the router picks the right endpoint.

**Verdict**: APPROVED

## High-level view

The search component now conditionally routes to one of two API endpoints depending on whether sentiment or AI analysis is active. If neither is set, a basic GET request hits /search/ with q, date_from, date_to as query params (unchanged from baseline). Once sentiment or use_ai becomes true, the component assembles an AdvancedSearchParams object and POSTs to /advanced-search/, shifting the request shape entirely. The component tracks this fork via an isAdvanced flag to distinguish the two param types at the call site.

The list page checks for ai_analysis content before rendering the AdvancedSearchAnalysis component, preventing render of an empty analysis block and keeping the UI clean when AI analysis doesn't apply. The analysis component extracts themes, sentiments, and summary text from the response and maps them into tagged visual elements (theme-tag, sentiment-tag classes).

CSS extends the existing design system by introducing new layout classes (.ai-analysis-summary, .analysis-details, .tags, .tag, etc.) all anchored to CSS variables for colors, spacing, and radius. The search form now includes a sentiment select and checkbox for the AI toggle, both styled consistently with the form field pattern.

TypeScript types split JournalSearchParams and AdvancedSearchParams into separate interfaces to prevent field confusion—basic search uses q, advanced uses query. The isAdvanced flag serves as a discriminator during the parameter fork in JournalListPage.

## Issues (3)

1. **Sentiment enum mismatch risk** — The hardcoded sentiment values in JournalSearch ("happy", "sad", "calm", "stressed", "neutral") must match the backend's accepted sentiment list. If the backend uses different values or accepts a superset, validation will fail silently or the server will reject requests with 400 Bad Request.

2. **Type-unsafe parameter discrimination** — The isAdvanced flag in AdvancedSearchParams is a workaround. TypeScript already provides a better pattern (discriminated unions), and checking for the presence of "isAdvanced" is fragile if the object is manipulated or logged.

3. **Missing analysis content check edge case** — AdvancedSearchAnalysis only renders if analysis exists and has content, but the condition `!analysis.summary && !analysis.extracted_themes.length && !analysis.extracted_sentiments.length` returns null silently. If a user enables AI but the response includes an empty analysis object (e.g., `{summary: "", extracted_themes: [], extracted_sentiments: []}`), the component renders nothing without indication that AI was requested but returned no results.

<details>
<summary>Details</summary>

### Parameter routing logic

JournalListPage detects advanced search by checking `searchParams.isAdvanced === true`. If true, it calls `journalApi.advancedSearch(params)` with AdvancedSearchParams; otherwise, it calls `journalApi.search(params)` with JournalSearchParams. The fork is clean—no fallthrough between paths—and the two endpoints are treated as separate concerns. The AdvancedSearchResult wraps JournalEntry results in a containing object and adds optional ai_analysis, allowing the page to consume results uniformly through a fake JournalPage shape constructed on the fly.

The routing decision happens in JournalSearch.handleSubmit: if sentiment or useAi is truthy, the component sets isAdvanced: true and uses "query" instead of "q". This creates asymmetry in the param names (query vs q), which is intentional (backend contract) but easy to miss during refactoring. The decision is correct—basic GET /search/ queries accept "q"; POST /advanced-search/ likely expects "query" by convention.

### Search form accessibility

The sentiment select has a default option "Any sentiment" with empty string value, preventing accidental selection of "happy" on first render. The checkbox for AI analysis has an associated label via htmlFor="use-ai", and the input has id="use-ai", meeting WCAG label-association requirements. All form fields are wrapped in FormField which handles label-input pairing.

Focus management is applied to the select via CSS `:focus` rule (border-color var(--primary), box-shadow var(--focus-ring)), consistent with other input patterns in the codebase. The checkbox uses the browser's native styling with accent-color: var(--primary), keeping it tied to the design system without custom rendering.

### CSS variable compliance

The CSS file uses only design system variables: --space-*, --border, --primary, --text, --surface, --text-muted, --radius-*, --transition, --shadow-*, --font-*, --text-xs/sm/base/lg/xl. No hardcoded colors or pixel values appear in the new rules (.ai-analysis-summary, .analysis-*, .search-select, .search-toggle). The gradient in .ai-analysis-summary uses var(--primary-soft) and var(--surface), which should exist in the design system (unconfirmed). Media query breakpoints (max-width: 900px, 640px) are hardcoded, following the pattern in existing CSS.

### AI analysis rendering

AdvancedSearchAnalysis receives an AiAnalysis object with summary, extracted_themes, extracted_sentiments. It renders each non-empty field as a tagged list. Themes use the .theme-tag class, sentiments use .sentiment-tag. If all three are empty, the component returns null, preventing a hollow box from appearing on the page. This is the correct defensive pattern—prefer no render to an empty placeholder.

The analysis component is only mounted when `advancedResult?.ai_analysis` is truthy, adding a second guard in JournalListPage. This double-checks alignment, but creates a subtle contract: the component must trust that AiAnalysis is shaped correctly if passed. No validation of AiAnalysis structure occurs in the component—it assumes extracted_themes and extracted_sentiments are always arrays. If the backend returns null or undefined for these fields, the component will error on .length or .map(). This risk is low if the backend enforces the contract, but undefended.

### Entry list display after advanced search

JournalEntryList receives results from advancedResult.results (when advanced search is active) via the fake JournalPage object. The list displays entries identically to baseline pagination. No special handling of advanced-search results occurs—they are presented as regular journal entries with no indication they came from a filtered search. This is intentional and correct.

### State reset on save/delete

handleSave and handleDelete both reset searchParams to {}, clearing the active search and returning the page to the full list. This is a reasonable UX choice—after saving or deleting an entry, show the full list rather than re-running the old search against stale state. The trade-off is that a user cannot see how their new entry ranks in the search results they just performed.

### Potential debug log

No console.log or debug statements found in the modified code. All state changes are traced via React DevTools or network inspector.

### Type definitions coverage

AdvancedSearchParams includes query, date_from, date_to, sentiment, use_ai, isAdvanced. These match the fields used in JournalSearch (q → query mapping is handled in handleSubmit). The isAdvanced flag is additional (not sent to the backend) and used only for routing logic. JournalSearchParams includes q, date_from, date_to, page—unchanged from baseline.

</details>

## File map

<details>
<summary>Files changed</summary>

- **journal.ts** — Added advancedSearch() method calling POST /advanced-search/. buildSearchUrl() unchanged.
- **journal.tsx** (types) — Added AdvancedSearchParams, AiAnalysis, AdvancedSearchResult interfaces.
- **JournalSearch.tsx** — Added sentiment select and use_ai checkbox; conditional routing in handleSubmit between basic and advanced params.
- **AdvancedSearchAnalysis.tsx** (new) — Renders ai_analysis from advanced search results, displaying themes and sentiments as tags.
- **JournalListPage.tsx** — Added search path detection and call to advancedSearch() when isAdvanced flag is set; conditional render of AdvancedSearchAnalysis.
- **journal.css** — Added .ai-analysis-summary, .analysis-*, .search-select, .search-toggle, and related tag styling.

Full diff: `git diff main`

</details>

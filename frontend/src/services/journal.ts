import type { JournalEntry, JournalEntryInput, JournalPage, JournalSearchParams, AdvancedSearchParams, AdvancedSearchResult } from '../types/journal'
import { apiRequest } from './apiClient'

const BASE = '/api/journal/entries/'
const PICKER_PAGE_SIZE = 100

function buildListUrl(page: number, pageSize?: number): string {
  const qs = new URLSearchParams({ page: String(page) })
  if (pageSize) qs.set('page_size', String(pageSize))
  return `${BASE}?${qs.toString()}`
}

function buildSearchUrl(params: JournalSearchParams): string {
  const qs = new URLSearchParams()
  if (params.q) qs.set('q', params.q)
  if (params.date_from) qs.set('date_from', params.date_from)
  if (params.date_to) qs.set('date_to', params.date_to)
  if (params.page) qs.set('page', String(params.page))
  const str = qs.toString()
  return str ? `${BASE}search/?${str}` : `${BASE}search/`
}

/** Loads every page of the caller's journal entries (100 per request). */
async function listAllEntries(): Promise<JournalEntry[]> {
  const entries: JournalEntry[] = []
  for (let page = 1; ; page += 1) {
    const data = await journalApi.list(page, PICKER_PAGE_SIZE)
    entries.push(...data.results)
    if (!data.next) {
      return entries
    }
  }
}

export const journalApi = {
  list: (page = 1, pageSize?: number) =>
    apiRequest<JournalPage>(buildListUrl(page, pageSize)),

  get: (id: number) =>
    apiRequest<JournalEntry>(`${BASE}${id}/`),

  create: (data: JournalEntryInput) =>
    apiRequest<JournalEntry>(BASE, { method: 'POST', body: data }),

  update: (id: number, data: JournalEntryInput) =>
    apiRequest<JournalEntry>(`${BASE}${id}/`, { method: 'PUT', body: data }),

  remove: (id: number) =>
    apiRequest<void>(`${BASE}${id}/`, { method: 'DELETE' }),

  search: (params: JournalSearchParams) =>
    apiRequest<JournalPage>(buildSearchUrl(params)),

  advancedSearch: (params: AdvancedSearchParams) =>
    apiRequest<AdvancedSearchResult>(`${BASE}advanced-search/`, { method: 'POST', body: params }),
}

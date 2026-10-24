import type { JournalEntry, JournalEntryInput, JournalPage, JournalSearchParams } from '../types/journal'
import { apiRequest } from './apiClient'

const BASE = '/api/journal/entries/'

function buildSearchUrl(params: JournalSearchParams): string {
  const qs = new URLSearchParams()
  if (params.q) qs.set('q', params.q)
  if (params.date_from) qs.set('date_from', params.date_from)
  if (params.date_to) qs.set('date_to', params.date_to)
  if (params.page) qs.set('page', String(params.page))
  const str = qs.toString()
  return str ? `${BASE}search/?${str}` : `${BASE}search/`
}

export const journalApi = {
  list: (page = 1) =>
    apiRequest<JournalPage>(`${BASE}?page=${page}`),

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
}

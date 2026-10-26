import { useState } from 'react'

import type { JournalSearchParams } from '../../../types/journal'
import { Button } from '../../../components/Button'
import { FormField } from '../../../components/FormField'
import { Icon } from '../../../components/Icon'
import { TextInput } from '../../../components/TextInput'

export interface JournalSearchProps {
  onSearch: (params: JournalSearchParams) => void
  isLoading?: boolean
}

export function JournalSearch({ onSearch, isLoading = false }: JournalSearchProps) {
  const [q, setQ] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSearch({
      q: q || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    })
  }

  const handleClear = () => {
    setQ('')
    setDateFrom('')
    setDateTo('')
    onSearch({})
  }

  return (
    <form onSubmit={handleSubmit} className="journal-search" role="search">
      <div className="journal-search__head">
        <span className="journal-search__icon" aria-hidden="true">
          <Icon name="search" size={18} />
        </span>
        <div>
          <h2 className="journal-search__title">Find a page</h2>
          <p className="journal-search__hint">Search by title, or widen the dates.</p>
        </div>
      </div>

      <div className="search-fields">
        <FormField label="Search by title">
          {(field) => (
            <TextInput
              {...field}
              name="q"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              disabled={isLoading}
              placeholder="Journal entry title…"
            />
          )}
        </FormField>

        <FormField label="From date (optional)">
          {(field) => (
            <TextInput
              {...field}
              name="date_from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              disabled={isLoading}
            />
          )}
        </FormField>

        <FormField label="To date (optional)">
          {(field) => (
            <TextInput
              {...field}
              name="date_to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              disabled={isLoading}
            />
          )}
        </FormField>
      </div>

      <div className="search-actions">
        <Button type="submit" size="sm" disabled={isLoading}>
          <Icon name="search" size={15} />
          {isLoading ? 'Searching…' : 'Search'}
        </Button>
        <Button type="button" onClick={handleClear} disabled={isLoading} variant="secondary" size="sm">
          Clear
        </Button>
      </div>
    </form>
  )
}

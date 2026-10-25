import { useState } from 'react'
import type { JournalSearchParams } from '../../../types/journal'
import { Button } from '../../../components/Button'
import { FormField } from '../../../components/FormField'
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
    <form onSubmit={handleSubmit} className="journal-search">
      <div className="search-fields">
        <FormField label="Search by title">
          {(field) => (
            <TextInput
              {...field}
              name="q"
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              disabled={isLoading}
              placeholder="Journal entry title..."
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
        <Button type="submit" disabled={isLoading}>
          Search
        </Button>
        <Button type="button" onClick={handleClear} disabled={isLoading} variant="secondary">
          Clear
        </Button>
      </div>
    </form>
  )
}

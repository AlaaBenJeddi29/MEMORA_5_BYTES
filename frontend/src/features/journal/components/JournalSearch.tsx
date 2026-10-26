import { useState } from 'react'
import type { JournalSearchParams, AdvancedSearchParams } from '../../../types/journal'
import { Button } from '../../../components/Button'
import { FormField } from '../../../components/FormField'
import { TextInput } from '../../../components/TextInput'

export interface JournalSearchProps {
  onSearch: (params: JournalSearchParams | AdvancedSearchParams) => void
  isLoading?: boolean
}

export function JournalSearch({ onSearch, isLoading = false }: JournalSearchProps) {
  const [q, setQ] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sentiment, setSentiment] = useState('')
  const [useAi, setUseAi] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (sentiment || useAi) {
      onSearch({
        query: q || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        sentiment: sentiment || undefined,
        use_ai: useAi,
        isAdvanced: true,
      })
    } else {
      onSearch({
        q: q || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      })
    }
  }

  const handleClear = () => {
    setQ('')
    setDateFrom('')
    setDateTo('')
    setSentiment('')
    setUseAi(false)
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

        <FormField label="Sentiment (optional)">
          {(field) => (
            <select
              {...field}
              className="search-select"
              name="sentiment"
              value={sentiment}
              onChange={(e) => setSentiment(e.target.value)}
              disabled={isLoading}
            >
              <option value="">Any sentiment</option>
              <option value="happy">Happy</option>
              <option value="sad">Sad</option>
              <option value="calm">Calm</option>
              <option value="stressed">Stressed</option>
              <option value="neutral">Neutral</option>
            </select>
          )}
        </FormField>
      </div>

      <div className="search-toggle">
        <input
          type="checkbox"
          id="use-ai"
          name="use_ai"
          checked={useAi}
          onChange={(e) => setUseAi(e.target.checked)}
          disabled={isLoading}
        />
        <label htmlFor="use-ai">AI Analysis</label>
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

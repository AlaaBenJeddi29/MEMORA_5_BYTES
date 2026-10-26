import { useState } from 'react'
import { Button } from '../../../components/Button'
import { FormField } from '../../../components/FormField'
import { TextInput } from '../../../components/TextInput'
import type { AdvancedSearchRequest } from '../../../services/advancedSearch'

export interface AdvancedSearchFormProps {
  onSearch: (params: AdvancedSearchRequest) => void
  isLoading?: boolean
}

const SENTIMENT_OPTIONS = ['', 'happy', 'sad', 'calm', 'stressed', 'excited', 'neutral']

export function AdvancedSearchForm({ onSearch, isLoading = false }: AdvancedSearchFormProps) {
  const [query, setQuery] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sentiment, setSentiment] = useState('')
  const [useAI, setUseAI] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!query.trim()) {
      alert('Please enter a search query')
      return
    }

    onSearch({
      query: query.trim(),
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      sentiment: sentiment || undefined,
      use_ai: useAI,
    })
  }

  const handleClear = () => {
    setQuery('')
    setDateFrom('')
    setDateTo('')
    setSentiment('')
    setUseAI(false)
  }

  return (
    <form onSubmit={handleSubmit} className="advanced-search-form">
      <div className="search-header">
        <h3>Advanced Search</h3>
        <p className="search-subtitle">Find your memories with AI-powered search</p>
      </div>

      <FormField label="Search Query" required>
        {(field) => (
          <TextInput
            {...field}
            name="query"
            placeholder="e.g., happy beach summer, work stress meeting..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={isLoading}
          />
        )}
      </FormField>

      <div className="search-filters">
        <FormField label="From Date (optional)">
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

        <FormField label="To Date (optional)">
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
              name="sentiment"
              value={sentiment}
              onChange={(e) => setSentiment(e.target.value)}
              disabled={isLoading}
              style={{
                padding: 'var(--space-2) var(--space-3)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                fontFamily: 'var(--font-sans)',
                fontSize: 'var(--text-base)',
              }}
            >
              {SENTIMENT_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt ? opt.charAt(0).toUpperCase() + opt.slice(1) : 'All sentiments'}
                </option>
              ))}
            </select>
          )}
        </FormField>
      </div>

      <div className="search-options">
        <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <input
            type="checkbox"
            checked={useAI}
            onChange={(e) => setUseAI(e.target.checked)}
            disabled={isLoading}
          />
          <span>🤖 Use AI Analysis</span>
        </label>
        {useAI && (
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            AI will analyze your query to find related memories with better context matching
          </p>
        )}
      </div>

      <div className="search-actions">
        <Button type="submit" disabled={isLoading}>
          {isLoading ? '🔍 Searching...' : '🔍 Search'}
        </Button>
        <Button type="button" onClick={handleClear} disabled={isLoading} variant="secondary">
          Clear
        </Button>
      </div>
    </form>
  )
}

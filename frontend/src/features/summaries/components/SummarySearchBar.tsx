import { useRef, type FormEvent } from 'react'

import { Button } from '../../../components/Button'
import { FormField } from '../../../components/FormField'
import { TextInput } from '../../../components/TextInput'

/** Mirrors the backend query limit (apps/summaries/search.py). */
export const MAX_SEARCH_QUERY_LENGTH = 200

export interface SummarySearchBarProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onClear: () => void
  isLoading: boolean
  /** Keeps Clear available after a query was submitted. */
  hasActiveSearch: boolean
}

/**
 * Concept search for summaries. The form submits on Enter and from its button;
 * the query itself is sent to Django, never filtered in the browser.
 */
export function SummarySearchBar({
  value,
  onChange,
  onSubmit,
  onClear,
  isLoading,
  hasActiveSearch,
}: SummarySearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isLoading || !value.trim()) {
      return
    }
    onSubmit()
  }

  function handleClear() {
    onClear()
    inputRef.current?.focus()
  }

  return (
    <form
      className="summary-search"
      role="search"
      aria-label="Rechercher dans vos souvenirs"
      aria-busy={isLoading}
      onSubmit={handleSubmit}
    >
      <FormField label="Recherche dans vos souvenirs">
        {(field) => (
          <div className="summary-search__input">
            <svg
              className="summary-search__icon"
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <TextInput
              {...field}
              ref={inputRef}
              name="q"
              type="search"
              value={value}
              maxLength={MAX_SEARCH_QUERY_LENGTH}
              autoComplete="off"
              placeholder="Les moments où je me sentais fier…"
              onChange={(event) => onChange(event.target.value)}
            />
          </div>
        )}
      </FormField>

      <div className="summary-search__actions">
        <Button type="submit" disabled={isLoading || !value.trim()}>
          {isLoading ? 'Recherche…' : 'Rechercher'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={!hasActiveSearch && !value}
          onClick={handleClear}
        >
          Effacer
        </Button>
      </div>
    </form>
  )
}

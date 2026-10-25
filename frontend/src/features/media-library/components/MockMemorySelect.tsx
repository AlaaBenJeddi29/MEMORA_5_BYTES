import { FormField } from '../../../components/FormField'
import type { MockJournalEntry } from '../../../types/media'

export interface MockMemorySelectProps {
  entries: MockJournalEntry[]
  loading: boolean
  error: string | null
  value: string
  onChange: (value: string) => void
  fieldError?: string
  disabled?: boolean
  required?: boolean
}

/**
 * Selects a temporary sample memory by ID only. The backend resolves the
 * title/content; the frontend never sends journal text.
 */
export function MockMemorySelect({
  entries,
  loading,
  error,
  value,
  onChange,
  fieldError,
  disabled = false,
  required = false,
}: MockMemorySelectProps) {
  const hint = error
    ? `${error} You can still generate from a prompt.`
    : 'Sample memories stand in for Module 1 journal entries. Only the selected ID is sent; the server builds the prompt from its title and never sends the body text.'

  return (
    <FormField label="Sample memory" hint={hint} error={fieldError} required={required}>
      {(field) => (
        <select
          {...field}
          className="input"
          value={value}
          disabled={disabled || loading || entries.length === 0}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">
            {loading
              ? 'Loading sample memories…'
              : entries.length === 0
                ? 'No sample memories available'
                : 'Use a prompt instead'}
          </option>
          {entries.map((entry) => (
            <option key={entry.id} value={String(entry.id)}>
              #{entry.id} — {entry.title}
            </option>
          ))}
        </select>
      )}
    </FormField>
  )
}

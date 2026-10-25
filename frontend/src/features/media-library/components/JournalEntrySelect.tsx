import { Button } from '../../../components/Button'
import { FormField } from '../../../components/FormField'
import type { JournalEntry } from '../../../types/journal'

export interface JournalEntrySelectProps {
  entries: JournalEntry[]
  loading: boolean
  error: string | null
  value: string
  onChange: (value: string) => void
  onRetry: () => void
  fieldError?: string
  disabled?: boolean
  required?: boolean
}

/**
 * Selects one of the caller's real Module 1 journal entries by ID only. The
 * server resolves the entry and builds the prompt without sending its body.
 */
export function JournalEntrySelect({
  entries,
  loading,
  error,
  value,
  onChange,
  onRetry,
  fieldError,
  disabled = false,
  required = false,
}: JournalEntrySelectProps) {
  const hint = error
    ? `${error} You can still generate from a manual prompt.`
    : 'Loaded from your private journal. Only the selected ID is sent; the server uses the title and recap, never the entry body.'

  return (
    <FormField
      label="Journal entry"
      hint={hint}
      error={fieldError}
      required={required}
    >
      {(field) => (
        <div className="media-source">
          <select
            {...field}
            className="input"
            value={value}
            disabled={disabled || loading || entries.length === 0}
            onChange={(event) => onChange(event.target.value)}
          >
            <option value="">
              {loading
                ? 'Loading your journal entries…'
                : entries.length === 0
                  ? 'No journal entries yet'
                  : 'Use a manual prompt instead'}
            </option>
            {entries.map((entry) => (
              <option key={entry.id} value={String(entry.id)}>
                #{entry.id} — {entry.title || 'Untitled entry'}
              </option>
            ))}
          </select>
          {error && (
            <Button size="sm" variant="ghost" onClick={onRetry} disabled={disabled}>
              Try again
            </Button>
          )}
        </div>
      )}
    </FormField>
  )
}

import { Button } from '../../../components/Button'
import { FormField } from '../../../components/FormField'
import type { Summary } from '../../../types/summaries'

const EXCERPT_LENGTH = 60

function summaryLabel(summary: Summary): string {
  const text = summary.summary_text.replace(/\s+/g, ' ').trim()
  const excerpt =
    text.length > EXCERPT_LENGTH ? `${text.slice(0, EXCERPT_LENGTH).trimEnd()}…` : text
  const suffix = summary.illustration_prompt.trim()
    ? ''
    : ' · no illustration prompt'
  return `Summary #${summary.id} — ${excerpt || 'No summary text'}${suffix}`
}

export interface SummarySelectProps {
  summaries: Summary[]
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
 * Selects a real Module 3 summary. Its stored illustration prompt is used
 * verbatim; Gemini is never called again for an image.
 */
export function SummarySelect({
  summaries,
  loading,
  error,
  value,
  onChange,
  onRetry,
  fieldError,
  disabled = false,
  required = false,
}: SummarySelectProps) {
  const hint = error
    ? `${error} You can still generate from a manual prompt.`
    : 'Uses the illustration prompt already saved with the summary. The server checks that it belongs to you and to the selected journal entry.'

  return (
    <FormField label="Summary" hint={hint} error={fieldError} required={required}>
      {(field) => (
        <div className="media-source">
          <select
            {...field}
            className="input"
            value={value}
            disabled={disabled || loading || summaries.length === 0}
            onChange={(event) => onChange(event.target.value)}
          >
            <option value="">
              {loading
                ? 'Loading your summaries…'
                : summaries.length === 0
                  ? 'No summaries yet'
                  : 'Do not use a summary'}
            </option>
            {summaries.map((summary) => (
              <option key={summary.id} value={String(summary.id)}>
                {summaryLabel(summary)}
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

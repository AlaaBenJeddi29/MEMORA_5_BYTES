import { useState, type FormEvent } from 'react'

import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { FormField } from '../../../components/FormField'
import { TextInput } from '../../../components/TextInput'
import { normalizeApiError, type NormalizedErrors } from '../../../services/errors'
import { summariesApi } from '../../../services/summaries'
import type { Summary } from '../../../types/summaries'
import {
  MAX_ILLUSTRATION_PROMPT_LENGTH,
  MAX_MOOD_LENGTH,
  MAX_SUMMARY_TEXT_LENGTH,
  MAX_THEMES,
  emptySummaryFormValues,
  summaryToFormValues,
  validateSummaryForm,
  type SummaryFormValues,
} from '../summaryForm'
import { Dialog } from './Dialog'

const EMPTY_ERRORS: NormalizedErrors = { fieldErrors: {}, formErrors: [] }

export interface SummaryFormDialogProps {
  mode: 'create' | 'edit'
  summary?: Summary
  onClose: () => void
  /** Called after Django confirms the mutation. */
  onSaved: () => void
}

function toNormalizedErrors(errors: Record<string, string>): NormalizedErrors {
  const fieldErrors: Record<string, string[]> = {}
  for (const [field, message] of Object.entries(errors)) {
    fieldErrors[field] = [message]
  }
  return { fieldErrors, formErrors: [] }
}

export function SummaryFormDialog({ mode, summary, onClose, onSaved }: SummaryFormDialogProps) {
  const [values, setValues] = useState<SummaryFormValues>(() =>
    summary ? summaryToFormValues(summary) : emptySummaryFormValues(),
  )
  const [errors, setErrors] = useState<NormalizedErrors>(EMPTY_ERRORS)
  const [submitting, setSubmitting] = useState(false)

  const formMessages = [...(errors.detail ? [errors.detail] : []), ...errors.formErrors]

  function update<K extends keyof SummaryFormValues>(field: K, value: SummaryFormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) {
      return
    }

    const result = validateSummaryForm(values)
    if (!result.input) {
      setErrors(toNormalizedErrors(result.errors))
      return
    }

    setSubmitting(true)
    setErrors(EMPTY_ERRORS)
    try {
      if (mode === 'edit' && summary) {
        await summariesApi.update(summary.id, result.input)
      } else {
        await summariesApi.create(result.input)
      }
      onSaved()
    } catch (error) {
      setErrors(normalizeApiError(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog title={mode === 'edit' ? 'Edit summary' : 'New summary'} onClose={onClose}>
      {formMessages.length > 0 && (
        <Alert variant="error" title="We couldn’t save the summary">
          <ul className="alert__list">
            {formMessages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </Alert>
      )}

      <form className="form" onSubmit={handleSubmit} noValidate aria-busy={submitting}>
        <FormField
          label="Summary text"
          required
          hint={`Up to ${MAX_SUMMARY_TEXT_LENGTH.toLocaleString()} characters.`}
          error={errors.fieldErrors.summary_text?.[0]}
        >
          {(field) => (
            <textarea
              {...field}
              className="input textarea"
              name="summary_text"
              rows={6}
              required
              value={values.summary_text}
              onChange={(event) => update('summary_text', event.target.value)}
            />
          )}
        </FormField>

        <FormField
          label="Mood"
          hint={`Optional, up to ${MAX_MOOD_LENGTH} characters.`}
          error={errors.fieldErrors.mood?.[0]}
        >
          {(field) => (
            <TextInput
              {...field}
              name="mood"
              value={values.mood}
              onChange={(event) => update('mood', event.target.value)}
            />
          )}
        </FormField>

        <FormField
          label="Themes"
          hint={`Optional, comma-separated, up to ${MAX_THEMES} themes.`}
          error={errors.fieldErrors.themes?.[0]}
        >
          {(field) => (
            <TextInput
              {...field}
              name="themes"
              value={values.themes}
              onChange={(event) => update('themes', event.target.value)}
            />
          )}
        </FormField>

        <FormField
          label="Illustration prompt"
          hint={`Optional, up to ${MAX_ILLUSTRATION_PROMPT_LENGTH.toLocaleString()} characters.`}
          error={errors.fieldErrors.illustration_prompt?.[0]}
        >
          {(field) => (
            <textarea
              {...field}
              className="input textarea"
              name="illustration_prompt"
              rows={3}
              value={values.illustration_prompt}
              onChange={(event) => update('illustration_prompt', event.target.value)}
            />
          )}
        </FormField>

        <FormField
          label="Journal entry ID"
          hint="Optional temporary reference until Module 1 is integrated."
          error={errors.fieldErrors.journal_entry_id?.[0]}
        >
          {(field) => (
            <TextInput
              {...field}
              type="number"
              min={1}
              inputMode="numeric"
              name="journal_entry_id"
              value={values.journal_entry_id}
              onChange={(event) => update('journal_entry_id', event.target.value)}
            />
          )}
        </FormField>

        <div className="form-actions">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting
              ? 'Saving…'
              : mode === 'edit'
                ? 'Save changes'
                : 'Create summary'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

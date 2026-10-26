import { useState } from 'react'

import type { JournalEntry, JournalEntryInput } from '../../../types/journal'
import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { FormField } from '../../../components/FormField'
import { Icon } from '../../../components/Icon'
import { TextInput } from '../../../components/TextInput'
import { normalizeApiError } from '../../../services/errors'

export interface JournalEntryFormProps {
  entry?: JournalEntry
  /** Values used when the composer opens fresh, e.g. a transcript from a voice memo. */
  initialValues?: Partial<Pick<JournalEntryInput, 'title' | 'text'>>
  onSave: (entry: JournalEntry) => void
  onCancel: () => void
  onSubmit: (data: JournalEntryInput) => Promise<JournalEntry>
}

export function JournalEntryForm({
  entry,
  initialValues,
  onSave,
  onCancel,
  onSubmit,
}: JournalEntryFormProps) {
  const [title, setTitle] = useState(entry?.title ?? initialValues?.title ?? '')
  const [text, setText] = useState(entry?.text ?? initialValues?.text ?? '')
  const [audioFile, setAudioFile] = useState(entry?.audio_file ?? '')
  const [sentiment, setSentiment] = useState(entry?.sentiment ?? '')
  const [summaryText, setSummaryText] = useState(entry?.summary_text ?? '')
  const [loading, setLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setFormError(null)
    setFieldErrors({})

    try {
      const result = await onSubmit({
        title,
        text,
        audio_file: audioFile,
        sentiment,
        summary_text: summaryText,
      })
      onSave(result)
    } catch (error) {
      const normalized = normalizeApiError(error)
      if (normalized.detail) {
        setFormError(normalized.detail)
      } else if (normalized.formErrors.length > 0) {
        setFormError(normalized.formErrors[0])
      } else {
        // Convert field errors from string[] to string
        const errors: Record<string, string> = {}
        for (const [key, messages] of Object.entries(normalized.fieldErrors)) {
          errors[key] = messages[0] || 'Invalid field'
        }
        setFieldErrors(errors)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="journal-entry-form" aria-busy={loading}>
      {formError && <Alert variant="error">{formError}</Alert>}

      <div className="journal-form__intro">
        <p className="eyebrow">{entry ? 'Editing a page' : 'A new page'}</p>
        <p className="journal-form__hint">
          One honest sentence is enough. Nothing here is analysed or scored.
        </p>
      </div>

      <FormField label="Title" required error={fieldErrors.title}>
        {(field) => (
          <TextInput
            {...field}
            name="title"
            className="journal-form__title"
            placeholder="Give this day a name…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={loading}
          />
        )}
      </FormField>

      <FormField
        label="What's on your mind?"
        required
        error={fieldErrors.text}
        hint="Write it the way you would say it."
      >
        {(field) => (
          <textarea
            {...field}
            name="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={loading}
            className="form-textarea journal-form__text"
            rows={10}
            placeholder="Write your thoughts, feelings, and memories…"
          />
        )}
      </FormField>

      <div className="journal-form__meta">
        <div className="journal-form__meta-head">
          <h2 className="journal-form__meta-title">Optional details</h2>
          <p className="journal-form__meta-hint">
            Add your own words if they help you find this page again later.
          </p>
        </div>

        <div className="journal-form__grid">
          <FormField label="Sentiment (optional)" error={fieldErrors.sentiment}>
            {(field) => (
              <TextInput
                {...field}
                name="sentiment"
                type="text"
                placeholder="e.g., grateful, restless, calm…"
                value={sentiment}
                onChange={(e) => setSentiment(e.target.value)}
                disabled={loading}
              />
            )}
          </FormField>

          <FormField label="Audio file (optional)" error={fieldErrors.audio_file}>
            {(field) => (
              <TextInput
                {...field}
                name="audio_file"
                type="text"
                placeholder="e.g., /media/audio/memo.webm"
                value={audioFile}
                onChange={(e) => setAudioFile(e.target.value)}
                disabled={loading}
              />
            )}
          </FormField>
        </div>

        <FormField label="Summary (optional)" error={fieldErrors.summary_text}>
          {(field) => (
            <textarea
              {...field}
              name="summary_text"
              value={summaryText}
              onChange={(e) => setSummaryText(e.target.value)}
              disabled={loading}
              className="form-textarea journal-form__summary"
              rows={4}
              placeholder="A few lines to remember it by…"
            />
          )}
        </FormField>
      </div>

      <div className="form-actions">
        <Button type="button" onClick={onCancel} disabled={loading} variant="secondary">
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          <Icon name={entry ? 'check' : 'pen'} size={16} />
          {entry ? 'Save changes' : 'Create entry'}
        </Button>
      </div>
    </form>
  )
}

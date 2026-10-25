import { useState } from 'react'
import type { JournalEntry, JournalEntryInput } from '../../../types/journal'
import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { FormField } from '../../../components/FormField'
import { TextInput } from '../../../components/TextInput'
import { normalizeApiError } from '../../../services/errors'

export interface JournalEntryFormProps {
  entry?: JournalEntry
  onSave: (entry: JournalEntry) => void
  onCancel: () => void
  onSubmit: (data: JournalEntryInput) => Promise<JournalEntry>
}

export function JournalEntryForm({ entry, onSave, onCancel, onSubmit }: JournalEntryFormProps) {
  const [title, setTitle] = useState(entry?.title ?? '')
  const [text, setText] = useState(entry?.text ?? '')
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
    <form onSubmit={handleSubmit} className="journal-entry-form">
      {formError && <Alert variant="error">{formError}</Alert>}

      <FormField
        label="Title"
        required
        error={fieldErrors.title}
      >
        {(field) => (
          <TextInput
            {...field}
            name="title"
            placeholder="Give your entry a title..."
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
      >
        {(field) => (
          <textarea
            {...field}
            name="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={loading}
            className="form-textarea"
            rows={10}
            placeholder="Write your thoughts, feelings, and memories..."
          />
        )}
      </FormField>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
        <FormField
          label="Sentiment (optional)"
          error={fieldErrors.sentiment}
        >
          {(field) => (
            <TextInput
              {...field}
              name="sentiment"
              type="text"
              placeholder="e.g., happy, calm, reflective..."
              value={sentiment}
              onChange={(e) => setSentiment(e.target.value)}
              disabled={loading}
            />
          )}
        </FormField>

        <FormField
          label="Audio file (optional)"
          error={fieldErrors.audio_file}
        >
          {(field) => (
            <TextInput
              {...field}
              name="audio_file"
              type="text"
              placeholder="Path to audio file..."
              value={audioFile}
              onChange={(e) => setAudioFile(e.target.value)}
              disabled={loading}
            />
          )}
        </FormField>
      </div>

      <FormField
        label="Summary (optional)"
        error={fieldErrors.summary_text}
      >
        {(field) => (
          <textarea
            {...field}
            name="summary_text"
            value={summaryText}
            onChange={(e) => setSummaryText(e.target.value)}
            disabled={loading}
            className="form-textarea"
            rows={5}
            placeholder="AI-generated summary or your own notes..."
          />
        )}
      </FormField>

      <div className="form-actions">
        <Button type="submit" disabled={loading}>
          {entry ? '💾 Save Changes' : '✍️ Create Entry'}
        </Button>
        <Button type="button" onClick={onCancel} disabled={loading} variant="secondary">
          Cancel
        </Button>
      </div>
    </form>
  )
}

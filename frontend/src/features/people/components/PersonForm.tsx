import { useRef, useState, type FormEvent } from 'react'

import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { FormField } from '../../../components/FormField'
import { TextInput } from '../../../components/TextInput'
import { normalizeApiError, type NormalizedErrors } from '../../../services/errors'

const EMPTY_ERRORS: NormalizedErrors = { fieldErrors: {}, formErrors: [] }

export interface PersonFormValues {
  name: string
  avatar: File | null
}

export interface PersonFormProps {
  initialName?: string
  currentAvatarUrl?: string | null
  submitLabel: string
  onSave: (values: PersonFormValues) => Promise<void>
  onCancel?: () => void
}

export function PersonForm({
  initialName,
  currentAvatarUrl,
  submitLabel,
  onSave,
  onCancel,
}: PersonFormProps) {
  const [name, setName] = useState(initialName ?? '')
  const [avatar, setAvatar] = useState<File | null>(null)
  const [errors, setErrors] = useState<NormalizedErrors>(EMPTY_ERRORS)
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const formMessages = [...(errors.detail ? [errors.detail] : []), ...errors.formErrors]

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!name.trim()) {
      setErrors({ fieldErrors: { name: ['Le nom est obligatoire.'] }, formErrors: [] })
      return
    }

    setSaving(true)
    setErrors(EMPTY_ERRORS)
    try {
      await onSave({ name: name.trim(), avatar })
      setName('')
      setAvatar(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (error) {
      setErrors(normalizeApiError(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      {formMessages.length > 0 && (
        <Alert variant="error">
          <ul className="alert__list">
            {formMessages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </Alert>
      )}

      <FormField label="Nom" required error={errors.fieldErrors.name?.[0]}>
        {(field) => (
          <TextInput
            {...field}
            name="name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        )}
      </FormField>

      {currentAvatarUrl && !avatar && (
        <img
          src={currentAvatarUrl}
          alt={`Avatar de ${initialName ?? name}`}
          style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover' }}
        />
      )}

      <FormField
        label={currentAvatarUrl ? 'Nouvel avatar (optionnel)' : 'Avatar (optionnel)'}
        hint="Image carrée recommandée."
        error={errors.fieldErrors.avatar?.[0]}
      >
        {(field) => (
          <input
            {...field}
            ref={fileInputRef}
            className="input"
            type="file"
            name="avatar"
            accept="image/*"
            onChange={(event) => setAvatar(event.target.files?.[0] ?? null)}
          />
        )}
      </FormField>

      {avatar && <p className="muted">Image sélectionnée : {avatar.name}</p>}

      <div className="cluster">
        <Button type="submit" disabled={saving}>
          {saving ? 'Enregistrement…' : submitLabel}
        </Button>
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} disabled={saving}>
            Annuler
          </Button>
        )}
      </div>
    </form>
  )
}

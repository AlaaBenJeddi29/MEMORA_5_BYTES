import { useEffect, useRef, useState, type FormEvent } from 'react'

import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { FormField } from '../../../components/FormField'
import { Icon } from '../../../components/Icon'
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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [errors, setErrors] = useState<NormalizedErrors>(EMPTY_ERRORS)
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const formMessages = [...(errors.detail ? [errors.detail] : []), ...errors.formErrors]
  const shownAvatar = previewUrl ?? currentAvatarUrl ?? null

  useEffect(() => {
    if (!avatar) {
      setPreviewUrl(null)
      return
    }

    const url = URL.createObjectURL(avatar)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [avatar])

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
    <form className="form person-form" onSubmit={handleSubmit} noValidate aria-busy={saving}>
      {formMessages.length > 0 && (
        <Alert variant="error">
          <ul className="alert__list">
            {formMessages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="person-form__identity">
        {shownAvatar ? (
          <img
            className="person-form__avatar"
            src={shownAvatar}
            alt={`Avatar de ${initialName ?? (name || 'la personne')}`}
          />
        ) : (
          <span className="person-form__avatar person-form__avatar--empty" aria-hidden="true">
            <Icon name="user" size={22} />
          </span>
        )}

        <div className="person-form__fields">
          <FormField label="Nom" required error={errors.fieldErrors.name?.[0]}>
            {(field) => (
              <TextInput
                {...field}
                name="name"
                required
                placeholder="Le prénom suffit"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            )}
          </FormField>

          <FormField
            label={currentAvatarUrl ? 'Nouvel avatar (optionnel)' : 'Avatar (optionnel)'}
            hint="Image carrée recommandée."
            error={errors.fieldErrors.avatar?.[0]}
          >
            {(field) => (
              <div className="person-form__upload">
                <input
                  {...field}
                  ref={fileInputRef}
                  className="sr-only"
                  type="file"
                  name="avatar"
                  accept="image/*"
                  tabIndex={-1}
                  onChange={(event) => setAvatar(event.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  className="btn btn--secondary btn--sm person-form__file-button"
                  disabled={saving}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Icon name="upload" size={14} />
                  Choisir une image
                </button>
                <span className="person-form__file-name">
                  {avatar ? avatar.name : 'Aucun fichier sélectionné'}
                </span>
              </div>
            )}
          </FormField>
        </div>
      </div>

      <div className="person-form__actions">
        <Button type="submit" disabled={saving}>
          <Icon name={onCancel ? 'check' : 'plus'} size={15} />
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

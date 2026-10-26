import { useState, type FormEvent } from 'react'

import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { FormField } from '../../../components/FormField'
import { TextInput } from '../../../components/TextInput'
import type { CollectionInput, MediaCollection } from '../../../types/media'
import {
  MAX_COLLECTION_DESCRIPTION_LENGTH,
  MAX_COLLECTION_NAME_LENGTH,
} from '../mediaHelpers'
import { Modal } from './Modal'

export interface CollectionFormDialogProps {
  mode: 'create' | 'rename'
  collection?: MediaCollection
  busy: boolean
  error: string | null
  onSubmit: (input: CollectionInput) => void
  onCancel: () => void
}

export function CollectionFormDialog({
  mode,
  collection,
  busy,
  error,
  onSubmit,
  onCancel,
}: CollectionFormDialogProps) {
  const [name, setName] = useState(collection?.name ?? '')
  const [description, setDescription] = useState(collection?.description ?? '')
  const [nameError, setNameError] = useState<string | null>(null)
  const [descriptionError, setDescriptionError] = useState<string | null>(null)

  const isCreate = mode === 'create'
  const title = isCreate ? 'Create a collection' : 'Rename collection'

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) {
      return
    }

    const trimmedName = name.trim()
    const trimmedDescription = description.trim()

    if (!trimmedName) {
      setNameError('Enter a collection name.')
      return
    }
    if (trimmedName.length > MAX_COLLECTION_NAME_LENGTH) {
      setNameError(
        `Keep the name to ${MAX_COLLECTION_NAME_LENGTH} characters or fewer.`,
      )
      return
    }
    if (trimmedDescription.length > MAX_COLLECTION_DESCRIPTION_LENGTH) {
      setDescriptionError(
        `Keep the description to ${MAX_COLLECTION_DESCRIPTION_LENGTH} characters or fewer.`,
      )
      return
    }

    setNameError(null)
    setDescriptionError(null)
    onSubmit({ name: trimmedName, description: trimmedDescription })
  }

  return (
    <Modal title={title} onClose={busy ? () => undefined : onCancel}>
      <form
        className="form media-form media-collection-form"
        onSubmit={handleSubmit}
        noValidate
      >
        {!isCreate && collection && (
          <p className="media-collection-form__context">
            Renaming <strong>{collection.name}</strong>. Its images stay in
            place.
          </p>
        )}

        <FormField
          label="Name"
          required
          hint={`Up to ${MAX_COLLECTION_NAME_LENGTH} characters.`}
          error={nameError ?? undefined}
        >
          {(field) => (
            <TextInput
              {...field}
              name="collection-name"
              maxLength={MAX_COLLECTION_NAME_LENGTH}
              value={name}
              disabled={busy}
              onChange={(event) => {
                setName(event.target.value)
                setNameError(null)
              }}
            />
          )}
        </FormField>

        <FormField
          label="Description"
          hint={`Optional, up to ${MAX_COLLECTION_DESCRIPTION_LENGTH} characters.`}
          error={descriptionError ?? undefined}
        >
          {(field) => (
            <textarea
              {...field}
              className="input media-textarea"
              name="collection-description"
              maxLength={MAX_COLLECTION_DESCRIPTION_LENGTH}
              value={description}
              disabled={busy}
              onChange={(event) => {
                setDescription(event.target.value)
                setDescriptionError(null)
              }}
            />
          )}
        </FormField>

        <p className="media-counter">
          {description.length} / {MAX_COLLECTION_DESCRIPTION_LENGTH} characters
        </p>

        {error && (
          <Alert variant="error" title="We couldn’t save this collection">
            {error}
          </Alert>
        )}

        <div className="media-form-actions">
          <Button type="submit" disabled={busy}>
            {busy
              ? isCreate
                ? 'Creating…'
                : 'Saving…'
              : isCreate
                ? 'Create collection'
                : 'Save changes'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  )
}

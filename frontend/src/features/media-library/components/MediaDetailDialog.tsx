import { useId, useState, type FormEvent } from 'react'

import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { FormField } from '../../../components/FormField'
import { Icon } from '../../../components/Icon'
import { StatusBadge } from '../../../components/StatusBadge'
import { normalizeApiError, type NormalizedErrors } from '../../../services/errors'
import { mediaApi } from '../../../services/media'
import type { MediaCollection, MediaItem } from '../../../types/media'
import { formatDateTime } from '../../../utils/format'
import {
  EMPTY_ERRORS,
  flattenFormErrors,
  MAX_PROMPT_LENGTH,
  MEDIA_TYPE_LABELS,
} from '../mediaHelpers'
import { CollectionMembership } from './CollectionMembership'
import { FavoriteButton } from './FavoriteButton'
import { MediaImage } from './MediaImage'
import { Modal } from './Modal'

export interface MediaDetailDialogProps {
  media: MediaItem
  collections: MediaCollection[]
  collectionsLoading: boolean
  collectionsError: string | null
  favoriteBusy: boolean
  membershipBusyIds: number[]
  membershipError: string | null
  onClose: () => void
  onUpdated: (media: MediaItem) => void
  onDelete: (media: MediaItem) => void
  onToggleFavorite: (media: MediaItem) => void
  onToggleCollection: (
    collection: MediaCollection,
    media: MediaItem,
    shouldAdd: boolean,
  ) => void
}

export function MediaDetailDialog({
  media,
  collections,
  collectionsLoading,
  collectionsError,
  favoriteBusy,
  membershipBusyIds,
  membershipError,
  onClose,
  onUpdated,
  onDelete,
  onToggleFavorite,
  onToggleCollection,
}: MediaDetailDialogProps) {
  const promptHeadingId = useId()
  const [editing, setEditing] = useState(false)
  const [prompt, setPrompt] = useState(media.prompt)
  const [errors, setErrors] = useState<NormalizedErrors>(EMPTY_ERRORS)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const formMessages = flattenFormErrors(errors)
  const typeLabel = MEDIA_TYPE_LABELS[media.media_type]
  const imageAlt = media.prompt ? `${typeLabel}: ${media.prompt}` : `${typeLabel} ${media.id}`

  function startEditing() {
    setPrompt(media.prompt)
    setErrors(EMPTY_ERRORS)
    setSaved(false)
    setEditing(true)
  }

  function cancelEditing() {
    setPrompt(media.prompt)
    setErrors(EMPTY_ERRORS)
    setEditing(false)
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (prompt.length > MAX_PROMPT_LENGTH) {
      setErrors({
        fieldErrors: {
          prompt: [`Keep the prompt to ${MAX_PROMPT_LENGTH} characters or fewer.`],
        },
        formErrors: [],
      })
      return
    }

    setSaving(true)
    setErrors(EMPTY_ERRORS)
    try {
      const updated = await mediaApi.updatePrompt(media.id, { prompt })
      onUpdated(updated)
      setEditing(false)
      setSaved(true)
    } catch (error) {
      setErrors(normalizeApiError(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={`${typeLabel} #${media.id}`} onClose={onClose} wide>
      <div className="media-detail">
        <figure className="media-detail__figure">
          <MediaImage
            className="media-detail__image"
            src={media.file}
            alt={imageAlt}
            loading="eager"
            fallbackLabel="This image could not be loaded."
          />
          <figcaption className="media-detail__caption">
            <StatusBadge status={media.status} />
            <span>Added {formatDateTime(media.created_at)}</span>
            <FavoriteButton
              media={media}
              busy={favoriteBusy}
              showLabel
              className="media-detail__favorite"
              onToggle={onToggleFavorite}
            />
          </figcaption>
        </figure>

        <div className="media-detail__info">
          {media.media_type === 'ai_generated' && (
            <Alert variant="info" title="AI-generated image">
              This image was produced by AI, not a camera. It is not an original
              photograph and may not accurately depict real people or events.
            </Alert>
          )}

          <dl className="media-facts">
            <div className="media-facts__row">
              <dt>Journal entry</dt>
              <dd>
                {media.journal_entries.length > 0 ? (
                  media.journal_entries.map((entry, index) => (
                    <span key={entry.id}>
                      {index > 0 ? ', ' : ''}
                      <a href="/app/journal">
                        {entry.title || `Entry #${entry.id}`}
                      </a>
                    </span>
                  ))
                ) : (
                  <span className="muted">Not linked</span>
                )}
              </dd>
            </div>
            <div className="media-facts__row">
              <dt>Summary</dt>
              <dd>
                {media.summary_id !== null ? (
                  <a className="media-facts__link" href="/app/summaries">
                    Summary #{media.summary_id}
                    <Icon name="arrowUpRight" size={12} />
                  </a>
                ) : (
                  <span className="muted">Not linked</span>
                )}
              </dd>
            </div>
            {media.media_type === 'ai_generated' &&
              (media.provider || media.model) && (
                <div className="media-facts__row">
                  <dt>Generated with</dt>
                  <dd>{[media.provider, media.model].filter(Boolean).join(' · ')}</dd>
                </div>
              )}
            <div className="media-facts__row">
              <dt>Created</dt>
              <dd>{formatDateTime(media.created_at)}</dd>
            </div>
            <div className="media-facts__row">
              <dt>Updated</dt>
              <dd>{formatDateTime(media.updated_at)}</dd>
            </div>
          </dl>

          <CollectionMembership
            media={media}
            collections={collections}
            loading={collectionsLoading}
            collectionsError={collectionsError}
            busyIds={membershipBusyIds}
            error={membershipError}
            onToggle={onToggleCollection}
          />

          <section className="media-detail__prompt-section" aria-labelledby={promptHeadingId}>
            <div className="media-detail__section-head">
              <h3 id={promptHeadingId}>{editing ? 'Edit prompt' : 'Prompt'}</h3>
              {!editing && (
                <Button size="sm" variant="secondary" onClick={startEditing}>
                  <Icon name="edit" size={14} />
                  Edit prompt
                </Button>
              )}
            </div>

            {saved && (
              <Alert variant="success" title="Prompt updated">
                The change was saved to the server.
              </Alert>
            )}

            {editing ? (
              <form className="form media-form media-prompt-edit" onSubmit={handleSave} noValidate>
                <FormField
                  label="Prompt"
                  hint={`Up to ${MAX_PROMPT_LENGTH} characters. Only the prompt can be edited; other fields are server-managed.`}
                  error={errors.fieldErrors.prompt?.[0]}
                >
                  {(field) => (
                    <>
                      <textarea
                        {...field}
                        className="input media-textarea"
                        maxLength={MAX_PROMPT_LENGTH}
                        value={prompt}
                        onChange={(event) => setPrompt(event.target.value)}
                      />
                      <div className="media-prompt__foot">
                        <p className="media-counter">
                          {prompt.length} / {MAX_PROMPT_LENGTH} characters
                        </p>
                      </div>
                    </>
                  )}
                </FormField>

                {formMessages.length > 0 && (
                  <Alert variant="error" title="We couldn’t save the prompt">
                    <ul className="alert__list">
                      {formMessages.map((message) => (
                        <li key={message}>{message}</li>
                      ))}
                    </ul>
                  </Alert>
                )}

                <div className="media-form-actions">
                  <Button type="submit" disabled={saving}>
                    {saving ? 'Saving…' : 'Save prompt'}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={cancelEditing}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            ) : media.prompt ? (
              <p className="media-detail__prompt">{media.prompt}</p>
            ) : (
              <p className="media-detail__prompt media-detail__prompt--empty">
                No prompt recorded for this image.
              </p>
            )}
          </section>
        </div>
      </div>

      <div className="media-modal__actions">
        <Button variant="secondary" onClick={onClose}>
          Done
        </Button>
        <Button variant="danger" onClick={() => onDelete(media)}>
          <Icon name="trash" size={15} />
          Delete image
        </Button>
      </div>
    </Modal>
  )
}

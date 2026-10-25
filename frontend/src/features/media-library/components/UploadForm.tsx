import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'

import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { FormField } from '../../../components/FormField'
import { LoadingState } from '../../../components/LoadingState'
import { normalizeApiError, type NormalizedErrors } from '../../../services/errors'
import { mediaApi } from '../../../services/media'
import type { MediaItem } from '../../../types/media'
import {
  EMPTY_ERRORS,
  flattenFormErrors,
  validateUploadFile,
} from '../mediaHelpers'

export interface UploadFormProps {
  onUploaded: (media: MediaItem) => void
  onView: (media: MediaItem) => void
}

export function UploadForm({ onUploaded, onView }: UploadFormProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [errors, setErrors] = useState<NormalizedErrors>(EMPTY_ERRORS)
  const [submitting, setSubmitting] = useState(false)
  const [uploaded, setUploaded] = useState<MediaItem | null>(null)

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  const formMessages = flattenFormErrors(errors)

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null
    setErrors(EMPTY_ERRORS)
    setUploaded(null)

    if (!selected) {
      setFile(null)
      setPreviewUrl(null)
      setFileError(null)
      return
    }

    const validation = validateUploadFile(selected)
    setFile(selected)
    setFileError(validation)
    setPreviewUrl(validation ? null : URL.createObjectURL(selected))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!file) {
      setFileError('Choose an image to upload.')
      return
    }

    const validation = validateUploadFile(file)
    if (validation) {
      setFileError(validation)
      return
    }

    setSubmitting(true)
    setErrors(EMPTY_ERRORS)
    setFileError(null)
    try {
      const media = await mediaApi.upload(file)
      setUploaded(media)
      onUploaded(media)
      setFile(null)
      setPreviewUrl(null)
      if (inputRef.current) {
        inputRef.current.value = ''
      }
    } catch (error) {
      const normalized = normalizeApiError(error)
      setErrors(normalized)
      setFileError(normalized.fieldErrors.file?.[0] ?? null)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="form media-form" onSubmit={handleSubmit} noValidate aria-busy={submitting}>
      <FormField
        label="Image file"
        hint="JPEG, PNG, or WebP up to 10 MB. The server verifies the decoded image before storing it."
        required
        error={fileError ?? undefined}
      >
        {(field) => (
          <div
            className={
              fileError
                ? 'media-dropzone media-dropzone--invalid'
                : 'media-dropzone'
            }
          >
            <input
              {...field}
              ref={inputRef}
              type="file"
              className="media-dropzone__input"
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              onChange={handleFileChange}
              disabled={submitting}
            />
            <span className="media-dropzone__icon" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 16V4" />
                <path d="m7 9 5-5 5 5" />
                <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
              </svg>
            </span>
            <span className="media-dropzone__title">
              {file ? 'Choose a different image' : 'Choose an image'}
            </span>
            <span className="media-dropzone__meta">
              {file ? file.name : 'Click this area to browse your files.'}
            </span>
          </div>
        )}
      </FormField>

      {previewUrl && (
        <figure className="media-local-preview">
          <img src={previewUrl} alt="Local preview of the selected image" />
          <figcaption>
            <span className="media-local-preview__name">{file?.name}</span>
            <span className="muted">Local preview — nothing has been uploaded yet.</span>
          </figcaption>
        </figure>
      )}

      {formMessages.length > 0 && (
        <Alert variant="error" title="We couldn’t upload that image">
          <ul className="alert__list">
            {formMessages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </Alert>
      )}

      {uploaded && (
        <Alert variant="success" title="Upload complete">
          <p>The image is stored and now appears in your gallery.</p>
          <Button size="sm" variant="secondary" onClick={() => onView(uploaded)}>
            View uploaded image
          </Button>
        </Alert>
      )}

      {submitting && <LoadingState label="Uploading your image…" />}

      <Button type="submit" block disabled={submitting}>
        {submitting ? 'Uploading…' : 'Upload image'}
      </Button>
    </form>
  )
}

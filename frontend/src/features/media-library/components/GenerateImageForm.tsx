import { useId, useRef, useState, type FormEvent } from 'react'

import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { FormField } from '../../../components/FormField'
import { LoadingState } from '../../../components/LoadingState'
import { normalizeApiError, type NormalizedErrors } from '../../../services/errors'
import { isRetryableGenerationError, mediaApi } from '../../../services/media'
import type { GenerateImageInput, MediaItem, MockJournalEntry } from '../../../types/media'
import { formatDateTime } from '../../../utils/format'
import {
  EMPTY_ERRORS,
  flattenFormErrors,
  GENERATION_SIZES,
  MAX_PROMPT_LENGTH,
  MEDIA_TYPE_LABELS,
  PROMPT_EXAMPLES,
  PROMPT_GUIDANCE,
} from '../mediaHelpers'
import { MediaImage } from './MediaImage'
import { MockMemorySelect } from './MockMemorySelect'

export interface GenerateImageFormProps {
  memories: MockJournalEntry[]
  memoriesLoading: boolean
  memoriesError: string | null
  onGenerated: (media: MediaItem) => void
  onView: (media: MediaItem) => void
}

export function GenerateImageForm({
  memories,
  memoriesLoading,
  memoriesError,
  onGenerated,
  onView,
}: GenerateImageFormProps) {
  const resultHeadingId = useId()
  const consentId = useId()
  const inFlight = useRef(false)
  const [prompt, setPrompt] = useState('')
  const [memoryId, setMemoryId] = useState('')
  const [size, setSize] = useState<string>(GENERATION_SIZES[0].value)
  const [consented, setConsented] = useState(false)
  const [errors, setErrors] = useState<NormalizedErrors>(EMPTY_ERRORS)
  const [generating, setGenerating] = useState(false)
  const [retryable, setRetryable] = useState(false)
  const [result, setResult] = useState<MediaItem | null>(null)

  const selectedSize =
    GENERATION_SIZES.find((option) => option.value === size) ?? GENERATION_SIZES[0]

  const formMessages = [
    ...flattenFormErrors(errors),
    ...Object.entries(errors.fieldErrors)
      .filter(([field]) => field !== 'prompt' && field !== 'journal_entry_id')
      .flatMap(([, messages]) => messages),
  ]

  function validatePrompt(): NormalizedErrors {
    const fieldErrors: Record<string, string[]> = {}
    if (!prompt.trim() && !memoryId) {
      fieldErrors.prompt = ['Enter a prompt or select a sample memory.']
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
      fieldErrors.prompt = [
        ...(fieldErrors.prompt ?? []),
        `Keep the prompt to ${MAX_PROMPT_LENGTH} characters or fewer.`,
      ]
    }
    return { fieldErrors, formErrors: [] }
  }

  async function runGeneration() {
    if (inFlight.current || !consented) {
      return
    }

    const validation = validatePrompt()
    if (Object.keys(validation.fieldErrors).length > 0) {
      setErrors(validation)
      return
    }

    const input: GenerateImageInput = {
      width: selectedSize.width,
      height: selectedSize.height,
    }
    const trimmedPrompt = prompt.trim()
    if (trimmedPrompt) {
      input.prompt = trimmedPrompt
    }
    if (memoryId) {
      // Only the ID crosses the boundary; Django resolves the sample context.
      input.journal_entry_id = Number(memoryId)
    }

    // This ref is the duplicate-submission guard: state updates render later,
    // so two rapid clicks must not both reach the network.
    inFlight.current = true
    setGenerating(true)
    setErrors(EMPTY_ERRORS)
    setRetryable(false)
    setResult(null)
    try {
      const media = await mediaApi.generate(input)
      setResult(media)
      onGenerated(media)
    } catch (error) {
      setErrors(normalizeApiError(error))
      setRetryable(isRetryableGenerationError(error))
    } finally {
      inFlight.current = false
      setGenerating(false)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void runGeneration()
  }

  return (
    <form className="form media-form media-generator" onSubmit={handleSubmit} noValidate aria-busy={generating}>
      <p className="media-ai-note">
        <span className="media-ai-note__mark" aria-hidden="true">
          AI
        </span>
        <span>
          <strong>These images are illustrations.</strong> Output is AI-generated,
          not an original photograph, and may not depict real people or events.
        </span>
      </p>

      <FormField
        label="Prompt"
        hint={`${PROMPT_GUIDANCE} Django sends only this text to local ComfyUI; React never calls the provider.`}
        required={!memoryId}
        error={errors.fieldErrors.prompt?.[0]}
      >
        {(field) => (
          <>
            <textarea
              {...field}
              className="input media-textarea"
              maxLength={MAX_PROMPT_LENGTH}
              placeholder="A quiet lake at dawn, soft watercolor light…"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              disabled={generating}
            />
            <div className="media-prompt__foot">
              <p
                className={
                  prompt.length > MAX_PROMPT_LENGTH * 0.9
                    ? 'media-counter media-counter--near'
                    : 'media-counter'
                }
              >
                {prompt.length} / {MAX_PROMPT_LENGTH} characters
              </p>
              <div className="media-prompt-examples">
                <span className="media-prompt-examples__label">Try an example</span>
                {PROMPT_EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    className="media-prompt-example"
                    onClick={() => setPrompt(example)}
                    disabled={generating}
                    aria-label={`Use prompt example: ${example}`}
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </FormField>

      <MockMemorySelect
        entries={memories}
        loading={memoriesLoading}
        error={memoriesError}
        value={memoryId}
        onChange={setMemoryId}
        fieldError={errors.fieldErrors.journal_entry_id?.[0]}
        disabled={generating}
      />

      <fieldset className="media-size">
        <legend className="field__label">Size</legend>
        <p className="field__hint">Smaller images are safer on limited GPU memory.</p>
        <div className="media-size__options">
          {GENERATION_SIZES.map((option) => {
            const [shape, dimensions] = option.label.split(' · ')
            const selected = size === option.value
            return (
              <label
                key={option.value}
                className={
                  selected ? 'media-size__option is-selected' : 'media-size__option'
                }
              >
                <input
                  type="radio"
                  name="media-size"
                  value={option.value}
                  checked={selected}
                  onChange={(event) => setSize(event.target.value)}
                  disabled={generating}
                />
                <span className="media-size__text">
                  <span className="media-size__name">{shape}</span>
                  <span className="media-size__dims">{dimensions}</span>
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>

      <div className="media-consent">
        <input
          id={consentId}
          type="checkbox"
          checked={consented}
          onChange={(event) => setConsented(event.target.checked)}
          disabled={generating}
        />
        <label htmlFor={consentId}>
          I understand generating uses my local ComfyUI installation and GPU, may
          take a few minutes, and does not start until I choose Generate
          illustration.
        </label>
      </div>

      {formMessages.length > 0 && (
        <Alert variant="error" title="We couldn’t generate that image">
          <ul className="alert__list">
            {formMessages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </Alert>
      )}

      {generating && (
        <>
          <LoadingState label="Generating your illustration…" />
          <p className="media-panel__note">
            This runs on your local ComfyUI installation and can take up to a few minutes.
          </p>
        </>
      )}

      <div className="media-form-actions">
        <Button type="submit" disabled={generating || !consented}>
          {generating ? 'Generating…' : 'Generate illustration'}
        </Button>
        {retryable && !generating && (
          <Button
            variant="secondary"
            disabled={!consented}
            onClick={() => void runGeneration()}
          >
            Try again
          </Button>
        )}
      </div>

      {result && (
        <section
          className="media-result"
          aria-labelledby={resultHeadingId}
          aria-live="polite"
        >
          <div className="media-result__media">
            <MediaImage
              className="media-result__image"
              src={result.file}
              alt={
                result.prompt
                  ? `AI-generated illustration: ${result.prompt}`
                  : 'AI-generated illustration'
              }
              loading="eager"
              fallbackLabel="The generated image could not be loaded."
            />
          </div>
          <div className="media-result__body">
            <p className="media-result__eyebrow">New illustration</p>
            <h3 id={resultHeadingId}>AI-generated illustration</h3>
            <p className="media-result__disclosure">
              This image was generated by AI. It is not an original photograph
              and may not accurately depict real people or events.
            </p>
            <p className="media-result__prompt">
              {result.prompt || 'Generated from the selected sample memory.'}
            </p>
            <p className="media-result__meta">
              {MEDIA_TYPE_LABELS[result.media_type]} · stored {formatDateTime(result.created_at)}
            </p>
            <div className="media-form-actions">
              <Button size="sm" variant="secondary" onClick={() => onView(result)}>
                View details
              </Button>
            </div>
          </div>
        </section>
      )}
    </form>
  )
}

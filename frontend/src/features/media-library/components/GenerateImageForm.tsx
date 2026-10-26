import { useId, useRef, useState, type FormEvent } from 'react'

import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { FormField } from '../../../components/FormField'
import { Icon } from '../../../components/Icon'
import { LoadingState } from '../../../components/LoadingState'
import { normalizeApiError, type NormalizedErrors } from '../../../services/errors'
import { isRetryableGenerationError, mediaApi } from '../../../services/media'
import type { GenerateImageInput, MediaItem } from '../../../types/media'
import type { JournalEntry } from '../../../types/journal'
import type { Summary } from '../../../types/summaries'
import { formatDateTime } from '../../../utils/format'
import {
  buildJournalArtPrompt,
  classifyGenerationFailure,
  resolveArtPrompt,
  type GenerationFailure,
} from '../artHelpers'
import {
  EMPTY_ERRORS,
  flattenFormErrors,
  GENERATION_DEFAULT_STEPS,
  GENERATION_MAX_SEED,
  GENERATION_MAX_STEPS,
  GENERATION_MIN_STEPS,
  GENERATION_SIZES,
  MAX_PROMPT_LENGTH,
  MEDIA_TYPE_LABELS,
  PROMPT_EXAMPLES,
  PROMPT_GUIDANCE,
} from '../mediaHelpers'
import { FavoriteButton } from './FavoriteButton'
import { JournalEntrySelect } from './JournalEntrySelect'
import { MediaImage } from './MediaImage'
import { MemorySourcePreview } from './MemorySourcePreview'
import { SummarySelect } from './SummarySelect'

export interface GenerateImageFormProps {
  journalEntries: JournalEntry[]
  journalEntriesLoading: boolean
  journalEntriesError: string | null
  onReloadJournalEntries: () => void
  summaries: Summary[]
  summariesLoading: boolean
  summariesError: string | null
  onReloadSummaries: () => void
  initialJournalEntryId?: number | null
  initialSummaryId?: number | null
  /** The page's current media list, used to reflect favorite updates. */
  mediaItems: MediaItem[]
  favoriteBusyIds: number[]
  onToggleFavorite: (media: MediaItem) => void
  onGenerated: (media: MediaItem) => void
  onView: (media: MediaItem) => void
  onShowSource: (media: MediaItem) => void
}

const SOURCE_STEP = '1'
const PROMPT_STEP = '2'
const OPTIONS_STEP = '3'

export function GenerateImageForm({
  journalEntries,
  journalEntriesLoading,
  journalEntriesError,
  onReloadJournalEntries,
  summaries,
  summariesLoading,
  summariesError,
  onReloadSummaries,
  initialJournalEntryId = null,
  initialSummaryId = null,
  mediaItems,
  favoriteBusyIds,
  onToggleFavorite,
  onGenerated,
  onView,
  onShowSource,
}: GenerateImageFormProps) {
  const resultHeadingId = useId()
  const consentId = useId()
  const sourceStepId = useId()
  const promptStepId = useId()
  const optionsStepId = useId()
  const inFlight = useRef(false)
  const [prompt, setPrompt] = useState('')
  const [journalEntryId, setJournalEntryId] = useState(
    initialJournalEntryId === null ? '' : String(initialJournalEntryId),
  )
  const [summaryId, setSummaryId] = useState(
    initialSummaryId === null ? '' : String(initialSummaryId),
  )
  const [size, setSize] = useState<string>(GENERATION_SIZES[0].value)
  const [steps, setSteps] = useState(String(GENERATION_DEFAULT_STEPS))
  const [seed, setSeed] = useState('')
  const [consented, setConsented] = useState(false)
  const [errors, setErrors] = useState<NormalizedErrors>(EMPTY_ERRORS)
  const [generating, setGenerating] = useState(false)
  const [retryable, setRetryable] = useState(false)
  const [failure, setFailure] = useState<GenerationFailure | null>(null)
  const [result, setResult] = useState<MediaItem | null>(null)

  const selectedSize =
    GENERATION_SIZES.find((option) => option.value === size) ?? GENERATION_SIZES[0]
  const selectedSummary =
    summaries.find((summary) => String(summary.id) === summaryId) ?? null
  const selectedEntry =
    journalEntries.find((entry) => String(entry.id) === journalEntryId) ?? null
  const resolution = resolveArtPrompt(
    prompt,
    selectedSummary,
    selectedEntry,
    Boolean(summaryId),
  )
  const savedSummaryPrompt = selectedSummary?.illustration_prompt.trim() ?? ''
  const editedOverSavedPrompt =
    resolution.source === 'manual' &&
    Boolean(savedSummaryPrompt) &&
    resolution.prompt !== savedSummaryPrompt

  // The page updates the media list after a favorite toggle; reuse that copy so
  // the result actions never act on stale metadata.
  const liveResult = result
    ? mediaItems.find((item) => item.id === result.id) ?? result
    : null

  const formMessages = [
    ...flattenFormErrors(errors),
    ...Object.entries(errors.fieldErrors)
      .filter(
        ([field]) =>
          field !== 'prompt' &&
          field !== 'journal_entry_id' &&
          field !== 'summary_id' &&
          field !== 'steps' &&
          field !== 'seed',
      )
      .flatMap(([, messages]) => messages),
  ]

  function validateSource(): NormalizedErrors {
    const fieldErrors: Record<string, string[]> = {}
    if (!prompt.trim() && !journalEntryId && !summaryId) {
      fieldErrors.prompt = [
        'Enter a prompt or select one of your journal entries or summaries.',
      ]
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
      fieldErrors.prompt = [
        ...(fieldErrors.prompt ?? []),
        `Keep the prompt to ${MAX_PROMPT_LENGTH} characters or fewer.`,
      ]
    }

    if (
      journalEntryId &&
      !journalEntriesLoading &&
      !journalEntriesError &&
      !journalEntries.some((entry) => String(entry.id) === journalEntryId)
    ) {
      fieldErrors.journal_entry_id = [
        'That journal entry is not in your account. Choose one of your entries or clear the selection.',
      ]
    }

    if (summaryId && !summariesLoading && !summariesError) {
      if (!selectedSummary) {
        fieldErrors.summary_id = [
          'That summary is not in your account. Choose one of your summaries or clear the selection.',
        ]
      } else {
        if (
          journalEntryId &&
          selectedSummary.journal_entry_id !== Number(journalEntryId)
        ) {
          fieldErrors.summary_id = [
            'The selected journal entry does not belong to this summary. Choose the summary to keep them paired.',
          ]
        }
        if (!prompt.trim() && !selectedSummary.illustration_prompt.trim()) {
          fieldErrors.summary_id = [
            ...(fieldErrors.summary_id ?? []),
            'This summary has no illustration prompt. Add one in Summaries or enter a manual prompt.',
          ]
        }
      }
    }

    if (
      !summaryId &&
      journalEntryId &&
      selectedEntry &&
      !prompt.trim() &&
      !buildJournalArtPrompt(selectedEntry)
    ) {
      fieldErrors.journal_entry_id = [
        'This journal entry has no title or recap to illustrate. Enter a manual prompt instead.',
      ]
    }

    const stepValue = steps.trim() === '' ? null : Number(steps)
    if (
      stepValue === null ||
      !Number.isInteger(stepValue) ||
      stepValue < GENERATION_MIN_STEPS ||
      stepValue > GENERATION_MAX_STEPS
    ) {
      fieldErrors.steps = [
        `Steps must be between ${GENERATION_MIN_STEPS} and ${GENERATION_MAX_STEPS}.`,
      ]
    }

    const seedValue = seed.trim()
    if (
      seedValue &&
      (!/^\d+$/.test(seedValue) || Number(seedValue) > GENERATION_MAX_SEED)
    ) {
      fieldErrors.seed = ['Seed must be a whole number of 0 or more.']
    }

    return { fieldErrors, formErrors: [] }
  }

  function handleJournalChange(value: string) {
    setJournalEntryId(value)
    if (summaryId && value) {
      const summary = summaries.find((item) => String(item.id) === summaryId)
      if (!summary || summary.journal_entry_id !== Number(value)) {
        setSummaryId('')
      }
    }
  }

  function handleSummaryChange(value: string) {
    setSummaryId(value)
    if (!value) {
      return
    }
    const summary = summaries.find((item) => String(item.id) === value)
    if (summary) {
      setJournalEntryId(
        summary.journal_entry_id === null
          ? ''
          : String(summary.journal_entry_id),
      )
    }
  }

  async function runGeneration() {
    if (inFlight.current || !consented) {
      return
    }

    const validation = validateSource()
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
    if (journalEntryId) {
      input.journal_entry_id = Number(journalEntryId)
    }
    if (summaryId) {
      input.summary_id = Number(summaryId)
    }
    const stepValue = Number(steps)
    if (steps.trim() && stepValue !== GENERATION_DEFAULT_STEPS) {
      input.steps = stepValue
    }
    const seedValue = seed.trim()
    if (seedValue) {
      input.seed = Number(seedValue)
    }

    // This ref is the duplicate-submission guard: state updates render later,
    // so two rapid clicks must not both reach the network.
    inFlight.current = true
    setGenerating(true)
    setErrors(EMPTY_ERRORS)
    setRetryable(false)
    setFailure(null)
    setResult(null)
    try {
      const media = await mediaApi.generate(input)
      setResult(media)
      onGenerated(media)
    } catch (error) {
      setErrors(normalizeApiError(error))
      setFailure(classifyGenerationFailure(error))
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

  const sourceSummaryId = liveResult?.summary_id ?? null
  const sourceIsSummary = sourceSummaryId !== null
  const sourceTitle =
    liveResult?.journal_entries[0]?.title ||
    (sourceSummaryId !== null ? `Summary #${sourceSummaryId}` : '')
  const hasResultSource =
    sourceIsSummary || Boolean(liveResult?.journal_entries.length)
  const hasJournalSource = Boolean(liveResult?.journal_entries.length)

  return (
    <form className="form media-form media-generator" onSubmit={handleSubmit} noValidate aria-busy={generating}>
      <p className="media-ai-note">
        <span className="media-ai-note__mark" aria-hidden="true">
          <Icon name="sparkles" size={14} />
        </span>
        <span>
          <strong>These images are illustrations.</strong> Output is AI-generated,
          not an original photograph, and may not depict real people or events.
        </span>
      </p>

      <section className="media-art-step" aria-labelledby={sourceStepId}>
        <header className="media-art-step__head">
          <span className="media-art-step__number" aria-hidden="true">
            {SOURCE_STEP}
          </span>
          <div>
            <h4 className="media-art-step__title" id={sourceStepId}>
              Choose a memory
            </h4>
            <p className="media-art-step__hint">
              Pick one of your journal memories or summaries. Its saved prompt or
              recap becomes the artwork prompt, and the result stays linked to it.
            </p>
          </div>
        </header>

        <SummarySelect
          summaries={summaries}
          loading={summariesLoading}
          error={summariesError}
          value={summaryId}
          onChange={handleSummaryChange}
          onRetry={onReloadSummaries}
          fieldError={errors.fieldErrors.summary_id?.[0]}
          disabled={generating}
        />

        <JournalEntrySelect
          entries={journalEntries}
          loading={journalEntriesLoading}
          error={journalEntriesError}
          value={journalEntryId}
          onChange={handleJournalChange}
          onRetry={onReloadJournalEntries}
          fieldError={errors.fieldErrors.journal_entry_id?.[0]}
          disabled={generating}
        />

        <MemorySourcePreview
          journalEntries={journalEntries}
          summaries={summaries}
          journalEntryId={journalEntryId}
          summaryId={summaryId}
        />
      </section>

      <section className="media-art-step" aria-labelledby={promptStepId}>
        <header className="media-art-step__head">
          <span className="media-art-step__number" aria-hidden="true">
            {PROMPT_STEP}
          </span>
          <div>
            <h4 className="media-art-step__title" id={promptStepId}>
              Review the prompt
            </h4>
            <p className="media-art-step__hint">
              Check what will be sent to your local model. Edit it if you want a
              different scene or style.
            </p>
          </div>
        </header>

        <FormField
          label="Prompt"
          hint={`${PROMPT_GUIDANCE} A manual prompt replaces any selected summary or journal prompt. Leave it empty to use the summary’s saved illustration prompt, then the journal entry’s title and recap. The entry body is never sent.`}
          required={!journalEntryId && !summaryId}
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

              {!prompt.trim() && resolution.prompt && (
                <div className="media-art-prompt-preview">
                  <div className="media-art-prompt-preview__head">
                    <p className="media-art-prompt-preview__label">
                      <Icon name="sparkles" size={12} />
                      {resolution.label}
                    </p>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setPrompt(resolution.prompt)}
                      disabled={generating}
                    >
                      Use this prompt
                    </Button>
                  </div>
                  <p className="media-art-prompt-preview__text">
                    {resolution.prompt}
                  </p>
                  <p className="media-art-prompt-preview__note">
                    {resolution.source === 'journal'
                      ? 'Built from the title and recap only. The entry body is never sent.'
                      : 'Used exactly as saved with this summary.'}
                  </p>
                </div>
              )}

              {!prompt.trim() && resolution.source === 'summary_missing' && (
                <p className="media-art-prompt-preview media-art-prompt-preview--empty">
                  {resolution.label} Enter a manual prompt, or update the summary
                  first.
                </p>
              )}

              {!prompt.trim() && resolution.source === 'journal_empty' && (
                <p className="media-art-prompt-preview media-art-prompt-preview--empty">
                  {resolution.label} Enter a manual prompt instead.
                </p>
              )}

              {editedOverSavedPrompt && selectedSummary && (
                <div className="media-art-prompt-preview media-art-prompt-preview--manual">
                  <p className="media-art-prompt-preview__label">
                    Your edited prompt replaces the prompt saved with Summary #
                    {selectedSummary.id}.
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setPrompt(savedSummaryPrompt)}
                    disabled={generating}
                  >
                    Use saved prompt
                  </Button>
                </div>
              )}

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
                  <span className="media-prompt-examples__label">
                    <Icon name="plus" size={12} />
                    Try an example
                  </span>
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
      </section>

      <section className="media-art-step" aria-labelledby={optionsStepId}>
        <header className="media-art-step__head">
          <span className="media-art-step__number" aria-hidden="true">
            {OPTIONS_STEP}
          </span>
          <div>
            <h4 className="media-art-step__title" id={optionsStepId}>
              Choose the artwork
            </h4>
            <p className="media-art-step__hint">
              Pick a shape for the illustration. Advanced options use the same
              validated ranges as the server.
            </p>
          </div>
        </header>

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

        <details className="media-art-advanced">
          <summary className="media-art-advanced__summary">
            <Icon name="filter" size={14} />
            Advanced options
            <span className="media-art-advanced__note">Steps and seed</span>
          </summary>
          <div className="media-art-advanced__body">
            <FormField
              label={`Steps`}
              hint={`${GENERATION_MIN_STEPS}–${GENERATION_MAX_STEPS}. Defaults to ${GENERATION_DEFAULT_STEPS}; more steps take longer.`}
              error={errors.fieldErrors.steps?.[0]}
            >
              {(field) => (
                <input
                  {...field}
                  className="input"
                  type="number"
                  min={GENERATION_MIN_STEPS}
                  max={GENERATION_MAX_STEPS}
                  step={1}
                  value={steps}
                  onChange={(event) => setSteps(event.target.value)}
                  disabled={generating}
                />
              )}
            </FormField>

            <FormField
              label="Seed (optional)"
              hint="Leave empty for a random seed. A fixed seed helps you compare prompt edits."
              error={errors.fieldErrors.seed?.[0]}
            >
              {(field) => (
                <input
                  {...field}
                  className="input"
                  type="number"
                  min={0}
                  step={1}
                  placeholder="Random"
                  value={seed}
                  onChange={(event) => setSeed(event.target.value)}
                  disabled={generating}
                />
              )}
            </FormField>
          </div>
        </details>

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
      </section>

      {formMessages.length > 0 && (
        <Alert variant="error" title="We couldn’t generate that image">
          <ul className="alert__list">
            {formMessages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </Alert>
      )}

      {failure && (
        <div className="media-art-failure" role="status">
          <p className="media-art-failure__title">{failure.title}</p>
          <p className="media-art-failure__text">{failure.guidance}</p>
        </div>
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
          <Icon name="sparkles" size={16} />
          {generating ? 'Generating…' : 'Generate illustration'}
        </Button>
        {retryable && !generating && (
          <Button
            variant="secondary"
            disabled={!consented}
            onClick={() => void runGeneration()}
          >
            <Icon name="refresh" size={15} />
            Try again
          </Button>
        )}
      </div>

      {liveResult && (
        <section
          className="media-result"
          aria-labelledby={resultHeadingId}
          aria-live="polite"
        >
          <div className="media-result__media">
            <MediaImage
              className="media-result__image"
              src={liveResult.file}
              alt={
                liveResult.prompt
                  ? `AI-generated illustration: ${liveResult.prompt}`
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
              {liveResult.prompt || 'No prompt was recorded for this image.'}
            </p>
            {hasResultSource && (
              <p className="media-result__source">
                <Icon
                  name={sourceIsSummary ? 'quote' : 'book'}
                  size={13}
                />
                <span>
                  Source: <strong>{sourceTitle || 'your memory'}</strong>
                  {sourceIsSummary ? ' · Summary memory' : ' · Journal memory'}
                </span>
              </p>
            )}
            {(liveResult.summary_id !== null || liveResult.journal_entries.length > 0) && (
              <div className="media-result__provenance">
                {liveResult.summary_id !== null && (
                  <p>
                    From <a href="/app/summaries">summary #{liveResult.summary_id}</a>.
                  </p>
                )}
                {liveResult.journal_entries.length > 0 && (
                  <p>
                    Linked to{' '}
                    {liveResult.journal_entries.map((entry, index) => (
                      <span key={entry.id}>
                        {index > 0 ? ', ' : ''}
                        <a href="/app/journal">
                          {entry.title || `journal entry #${entry.id}`}
                        </a>
                      </span>
                    ))}
                    .
                  </p>
                )}
              </div>
            )}
            <p className="media-result__meta">
              {MEDIA_TYPE_LABELS[liveResult.media_type]}
              {liveResult.model ? ` · ${liveResult.model}` : ''} · stored{' '}
              {formatDateTime(liveResult.created_at)}
            </p>
            <div className="media-form-actions media-result__actions">
              <FavoriteButton
                media={liveResult}
                busy={favoriteBusyIds.includes(liveResult.id)}
                showLabel
                onToggle={onToggleFavorite}
              />
              <Button size="sm" variant="secondary" onClick={() => onView(liveResult)}>
                <Icon name="eye" size={14} />
                View details
              </Button>
              {hasJournalSource && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onShowSource(liveResult)}
                >
                  <Icon name="list" size={14} />
                  Open source memory
                </Button>
              )}
            </div>
          </div>
        </section>
      )}
    </form>
  )
}

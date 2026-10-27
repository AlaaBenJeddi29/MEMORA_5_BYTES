import { useEffect, useRef, useState, type FormEvent } from 'react'

import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { Icon } from '../../../components/Icon'
import { LoadingState } from '../../../components/LoadingState'
import { useSpeech, useStopSpeechOnLeave } from '../../../hooks/useSpeech'
import { normalizeApiError, type NormalizedErrors } from '../../../services/errors'
import { companionApi } from '../../../services/companion'
import type { CompanionAnswer, CompanionVoiceGender } from '../../../types/companion'
import type { Summary } from '../../../types/summaries'
import { SummaryDetailDialog } from '../../summaries/components/SummaryDetailDialog'
import { CompanionSourceCard } from './CompanionSourceCard'
import { CompanionVoiceSettings } from './CompanionVoiceSettings'
import { useBrowserVoices } from '../useBrowserVoices'
import { useCompanionVoicePreferences } from '../useCompanionVoicePreferences'
import {
  ANSWER_SPEECH_KEY,
  VOICE_GENDER_LABELS,
  previewSpeechKey,
  previewText,
  resolveCompanionVoice,
} from '../voice'

const MIN_QUESTION_LENGTH = 3
const MAX_QUESTION_LENGTH = 500

const EXAMPLES = [
  'When have I felt proud of myself?',
  'What have I learned from difficult moments?',
  'Which memories brought me joy?',
  'What mattered most to me recently?',
]

type AskStatus = 'idle' | 'loading' | 'ready' | 'error'

function messagesOf(errors: NormalizedErrors | null): string[] {
  if (!errors) {
    return []
  }
  const messages = [...(errors.detail ? [errors.detail] : []), ...errors.formErrors]
  return messages.length > 0 ? messages : ['Something went wrong. Please try again.']
}

export function MemoryCompanion() {
  const [question, setQuestion] = useState('')
  const [activeQuestion, setActiveQuestion] = useState('')
  const [status, setStatus] = useState<AskStatus>('idle')
  const [answer, setAnswer] = useState<CompanionAnswer | null>(null)
  const [errors, setErrors] = useState<NormalizedErrors | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [detailSummary, setDetailSummary] = useState<Summary | null>(null)

  const requestRef = useRef<AbortController | null>(null)

  const {
    preferences: voicePreference,
    loading: voiceLoading,
    loadFailed: voiceLoadFailed,
    save: saveVoicePreference,
    saveError: voiceSaveError,
    saveStatus: voiceSaveStatus,
    update: updateVoicePreference,
    isDirty: voicePreferenceDirty,
  } = useCompanionVoicePreferences()
  const voices = useBrowserVoices()
  const speech = useSpeech()
  useStopSpeechOnLeave()

  const answerActive = speech.isReading(ANSWER_SPEECH_KEY)
  const answerPaused = speech.isPaused(ANSWER_SPEECH_KEY)
  const answerReading = answerActive && !answerPaused
  const previewingGender =
    (['feminine', 'masculine'] as const).find((gender) =>
      speech.isReading(previewSpeechKey(gender)),
    ) ?? null
  const resolvedVoice = resolveCompanionVoice(voices, voicePreference)
  const answerSpeechError =
    speech.state.errorKey === ANSWER_SPEECH_KEY ? speech.state.error : null
  const previewSpeechError =
    speech.state.errorKey === previewSpeechKey('feminine') ||
    speech.state.errorKey === previewSpeechKey('masculine')
      ? speech.state.error
      : null
  const answerVoiceLabel = resolvedVoice.voice
    ? resolvedVoice.genderMatched
      ? `voix ${VOICE_GENDER_LABELS[voicePreference.gender]} (${resolvedVoice.voice.name})`
      : `${resolvedVoice.voice.name} (genre non déclaré)`
    : 'voix par défaut du navigateur'

  useEffect(() => {
    return () => {
      requestRef.current?.abort()
    }
  }, [])

  function stopReadingForSettingsChange() {
    if (speech.state.status !== 'idle') {
      speech.stop()
    }
  }

  function handleVoiceChange(patch: Parameters<typeof updateVoicePreference>[0]) {
    stopReadingForSettingsChange()
    updateVoicePreference(patch)
  }

  function handlePreview(gender: CompanionVoiceGender) {
    if (!speech.supported) {
      return
    }
    const key = previewSpeechKey(gender)
    if (speech.isReading(key)) {
      speech.stop()
      return
    }
    const target = resolveCompanionVoice(voices, {
      ...voicePreference,
      gender,
    })
    speech.start({
      key,
      field: 'assistant',
      text: previewText(voicePreference.language),
      voiceLang: voicePreference.language,
      rate: voicePreference.rate,
      voice: target.voice,
    })
  }

  function handleListen() {
    if (!answer || !speech.supported) {
      return
    }
    if (answerReading) {
      speech.pause()
      return
    }
    if (answerPaused) {
      speech.resume()
      return
    }
    speech.start({
      key: ANSWER_SPEECH_KEY,
      field: 'assistant',
      text: answer.answer,
      voiceLang: voicePreference.language,
      rate: voicePreference.rate,
      voice: resolvedVoice.voice,
    })
  }

  async function ask(rawQuestion: string) {
    const cleaned = rawQuestion.trim()
    if (cleaned.length < MIN_QUESTION_LENGTH) {
      setFieldError('Enter a question of at least 3 characters.')
      return
    }

    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller

    speech.stop()
    setFieldError(null)
    setErrors(null)
    setAnswer(null)
    setActiveQuestion(cleaned)
    setStatus('loading')

    try {
      const result = await companionApi.ask(
        { question: cleaned },
        { signal: controller.signal },
      )
      if (controller.signal.aborted) {
        return
      }
      setAnswer(result)
      setStatus('ready')
    } catch (error) {
      if (controller.signal.aborted) {
        return
      }
      if (error instanceof Error && error.name === 'AbortError') {
        return
      }
      setErrors(normalizeApiError(error))
      setStatus('error')
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void ask(question)
  }

  function handleExample(example: string) {
    setQuestion(example)
    void ask(example)
  }

  const errorMessages = messagesOf(errors)
  const tooShort = question.trim().length < MIN_QUESTION_LENGTH

  return (
    <section className="companion-card companion-ask" aria-labelledby="companion-ask-heading">
      <div className="companion-card__head">
        <span className="companion-card__mark" aria-hidden="true">
          <Icon name="compass" size={19} />
        </span>
        <div>
          <h2 id="companion-ask-heading">Ask your memories</h2>
          <p className="muted">
            Questions are matched against your saved summaries. The companion answers in the
            language you use and never invents a memory.
          </p>
        </div>
      </div>

      <form className="companion-form" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label className="field__label" htmlFor="companion-question">
            Your question
          </label>
          <textarea
            id="companion-question"
            className="input companion-form__textarea"
            value={question}
            rows={3}
            maxLength={MAX_QUESTION_LENGTH}
            placeholder="For example: what did I learn from the difficult moments this year?"
            onChange={(event) => setQuestion(event.target.value)}
            aria-describedby="companion-question-help"
            aria-invalid={fieldError ? true : undefined}
            disabled={status === 'loading'}
          />
          <div className="companion-form__meta">
            <span id="companion-question-help" className="field__hint">
              Ask in English or French. Nothing is posted to your journal.
            </span>
            <span className="companion-form__count" aria-hidden="true">
              {question.length}/{MAX_QUESTION_LENGTH}
            </span>
          </div>
          {fieldError && (
            <p className="field__error" role="alert">
              {fieldError}
            </p>
          )}
        </div>

        <div className="companion-form__actions">
          <Button type="submit" disabled={status === 'loading' || tooShort}>
            <Icon name="send" size={15} />
            {status === 'loading' ? 'Reflecting…' : 'Ask the companion'}
          </Button>
        </div>
      </form>

      <div className="companion-examples">
        <p className="companion-examples__label">Try an example</p>
        <div className="companion-examples__row">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              className="companion-example"
              onClick={() => handleExample(example)}
              disabled={status === 'loading'}
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      <CompanionVoiceSettings
        supported={speech.supported}
        voices={voices}
        preference={voicePreference}
        onChange={handleVoiceChange}
        onPreview={handlePreview}
        previewingGender={previewingGender}
        previewError={previewSpeechError}
        onSave={() => void saveVoicePreference()}
        isDirty={voicePreferenceDirty}
        loading={voiceLoading}
        loadFailed={voiceLoadFailed}
        saveStatus={voiceSaveStatus}
        saveError={voiceSaveError}
      />

      <div
        className="companion-result"
        aria-live="polite"
        aria-busy={status === 'loading'}
      >
        {status === 'idle' && (
          <div className="companion-idle">
            <span className="companion-idle__icon" aria-hidden="true">
              <Icon name="sparkles" size={20} />
            </span>
            <p>
              Ask about a feeling, a theme, or a period. If your saved summaries do not
              contain enough detail, the companion will say so instead of guessing.
            </p>
          </div>
        )}

        {status === 'loading' && (
          <LoadingState label="Searching your saved memories…" />
        )}

        {status === 'error' && (
          <Alert variant="error" title="The companion couldn’t answer">
            <ul className="alert__list">
              {errorMessages.map((message, index) => (
                <li key={index}>{message}</li>
              ))}
            </ul>
            {activeQuestion && (
              <div className="alert__actions">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void ask(activeQuestion)}
                >
                  <Icon name="refresh" size={14} />
                  Try again
                </Button>
              </div>
            )}
          </Alert>
        )}

        {status === 'ready' && answer && (
          <div className="companion-answer">
            <div className="companion-answer__head">
              <h3>Companion reflection</h3>
              <span className="badge badge--lavender">
                <Icon name="book" size={12} />
                Based on your summaries
              </span>
            </div>

            <p className="companion-answer__text">{answer.answer}</p>

            <div className="companion-listen">
              <div className="companion-listen__actions">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!speech.supported}
                  onClick={handleListen}
                >
                  <Icon
                    name={answerReading ? 'pause' : answerPaused ? 'play' : 'volume'}
                    size={14}
                  />
                  {answerReading
                    ? 'Mettre en pause'
                    : answerPaused
                      ? 'Reprendre l’écoute'
                      : 'Écouter'}
                </Button>
                {answerActive && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => speech.stop()}
                  >
                    <Icon name="stop" size={14} />
                    Arrêter
                  </Button>
                )}
              </div>

              <p className="companion-listen__status" role="status" aria-live="polite">
                {!speech.supported ? (
                  'La lecture vocale n’est pas disponible dans ce navigateur.'
                ) : answerActive ? (
                  <>
                    <Icon name="wave" size={13} />
                    {answerPaused ? 'Lecture en pause' : 'Lecture en cours'} ·{' '}
                    {answerVoiceLabel}
                  </>
                ) : (
                  <>
                    <Icon name="volume" size={13} />
                    Voix utilisée : {answerVoiceLabel}.
                  </>
                )}
              </p>

              {answerSpeechError && (
                <p className="companion-listen__error" role="alert">
                  {answerSpeechError}
                </p>
              )}
            </div>

            {answer.insufficient_information && (
              <p className="companion-answer__note">
                <Icon name="info" size={14} />
                No sources are listed because the stored summaries did not contain enough
                relevant detail.
              </p>
            )}

            {answer.reflection_questions.length > 0 && (
              <section
                className="companion-questions"
                aria-labelledby="companion-questions-heading"
              >
                <h4 id="companion-questions-heading">Questions to sit with</h4>
                <p className="muted">
                  These are open prompts, not conclusions. Answering them is optional, and
                  nothing is added to your journal automatically.
                </p>
                <ul>
                  {answer.reflection_questions.map((reflection) => (
                    <li key={reflection}>
                      <Icon name="quote" size={14} />
                      <span>{reflection}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {answer.sources.length > 0 && (
              <section
                className="companion-sources"
                aria-labelledby="companion-sources-heading"
              >
                <h4 id="companion-sources-heading">
                  Sources from your summaries ({answer.sources.length})
                </h4>
                <p className="muted">
                  Every source below belongs to your account and was used for this answer.
                </p>
                <ul className="companion-source-list">
                  {answer.sources.map((source) => (
                    <CompanionSourceCard
                      key={source.summary.id}
                      source={source}
                      onOpen={() => setDetailSummary(source.summary)}
                    />
                  ))}
                </ul>
              </section>
            )}

            <p className="companion-privacy">
              <Icon name="lock" size={13} />
              The Gemini key stays on the server. Only the summaries selected for this
              question are sent.
            </p>
          </div>
        )}
      </div>

      {detailSummary && (
        <SummaryDetailDialog
          summary={detailSummary}
          onClose={() => setDetailSummary(null)}
        />
      )}
    </section>
  )
}

import { useEffect, useRef, useState, type FormEvent } from 'react'

import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { Icon } from '../../../components/Icon'
import { LoadingState } from '../../../components/LoadingState'
import { normalizeApiError, type NormalizedErrors } from '../../../services/errors'
import { companionApi } from '../../../services/companion'
import type { CompanionAnswer } from '../../../types/companion'
import type { Summary } from '../../../types/summaries'
import { SummaryDetailDialog } from '../../summaries/components/SummaryDetailDialog'
import { CompanionSourceCard } from './CompanionSourceCard'

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

  useEffect(() => {
    return () => {
      requestRef.current?.abort()
    }
  }, [])

  async function ask(rawQuestion: string) {
    const cleaned = rawQuestion.trim()
    if (cleaned.length < MIN_QUESTION_LENGTH) {
      setFieldError('Enter a question of at least 3 characters.')
      return
    }

    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller

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

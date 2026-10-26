import { useId, useState } from 'react'
import type { FormEvent } from 'react'

import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { bookPreferencesApi } from '../../../services/bookPreferences'
import { normalizeApiError, type NormalizedErrors } from '../../../services/errors'
import type { BookPreferences } from '../../../types/bookPreferences'
import {
  BOOK_COVER_STYLES,
  BOOK_FONT_STYLES,
  BOOK_THEMES,
  bookThemeClassName,
  DEFAULT_BOOK_PREFERENCES,
  normalizeBookPreferences,
} from '../bookThemes'
import { Dialog } from './Dialog'

export interface BookCustomizationDialogProps {
  /** Preferences currently applied to the book. */
  preferences: BookPreferences
  onClose: () => void
  /** Called with the saved preferences so the open book updates immediately. */
  onSaved: (preferences: BookPreferences) => void
}

function messagesOf(errors: NormalizedErrors | null): string[] {
  if (!errors) {
    return []
  }
  const messages = [
    ...(errors.detail ? [errors.detail] : []),
    ...errors.formErrors,
    ...Object.values(errors.fieldErrors).flat(),
  ]
  return messages.length > 0
    ? [...new Set(messages)]
    : ['Votre personnalisation n’a pas pu être enregistrée. Réessayez.']
}

function labelOf(
  options: readonly { id: string; label: string }[],
  id: string,
): string {
  return options.find((option) => option.id === id)?.label ?? id
}

/**
 * Cover, theme, and typography picker. Changes only the draft: the preview
 * updates at once, Cancel discards the draft, and Save persists it through the
 * owner-scoped API before the result is applied to the book.
 */
export function BookCustomizationDialog({
  preferences,
  onClose,
  onSaved,
}: BookCustomizationDialogProps) {
  const [draft, setDraft] = useState<BookPreferences>(preferences)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<NormalizedErrors | null>(null)
  const formId = useId()

  function update(patch: Partial<BookPreferences>) {
    setDraft((current) => ({ ...current, ...patch }))
    setErrors(null)
  }

  function close() {
    if (!saving) {
      onClose()
    }
  }

  function restoreDefaults() {
    setDraft({ ...DEFAULT_BOOK_PREFERENCES })
    setErrors(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) {
      return
    }
    setSaving(true)
    setErrors(null)
    try {
      const saved = normalizeBookPreferences(await bookPreferencesApi.save(draft))
      setSaving(false)
      onSaved(saved)
    } catch (error) {
      setErrors(normalizeApiError(error))
      setSaving(false)
    }
  }

  const errorMessages = messagesOf(errors)
  const previewLabel = `Aperçu : couverture ${labelOf(
    BOOK_COVER_STYLES,
    draft.cover_style,
  )}, thème ${labelOf(BOOK_THEMES, draft.theme_id)}, typographie ${labelOf(
    BOOK_FONT_STYLES,
    draft.font_style,
  )}.`

  return (
    <Dialog
      title="Personnaliser mon livre"
      onClose={close}
      wide
      footer={
        <div className="book-customization__footer">
          <Button
            variant="secondary"
            size="sm"
            className="book-customization__footer-restore"
            onClick={restoreDefaults}
            disabled={saving}
          >
            Rétablir les valeurs par défaut
          </Button>
          <Button variant="secondary" onClick={close} disabled={saving}>
            Annuler
          </Button>
          <Button type="submit" form={formId} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      }
    >
      <form className="book-customization" id={formId} onSubmit={handleSubmit}>
        {errorMessages.length > 0 && (
          <div className="book-customization__alert">
            <Alert
              variant="error"
              title="Votre personnalisation n’a pas pu être enregistrée."
            >
              <ul className="alert__list">
                {errorMessages.map((message, index) => (
                  <li key={index}>{message}</li>
                ))}
              </ul>
            </Alert>
          </div>
        )}

        <div className="book-customization__controls">
        <fieldset className="book-customization__section">
          <legend className="book-customization__legend">
            Choisir ma couverture
          </legend>
          <p className="book-customization__hint">
            Six reliures prédéfinies ; votre contenu reste identique.
          </p>
          <div className="book-customization__grid">
            {BOOK_COVER_STYLES.map((cover) => {
              const selected = draft.cover_style === cover.id
              return (
                <label
                  key={cover.id}
                  className="book-option"
                  data-selected={selected}
                >
                  <input
                    type="radio"
                    name="book-cover-style"
                    value={cover.id}
                    className="sr-only"
                    checked={selected}
                    aria-label={cover.label}
                    onChange={() => update({ cover_style: cover.id })}
                  />
                  <span
                    className={`book-cover-thumb book-cover-style--${cover.id} book-theme--${draft.theme_id}`}
                    aria-hidden="true"
                  >
                    <span className="book-cover-thumb__mark">MEMORA</span>
                  </span>
                  <span className="book-option__label">{cover.label}</span>
                  <span className="book-option__description">
                    {cover.description}
                  </span>
                  <span className="book-option__check" aria-hidden="true" />
                </label>
              )
            })}
          </div>
        </fieldset>

        <fieldset className="book-customization__section">
          <legend className="book-customization__legend">Choisir mon thème</legend>
          <p className="book-customization__hint">
            Chaque thème adapte les pages, les titres, les séparateurs et les
            commandes de lecture.
          </p>
          <div className="book-customization__grid">
            {BOOK_THEMES.map((theme) => {
              const selected = draft.theme_id === theme.id
              return (
                <label
                  key={theme.id}
                  className="book-option"
                  data-selected={selected}
                >
                  <input
                    type="radio"
                    name="book-theme"
                    value={theme.id}
                    className="sr-only"
                    checked={selected}
                    aria-label={theme.label}
                    onChange={() => update({ theme_id: theme.id })}
                  />
                  <span
                    className={`book-theme-thumb book-theme--${theme.id}`}
                    aria-hidden="true"
                  >
                    <span className="book-theme-thumb__line book-theme-thumb__line--title" />
                    <span className="book-theme-thumb__line" />
                    <span className="book-theme-thumb__line book-theme-thumb__line--short" />
                    <span className="book-theme-thumb__chip" />
                  </span>
                  <span className="book-option__label">{theme.label}</span>
                  <span className="book-option__description">
                    {theme.description}
                  </span>
                  <span className="book-option__check" aria-hidden="true" />
                </label>
              )
            })}
          </div>
        </fieldset>

        <fieldset className="book-customization__section">
          <legend className="book-customization__legend">
            Choisir ma typographie
          </legend>
          <p className="book-customization__hint">
            Les titres et les dates changent de style ; le texte reste lisible.
          </p>
          <div className="book-customization__grid">
            {BOOK_FONT_STYLES.map((font) => {
              const selected = draft.font_style === font.id
              return (
                <label
                  key={font.id}
                  className="book-option"
                  data-selected={selected}
                >
                  <input
                    type="radio"
                    name="book-font-style"
                    value={font.id}
                    className="sr-only"
                    checked={selected}
                    aria-label={font.label}
                    onChange={() => update({ font_style: font.id })}
                  />
                  <span
                    className={`book-font-thumb book-font--${font.id}`}
                    aria-hidden="true"
                  >
                    Aa
                  </span>
                  <span className="book-option__label">{font.label}</span>
                  <span className="book-option__description">
                    {font.description}
                  </span>
                  <span className="book-option__check" aria-hidden="true" />
                </label>
              )
            })}
          </div>
        </fieldset>
        </div>

        <section className="book-customization__preview-panel">
          <h3 className="book-customization__preview-title">
            Aperçu de mon livre
          </h3>
          <div
            className={`book-preview book-customization__preview ${bookThemeClassName(
              draft,
            )}`}
            role="img"
            aria-label={previewLabel}
          >
            <div className="book-preview__cover" aria-hidden="true">
              <p className="book-preview__cover-eyebrow">MEMORA</p>
              <span className="book-preview__cover-title">My Story</span>
              <span className="book-preview__cover-ornament" />
            </div>
            <div className="book-preview__page" aria-hidden="true">
              <p className="book-preview__page-date">Aujourd’hui</p>
              <span className="book-preview__page-rule" />
              <p className="book-preview__page-text">
                Un souvenir paisible, écrit sur une page qui vous ressemble.
              </p>
              <span className="book-preview__chip">calme</span>
              <span className="book-preview__page-number">1</span>
            </div>
          </div>
          <p className="sr-only" aria-live="polite">
            {previewLabel}
          </p>
        </section>
      </form>
    </Dialog>
  )
}

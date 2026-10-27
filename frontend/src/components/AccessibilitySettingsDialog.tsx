import { useEffect, useId, useRef, type KeyboardEvent } from 'react'

import { Button } from './Button'
import { Icon, type IconName } from './Icon'
import {
  TEXT_SIZE_LABELS,
  TEXT_SIZE_STEPS,
  useAccessibility,
  type TextSize,
  type ToggleableSetting,
} from '../hooks/useAccessibility'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

const SWITCHES: Array<{
  key: ToggleableSetting
  title: string
  description: string
  icon: IconName
}> = [
  {
    key: 'highContrast',
    title: 'High contrast',
    description: 'Darker text, stronger borders and plain backgrounds.',
    icon: 'sun',
  },
  {
    key: 'dyslexia',
    title: 'Dyslexia-friendly reading',
    description: 'OpenDyslexic font with wider letter, word and line spacing.',
    icon: 'book',
  },
  {
    key: 'underlineLinks',
    title: 'Underline links',
    description: 'Make every link recognisable without relying on colour.',
    icon: 'arrowUpRight',
  },
]

export interface AccessibilitySettingsDialogProps {
  open: boolean
  onClose: () => void
}

/**
 * Accessibility settings modal, mounted once by `layouts/AppLayout.tsx` and
 * opened from the sidebar. It only edits preferences — the hook writes the
 * `data-*` attributes on `<html>` and `styles/accessibility.css` restyles the
 * whole application.
 *
 * Dialog contract: `role="dialog"` + `aria-modal`, labelled and described,
 * focus moved to the close button on open, Tab trapped inside, Escape and a
 * backdrop click close it, and focus returns to the sidebar trigger afterwards.
 */
export function AccessibilitySettingsDialog({ open, onClose }: AccessibilitySettingsDialogProps) {
  const { settings, setTextSize, toggle, reset } = useAccessibility()

  const titleId = useId()
  const subtitleId = useId()
  const sizeLabelId = useId()

  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const sizeRefs = useRef<Array<HTMLButtonElement | null>>([])
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) {
      return
    }

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow

    closeRef.current?.focus()
    document.body.style.overflow = 'hidden'

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) {
        return
      }

      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (focusable.length === 0) {
        event.preventDefault()
        panelRef.current.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      // Safari does not focus a button on click, so fall back to the sidebar
      // trigger by attribute when there is nothing useful to restore.
      const returnTarget =
        previouslyFocused &&
        previouslyFocused !== document.body &&
        document.contains(previouslyFocused)
          ? previouslyFocused
          : document.querySelector<HTMLElement>('[data-a11y-settings-trigger]')
      returnTarget?.focus()
    }
  }, [open])

  if (!open) {
    return null
  }

  function handleSizeKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = TEXT_SIZE_STEPS.indexOf(settings.textSize)
    let next: number
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = (current + 1) % TEXT_SIZE_STEPS.length
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        next = (current - 1 + TEXT_SIZE_STEPS.length) % TEXT_SIZE_STEPS.length
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = TEXT_SIZE_STEPS.length - 1
        break
      default:
        return
    }
    event.preventDefault()
    const size: TextSize = TEXT_SIZE_STEPS[next]
    setTextSize(size)
    sizeRefs.current[next]?.focus()
  }

  return (
    <div className="dialog-root">
      <div
        className="dialog-backdrop"
        aria-hidden="true"
        onClick={() => onCloseRef.current()}
      />
      <div
        ref={panelRef}
        className="dialog a11y-settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitleId}
        tabIndex={-1}
      >
        <header className="a11y-settings__header">
          <div>
            <h2 id={titleId} className="a11y-settings__title">
              Accessibility
            </h2>
            <p id={subtitleId} className="a11y-settings__subtitle">
              Adjust the display to your needs. Changes apply immediately to every page and are
              remembered on this device.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="dialog__close"
            aria-label="Close accessibility settings"
            onClick={() => onCloseRef.current()}
          >
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className="a11y-settings__body">
          <div className="a11y-settings__group">
            <p id={sizeLabelId} className="a11y-settings__group-label">
              Text size
            </p>
            <div
              className="a11y-settings__sizes"
              role="radiogroup"
              aria-labelledby={sizeLabelId}
              onKeyDown={handleSizeKeyDown}
            >
              {TEXT_SIZE_STEPS.map((size, index) => {
                const selected = settings.textSize === size
                return (
                  <button
                    key={size}
                    ref={(node) => {
                      sizeRefs.current[index] = node
                    }}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    tabIndex={selected ? 0 : -1}
                    className={`a11y-settings__size${selected ? ' a11y-settings__size--active' : ''}`}
                    onClick={() => setTextSize(size)}
                  >
                    <span
                      className={`a11y-settings__size-glyph a11y-settings__size-glyph--${size}`}
                      aria-hidden="true"
                    >
                      Aa
                    </span>
                    <span className="a11y-settings__size-label">{TEXT_SIZE_LABELS[size]}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="a11y-settings__switches">
            {SWITCHES.map((item) => (
              <SwitchRow
                key={item.key}
                icon={item.icon}
                title={item.title}
                description={item.description}
                checked={settings[item.key]}
                onChange={() => toggle(item.key)}
              />
            ))}
          </div>
        </div>

        <footer className="a11y-settings__footer">
          <Button variant="ghost" size="sm" onClick={reset}>
            Reset to defaults
          </Button>
          <Button size="sm" onClick={() => onCloseRef.current()}>
            Done
          </Button>
        </footer>
      </div>
    </div>
  )
}

interface SwitchRowProps {
  icon: IconName
  title: string
  description: string
  checked: boolean
  onChange: () => void
}

/**
 * A real `<button>` with `role="switch"`: Enter and Space both activate it,
 * the title is the accessible name, the description is the description, and
 * the state is spelled out by `aria-checked` rather than colour alone.
 */
function SwitchRow({ icon, title, description, checked, onChange }: SwitchRowProps) {
  const id = useId()
  const titleId = `${id}-title`
  const descriptionId = `${id}-description`

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className={`a11y-settings__switch-row${checked ? ' a11y-settings__switch-row--on' : ''}`}
      onClick={onChange}
    >
      <span className="a11y-settings__switch-icon" aria-hidden="true">
        <Icon name={icon} size={18} />
      </span>
      <span className="a11y-settings__switch-text">
        <span id={titleId} className="a11y-settings__switch-title">
          {title}
        </span>
        <span id={descriptionId} className="a11y-settings__switch-description">
          {description}
        </span>
      </span>
      <span className="a11y-settings__track" aria-hidden="true">
        <span className="a11y-settings__thumb" />
      </span>
    </button>
  )
}

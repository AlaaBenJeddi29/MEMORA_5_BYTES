import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { Button } from './Button'
import { TEXT_SIZE_LABELS, TEXT_SIZE_STEPS, type TextSize } from '../utils/accessibilityPreferences'
import {
  announce,
  type Announcement,
  getLatestAnnouncement,
  subscribeToAnnouncements,
} from '../utils/announcements'
import { type ToggleableKey, useAccessibilityPreferences } from '../hooks/useAccessibilityPreferences'

/**
 * AccessibilityWidget — the floating accessibility menu (♿).
 *
 * A fixed round trigger in the bottom corner of the screen, mounted by a page
 * (`features/audio/pages/AudioListPage.tsx` today) but reusable anywhere: every
 * option is written as a `data-a11y-*` attribute on `<html>` and styled in
 * `styles/global.css`, so it restyles the whole document — not only this panel.
 *
 * Accessibility contract (WCAG 2.2 AA):
 *   - the trigger is a real `<button>`: reachable with Tab, activated with Enter
 *     and Space, named "Open the accessibility menu", carrying `aria-expanded`
 *     and `aria-controls`;
 *   - every option is a button as well (`role="switch"` + `aria-checked`, or a
 *     pressed text-size chip), so Enter and Space both work everywhere and the
 *     state is spelled out ("On"/"Off") instead of relying on colour;
 *   - Escape closes the panel and hands focus back to the trigger;
 *   - a polite live region repeats what happened, and shows it as a caption.
 *
 * Labels follow the app's English UI, like the rest of the audio module.
 */

const PANEL_ID = 'accessibility-panel'
const PANEL_TITLE_ID = 'accessibility-panel-title'

/** Alt+Shift + letter, listed in the panel so the help and the code never drift apart. */
const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: 'Alt + Shift + A', action: 'Open or close this menu' },
  { keys: 'Alt + Shift + T', action: 'Cycle the text size A− / A / A+' },
  { keys: 'Alt + Shift + C', action: 'Toggle high contrast' },
  { keys: 'Alt + Shift + D', action: 'Toggle dark mode' },
  { keys: 'Alt + Shift + K', action: 'Toggle the visible focus ring' },
  { keys: 'Alt + Shift + R', action: 'Toggle screen-reader announcements' },
  { keys: 'Escape', action: 'Close this menu' },
]

const SHORTCUT_ACTIONS: Record<string, ToggleableKey | 'panel' | 'cycle'> = {
  A: 'panel',
  T: 'cycle',
  C: 'highContrast',
  D: 'darkMode',
  K: 'keyboardFocus',
  R: 'screenReaderHelp',
}

const TEXT_SIZE_DESCRIPTIONS: Record<TextSize, string> = {
  sm: 'Smaller text',
  md: 'Default text size',
  lg: 'Larger text',
}

/** True when the keystroke belongs to a field the user is typing in. */
function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  if (!element || typeof element.tagName !== 'string') {
    return false
  }
  const tag = element.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    return true
  }
  // `isContentEditable` is the spec answer; the attribute walk also works where
  // the property is missing and covers a block that inherits it.
  return (
    element.isContentEditable === true ||
    Boolean(element.closest('[contenteditable]:not([contenteditable="false"])'))
  )
}

export function AccessibilityWidget() {
  const { preferences, setTextSize, cycleTextSize, toggle, reset } = useAccessibilityPreferences()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const announcement: Announcement | null = useSyncExternalStore(
    subscribeToAnnouncements,
    getLatestAnnouncement,
    getLatestAnnouncement,
  )

  // Announce open/close without doing it on the first render (StrictMode
  // included: a null "previous" is only ever compared once).
  const previousOpen = useRef<boolean | null>(null)
  useEffect(() => {
    const before = previousOpen.current
    previousOpen.current = open
    if (before === null || before === open) return
    announce(open ? 'Accessibility menu opened' : 'Accessibility menu closed')
  }, [open])

  useEffect(() => {
    if (!open) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open])

  // A click outside closes the panel, exactly like the trigger's second click.
  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null
      if (!target) return
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
    }
  }, [open])

  // Global shortcuts, registered here because opening the menu is this
  // component's own state and each option must work while the menu is closed.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) return
      // Never steal a keystroke from a field being typed in (the transcript
      // editor, the login form…). Escape still closes the menu from anywhere.
      if (isTypingTarget(event.target)) return
      const action = SHORTCUT_ACTIONS[event.key.toUpperCase()]
      if (!action) return
      event.preventDefault()
      if (action === 'panel') {
        setOpen((current) => !current)
        return
      }
      if (action === 'cycle') {
        cycleTextSize()
        return
      }
      toggle(action)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [cycleTextSize, toggle])

  function closeAndRefocus() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <div className="a11y-widget">
      {/* Always mounted: an option switched on has to be announced right away,
          and an empty polite region stays silent. */}
      <div className="a11y-widget__live sr-only" role="status" aria-live="polite" aria-atomic="true">
        {preferences.screenReaderHelp && announcement ? (
          <span key={announcement.id}>{announcement.text}</span>
        ) : null}
      </div>

      <button
        ref={triggerRef}
        type="button"
        className="a11y-trigger"
        aria-expanded={open}
        aria-controls={PANEL_ID}
        aria-label={open ? 'Close the accessibility menu' : 'Open the accessibility menu'}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="a11y-trigger__icon" aria-hidden="true">
          ♿
        </span>
      </button>

      {open && (
        <div
          ref={panelRef}
          id={PANEL_ID}
          className="a11y-panel"
          role="region"
          aria-labelledby={PANEL_TITLE_ID}
        >
          <div className="a11y-panel__head">
            <h2 id={PANEL_TITLE_ID} className="a11y-panel__title">
              Accessibility
            </h2>
            <Button variant="ghost" size="sm" onClick={closeAndRefocus}>
              Close
            </Button>
          </div>

          {preferences.screenReaderHelp && announcement && (
            <p className="a11y-panel__caption">{announcement.text}</p>
          )}

          <div className="a11y-panel__group" role="group" aria-labelledby="a11y-text-size-label">
            <p id="a11y-text-size-label" className="a11y-panel__label">
              Text size
            </p>
            <div className="a11y-panel__row">
              {TEXT_SIZE_STEPS.map((size) => {
                const active = preferences.textSize === size
                return (
                  <button
                    key={size}
                    type="button"
                    className={`a11y-chip${active ? ' a11y-chip--active' : ''}`}
                    aria-pressed={active}
                    onClick={() => setTextSize(size)}
                  >
                    <span aria-hidden="true">{TEXT_SIZE_LABELS[size]}</span>
                    <span className="sr-only">{TEXT_SIZE_DESCRIPTIONS[size]}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <A11ySwitch
            label="High contrast"
            hint="Dark text on white, thick borders"
            checked={preferences.highContrast}
            onChange={() => toggle('highContrast')}
          />
          <A11ySwitch
            label="Dark mode"
            hint="Dark surfaces, light text"
            checked={preferences.darkMode}
            onChange={() => toggle('darkMode')}
          />
          <A11ySwitch
            label="Keyboard navigation"
            hint="Thick ring around the focused control; Tab, Enter and Space work on every button here"
            checked={preferences.keyboardFocus}
            onChange={() => toggle('keyboardFocus')}
          />
          <A11ySwitch
            label="Screen-reader support"
            hint="Announce option changes and important page messages"
            checked={preferences.screenReaderHelp}
            onChange={() => toggle('screenReaderHelp')}
          />

          <div className="a11y-panel__group" role="group" aria-labelledby="a11y-shortcuts-label">
            <p id="a11y-shortcuts-label" className="a11y-panel__label">
              Keyboard shortcuts
            </p>
            <ul className="a11y-panel__shortcuts">
              {SHORTCUTS.map((shortcut) => (
                <li key={shortcut.keys} className="a11y-panel__shortcut">
                  <kbd className="a11y-panel__kbd">{shortcut.keys}</kbd>
                  <span>{shortcut.action}</span>
                </li>
              ))}
            </ul>
            <p className="a11y-panel__hint">
              Hold Alt and Shift, then press the letter. They work while this menu is closed
              too, except inside a field you are typing in.
            </p>
          </div>

          <Button variant="secondary" size="sm" onClick={reset}>
            Reset to my system defaults
          </Button>
        </div>
      )}
    </div>
  )
}

interface A11ySwitchProps {
  label: string
  hint: string
  checked: boolean
  onChange: () => void
}

/**
 * A `role="switch"` built on a `<button>`: unlike a checkbox it activates on
 * Enter as well as Space. The label is the accessible name, the hint is the
 * description (so screen readers do not read a whole sentence as the name), and
 * the state is written next to it instead of relying on colour.
 */
function A11ySwitch({ label, hint, checked, onChange }: A11ySwitchProps) {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const labelId = `a11y-switch-${slug}`
  const hintId = `${labelId}-hint`
  return (
    <div className="a11y-panel__group">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={hintId}
        className={`a11y-switch${checked ? ' a11y-switch--on' : ''}`}
        onClick={onChange}
      >
        <span className="a11y-switch__track" aria-hidden="true">
          <span className="a11y-switch__thumb" />
        </span>
        <span className="a11y-switch__text">
          <span id={labelId} className="a11y-switch__label">
            {label}
          </span>
          <span id={hintId} className="a11y-switch__hint">
            {hint}
          </span>
        </span>
        <span className="a11y-switch__state">{checked ? 'On' : 'Off'}</span>
      </button>
    </div>
  )
}

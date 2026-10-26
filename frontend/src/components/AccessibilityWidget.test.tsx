import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

import { AccessibilityWidget } from './AccessibilityWidget'
import { A11Y_ATTRIBUTES, STORAGE_KEY } from '../utils/accessibilityPreferences'
import { clearAnnouncement } from '../utils/announcements'

/** @testing-library/jest-dom is not part of this project: matchers inlined. */
function expectAttr(el: Element, name: string, value: string) {
  expect(el.getAttribute(name)).toBe(value)
}

function attr(name: string): string | undefined {
  return document.documentElement.dataset[name]
}

function trigger(): HTMLButtonElement {
  return screen.getByRole('button', { name: /accessibility menu$/i }) as HTMLButtonElement
}

function openMenu() {
  fireEvent.click(trigger())
  return screen.getByRole('region', { name: 'Accessibility' })
}

function switchFor(label: string): HTMLButtonElement {
  return within(screen.getByRole('region', { name: 'Accessibility' })).getByRole('switch', {
    name: new RegExp(label, 'i'),
  }) as HTMLButtonElement
}

function pressShortcut(key: string) {
  fireEvent.keyDown(window, { key, altKey: true, shiftKey: true })
}

beforeEach(() => {
  localStorage.clear()
  clearAnnouncement()
  for (const name of Object.values(A11Y_ATTRIBUTES)) {
    delete document.documentElement.dataset[name]
  }
})

afterEach(() => {
  vi.unstubAllGlobals()
  for (const name of Object.values(A11Y_ATTRIBUTES)) {
    delete document.documentElement.dataset[name]
  }
})

describe('the floating trigger', () => {
  it('is a keyboard-reachable button with an accessible name and aria-expanded', () => {
    render(<AccessibilityWidget />)
    const button = trigger()
    expect(button.type).toBe('button')
    expectAttr(button, 'aria-expanded', 'false')
    expect(button.getAttribute('aria-controls')).toBe('accessibility-panel')
    expect(screen.queryByRole('region', { name: 'Accessibility' })).toBeNull()
  })

  it('opens on the first click and closes on the second', () => {
    render(<AccessibilityWidget />)
    fireEvent.click(trigger())
    expectAttr(trigger(), 'aria-expanded', 'true')
    expect(trigger().getAttribute('aria-label')).toBe('Close the accessibility menu')
    expect(screen.getByRole('region', { name: 'Accessibility' })).toBeTruthy()

    fireEvent.click(trigger())
    expectAttr(trigger(), 'aria-expanded', 'false')
    expect(screen.queryByRole('region', { name: 'Accessibility' })).toBeNull()
  })

  it('closes with the Close button and gives the focus back to the trigger', () => {
    render(<AccessibilityWidget />)
    const panel = openMenu()
    fireEvent.click(within(panel).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('region', { name: 'Accessibility' })).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  it('closes on Escape', () => {
    render(<AccessibilityWidget />)
    openMenu()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('region', { name: 'Accessibility' })).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  it('closes when the user clicks outside of it', () => {
    render(<AccessibilityWidget />)
    openMenu()
    const outside = document.createElement('p')
    document.body.appendChild(outside)
    fireEvent.mouseDown(outside)
    expect(screen.queryByRole('region', { name: 'Accessibility' })).toBeNull()
    outside.remove()
  })

  it('is reachable with Alt+Shift+A even while the menu is closed', () => {
    render(<AccessibilityWidget />)
    pressShortcut('A')
    expectAttr(trigger(), 'aria-expanded', 'true')
    pressShortcut('A')
    expectAttr(trigger(), 'aria-expanded', 'false')
  })
})

describe('option 1 — text size', () => {
  it('really changes the document: A+ scales the root, A leaves it alone', () => {
    render(<AccessibilityWidget />)
    const panel = openMenu()

    fireEvent.click(within(panel).getByRole('button', { name: /larger text/i }))
    expect(attr(A11Y_ATTRIBUTES.textSize)).toBe('lg')
    expectAttr(within(panel).getByRole('button', { name: /larger text/i }), 'aria-pressed', 'true')

    fireEvent.click(within(panel).getByRole('button', { name: /default text size/i }))
    expect(attr(A11Y_ATTRIBUTES.textSize)).toBeUndefined()
  })

  it('cycles A− → A → A+ with Alt+Shift+T', () => {
    render(<AccessibilityWidget />)
    pressShortcut('T')
    expect(attr(A11Y_ATTRIBUTES.textSize)).toBe('lg')
    pressShortcut('T')
    expect(attr(A11Y_ATTRIBUTES.textSize)).toBe('sm')
    pressShortcut('T')
    expect(attr(A11Y_ATTRIBUTES.textSize)).toBeUndefined()
  })
})

describe('options 2 to 5 — switches', () => {
  it('high contrast, dark mode and focus highlight each restyle the document', () => {
    render(<AccessibilityWidget />)
    const panel = openMenu()

    fireEvent.click(switchFor('High contrast'))
    expect(attr(A11Y_ATTRIBUTES.contrast)).toBe('high')
    expectAttr(switchFor('High contrast'), 'aria-checked', 'true')
    expect(within(switchFor('High contrast')).getByText('On')).toBeTruthy()

    fireEvent.click(switchFor('Dark mode'))
    expect(attr(A11Y_ATTRIBUTES.theme)).toBe('dark')

    fireEvent.click(switchFor('Keyboard navigation'))
    expect(attr(A11Y_ATTRIBUTES.focus)).toBe('enhanced')

    // Turning one off again removes its attribute.
    fireEvent.click(switchFor('Dark mode'))
    expect(attr(A11Y_ATTRIBUTES.theme)).toBeUndefined()
    expect(panel).toBeTruthy()
  })

  it('screen-reader support announces the change in the polite live region', () => {
    render(<AccessibilityWidget />)
    const live = screen.getByRole('status')
    expectAttr(live, 'aria-live', 'polite')

    openMenu()
    fireEvent.click(switchFor('Screen-reader support'))
    expect(attr(A11Y_ATTRIBUTES.screenReader)).toBe('on')
    expect(live.textContent).toContain('Screen-reader announcements on')

    // And the caption repeats it visibly, so the option is not sound-only.
    expect(screen.getAllByText('Screen-reader announcements on')).toHaveLength(2)
  })

  it('keeps every option activatable with Enter and Space: all controls are native buttons', () => {
    render(<AccessibilityWidget />)
    const panel = openMenu()
    const controls = panel.querySelectorAll('button, a, input, select, textarea')
    expect(controls.length).toBeGreaterThan(5)
    for (const control of controls) {
      expect(control.tagName).toBe('BUTTON')
      expect((control as HTMLButtonElement).type).toBe('button')
    }
  })
})

describe('option 6 — shortcuts help', () => {
  it('explains the shortcuts it actually implements', () => {
    render(<AccessibilityWidget />)
    const panel = openMenu()
    const group = within(panel).getByRole('group', { name: /keyboard shortcuts/i })
    expect(within(group).getAllByText(/Alt \+ Shift/).length).toBeGreaterThanOrEqual(6)
    expect(within(group).getByText('Close this menu')).toBeTruthy()
  })
})

describe('shortcuts work from anywhere, page included', () => {
  it('Alt+Shift+C, D, K and R toggle their option', () => {
    render(<AccessibilityWidget />)
    pressShortcut('C')
    expect(attr(A11Y_ATTRIBUTES.contrast)).toBe('high')
    pressShortcut('D')
    expect(attr(A11Y_ATTRIBUTES.theme)).toBe('dark')
    pressShortcut('K')
    expect(attr(A11Y_ATTRIBUTES.focus)).toBe('enhanced')
    pressShortcut('R')
    expect(attr(A11Y_ATTRIBUTES.screenReader)).toBe('on')
  })

  it('ignores a plain keystroke typed in the page', () => {
    render(<AccessibilityWidget />)
    const input = document.createElement('input')
    document.body.appendChild(input)
    fireEvent.keyDown(input, { key: 'd' })
    fireEvent.keyDown(input, { key: 'D', ctrlKey: true })
    expect(attr(A11Y_ATTRIBUTES.theme)).toBeUndefined()
    input.remove()
  })

  it('never steals a shortcut from a field the user is typing in', () => {
    render(<AccessibilityWidget />)
    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)

    // Alt+Shift+D is the dark-mode shortcut — but here it is a typed character.
    fireEvent.keyDown(textarea, { key: 'D', altKey: true, shiftKey: true })
    expect(attr(A11Y_ATTRIBUTES.theme)).toBeUndefined()

    fireEvent.keyDown(textarea, { key: 'T', altKey: true, shiftKey: true })
    expect(attr(A11Y_ATTRIBUTES.textSize)).toBeUndefined()

    // Outside the field, the same keystroke works.
    fireEvent.keyDown(window, { key: 'D', altKey: true, shiftKey: true })
    expect(attr(A11Y_ATTRIBUTES.theme)).toBe('dark')
    textarea.remove()
  })

  it('ignores the shortcuts inside a contenteditable block and while Ctrl is held', () => {
    render(<AccessibilityWidget />)
    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')
    document.body.appendChild(editable)

    fireEvent.keyDown(editable, { key: 'C', altKey: true, shiftKey: true })
    expect(attr(A11Y_ATTRIBUTES.contrast)).toBeUndefined()

    fireEvent.keyDown(window, { key: 'C', altKey: true, shiftKey: true, ctrlKey: true })
    expect(attr(A11Y_ATTRIBUTES.contrast)).toBeUndefined()
    editable.remove()
  })

  it('still closes the menu with Escape from inside a field', () => {
    render(<AccessibilityWidget />)
    openMenu()
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('region', { name: 'Accessibility' })).toBeNull()
    input.remove()
  })
})

describe('the widget itself is not a source of focus loss', () => {
  it('does not drag the focus into the panel when it opens', () => {
    render(<AccessibilityWidget />)
    fireEvent.click(trigger())
    const panel = screen.getByRole('region', { name: 'Accessibility' })
    expect(panel.contains(document.activeElement)).toBe(false)
  })
})

describe('persistence', () => {
  it('remembers the choices for the next visit', () => {
    const first = render(<AccessibilityWidget />)
    openMenu()
    fireEvent.click(switchFor('Dark mode'))
    fireEvent.click(within(screen.getByRole('region', { name: 'Accessibility' })).getByRole('button', { name: /larger text/i }))
    first.unmount()

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toMatchObject({
      darkMode: true,
      textSize: 'lg',
    })

    render(<AccessibilityWidget />)
    openMenu()
    expectAttr(switchFor('Dark mode'), 'aria-checked', 'true')
    expect(attr(A11Y_ATTRIBUTES.theme)).toBe('dark')
    expect(attr(A11Y_ATTRIBUTES.textSize)).toBe('lg')
  })

  it('reset goes back to the system defaults', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-color-scheme: dark)',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    )
    render(<AccessibilityWidget />)
    openMenu()
    fireEvent.click(switchFor('High contrast'))
    expect(attr(A11Y_ATTRIBUTES.contrast)).toBe('high')

    fireEvent.click(
      within(screen.getByRole('region', { name: 'Accessibility' })).getByRole('button', {
        name: /reset to my system defaults/i,
      }),
    )
    expect(attr(A11Y_ATTRIBUTES.contrast)).toBeUndefined()
    expect(attr(A11Y_ATTRIBUTES.theme)).toBe('dark')
  })
})

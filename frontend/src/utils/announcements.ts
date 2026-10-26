/**
 * A tiny cross-module announcement bus for assistive technology.
 *
 * `components/AccessibilityWidget.tsx` renders one polite live region fed by
 * this store, so any module can surface a message that matters ("analysis
 * finished", "saved in your journal") without each page inventing its own live
 * region — and without spamming screen readers for users who did not ask for
 * extra announcements.
 *
 * It is deliberately external-store shaped so React can subscribe with
 * `useSyncExternalStore`, and so plain modules (and tests) can call `announce`.
 */

export interface Announcement {
  /** Monotonic id: two identical messages in a row still re-render the live region. */
  id: number
  text: string
}

let latest: Announcement | null = null
let counter = 0
const listeners = new Set<() => void>()

export function announce(text: string): void {
  const trimmed = text.trim()
  if (!trimmed) {
    return
  }
  counter += 1
  latest = { id: counter, text: trimmed }
  for (const listener of listeners) {
    listener()
  }
}

export function getLatestAnnouncement(): Announcement | null {
  return latest
}

export function clearAnnouncement(): void {
  if (latest === null) {
    return
  }
  latest = null
  for (const listener of listeners) {
    listener()
  }
}

export function subscribeToAnnouncements(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

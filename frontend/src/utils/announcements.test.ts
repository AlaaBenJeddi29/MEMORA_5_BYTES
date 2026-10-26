import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  announce,
  clearAnnouncement,
  getLatestAnnouncement,
  subscribeToAnnouncements,
} from './announcements'

beforeEach(() => {
  clearAnnouncement()
})

describe('announce', () => {
  it('keeps the latest message for late subscribers', () => {
    announce('Dark mode on')
    expect(getLatestAnnouncement()?.text).toBe('Dark mode on')
  })

  it('ignores an empty message', () => {
    announce('   ')
    expect(getLatestAnnouncement()).toBeNull()
  })

  it('gives every message a new id, so a repeated sentence is read again', () => {
    announce('High contrast on')
    const first = getLatestAnnouncement()?.id
    announce('High contrast on')
    expect(getLatestAnnouncement()?.id).not.toBe(first)
  })

  it('notifies subscribers and stops after unsubscribing', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeToAnnouncements(listener)

    announce('Text size A+')
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    announce('Text size A')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('clearAnnouncement leaves nothing behind', () => {
    announce('Dark mode on')
    clearAnnouncement()
    expect(getLatestAnnouncement()).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'

import { safeRedirectPath } from './redirect'

describe('safeRedirectPath', () => {
  it('keeps a normal in-app path', () => {
    expect(safeRedirectPath('/app/journal')).toBe('/app/journal')
  })

  it('preserves query strings on in-app paths', () => {
    expect(safeRedirectPath('/app/journal?page=2')).toBe('/app/journal?page=2')
  })

  it('falls back when the value is missing or not a string', () => {
    expect(safeRedirectPath(undefined)).toBe('/app')
    expect(safeRedirectPath(null)).toBe('/app')
    expect(safeRedirectPath(42)).toBe('/app')
    expect(safeRedirectPath('')).toBe('/app')
  })

  it('rejects absolute URLs to other origins', () => {
    expect(safeRedirectPath('https://evil.example.com')).toBe('/app')
    expect(safeRedirectPath('http://evil.example.com/app')).toBe('/app')
  })

  it('rejects protocol-relative URLs', () => {
    expect(safeRedirectPath('//evil.example.com')).toBe('/app')
  })

  it('rejects backslash tricks that browsers treat as slashes', () => {
    expect(safeRedirectPath('/\\evil.example.com')).toBe('/app')
    expect(safeRedirectPath('/app\\..\\..')).toBe('/app')
  })

  it('rejects values that do not start with a slash', () => {
    expect(safeRedirectPath('app/journal')).toBe('/app')
  })

  it('honours a custom fallback', () => {
    expect(safeRedirectPath('https://evil.example.com', '/login')).toBe('/login')
  })
})

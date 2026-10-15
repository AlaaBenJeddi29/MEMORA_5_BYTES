import { describe, expect, it } from 'vitest'

import { getCookie, getCsrfToken } from './csrf'

describe('csrf helpers', () => {
  it('returns null when the cookie is absent', () => {
    expect(getCookie('definitely-not-set')).toBeNull()
  })

  it('reads and decodes a cookie value', () => {
    document.cookie = 'csrftoken=abc123'

    expect(getCsrfToken()).toBe('abc123')
  })

  it('decodes URL-encoded values', () => {
    document.cookie = 'token=a%20b%2Fc'

    expect(getCookie('token')).toBe('a b/c')
  })
})

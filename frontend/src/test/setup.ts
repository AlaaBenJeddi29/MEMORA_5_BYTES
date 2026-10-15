import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// React Testing Library only auto-registers cleanup when test globals exist,
// so register it explicitly for this globals-free setup.
afterEach(() => {
  cleanup()
})

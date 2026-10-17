// Test setup for Vitest (jsdom).
import { vi } from 'vitest'

// matchMedia is not implemented in jsdom but is used
// by the app (theme + reduced-motion checks).
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }))
})

// requestAnimationFrame drives a few transitions.
global.requestAnimationFrame = vi.fn((cb) => setTimeout(cb, 16))
global.cancelAnimationFrame = vi.fn((id) => clearTimeout(id))

// Keep test output readable: drop Vue/Alpine-style
// "Warning:" noise unless a test asks for it.
const originalError = console.error
console.error = (...args) => {
  if (args[0]?.includes?.('Warning:')) return
  originalError.call(console, ...args)
}

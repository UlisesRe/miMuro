import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { initToast } from './toast.js'

// Minimal stand-in for the Alpine global: the store
// registry is all initToast touches.
function fakeAlpine() {
  const stores = {}
  return {
    stores,
    store(name, value) {
      stores[name] = value
      return value
    }
  }
}

function mountToast() {
  const Alpine = fakeAlpine()
  initToast(Alpine)
  return Alpine.stores.toast
}

describe('toast store', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('queues a notification with the requested type', () => {
    const toast = mountToast()

    toast.success('Listo')

    expect(toast.notifications).toHaveLength(1)
    expect(toast.notifications[0]).toMatchObject({ message: 'Listo', type: 'success' })
  })

  it('dismisses a notification by id', () => {
    const toast = mountToast()

    const id = toast.show('Hola')
    expect(toast.notifications).toHaveLength(1)

    toast.dismiss(id)
    expect(toast.notifications).toHaveLength(0)
  })

  it('dismisses automatically once the duration elapses', () => {
    const toast = mountToast()

    toast.info('Después desaparezco', 1000)
    expect(toast.notifications).toHaveLength(1)

    vi.advanceTimersByTime(1000)
    expect(toast.notifications).toHaveLength(0)
  })

  it('never auto-dismisses when the duration is zero', () => {
    const toast = mountToast()

    toast.show('Me quedo', 'info', 0)
    vi.advanceTimersByTime(10_000)

    expect(toast.notifications).toHaveLength(1)
  })
})

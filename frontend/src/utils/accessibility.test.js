import { describe, it, expect, beforeEach, vi } from 'vitest'

import { openModal, closeModal, closeAllModals, trapFocus } from './accessibility.js'

// jsdom no implementa `offsetParent`, que el helper usa para filtrar
// elementos ocultos. Se fuerza a que todo esté "visible".
beforeEach(() => {
  closeAllModals()
  document.body.innerHTML = ''
  document.body.style.overflow = ''
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get() {
      return this.parentElement
    }
  })
})

function makeModal() {
  const opener = document.createElement('button')
  opener.textContent = 'Abrir'
  document.body.appendChild(opener)
  opener.focus()

  const modal = document.createElement('div')
  modal.className = 'modal'
  modal.innerHTML = `
    <div class="modal__panel">
      <button id="first">Primero</button>
      <button id="last">Último</button>
    </div>`
  document.body.appendChild(modal)

  const context = {
    $refs: { testPanel: modal.querySelector('.modal__panel') },
    $nextTick: (fn) => fn()
  }
  return { opener, modal, context, panel: context.$refs.testPanel }
}

describe('openModal / closeModal', () => {
  it('bloquea el scroll del fondo y enfoca el panel', () => {
    const { context, panel } = makeModal()
    openModal(context, 'test')

    expect(document.body.style.overflow).toBe('hidden')
    expect(document.activeElement).toBe(panel.querySelector('#first'))
  })

  it('al cerrar restaura el foco y libera el scroll', () => {
    const { context, opener } = makeModal()
    openModal(context, 'test')
    closeModal(context, 'test')

    expect(document.body.style.overflow).toBe('')
    expect(document.activeElement).toBe(opener)
  })

  it('respeta el foco inicial indicado', () => {
    const { context, panel } = makeModal()
    const target = panel.querySelector('#last')
    openModal(context, 'test', { initialFocus: () => target })

    expect(document.activeElement).toBe(target)
  })

  it('cierra el último modal sin tocar el scroll si queda otro abierto', () => {
    const { context: first } = makeModal()
    const { context: second } = makeModal()
    openModal(first, 'test')
    openModal(second, 'test')

    closeModal(second, 'test')
    expect(document.body.style.overflow).toBe('hidden')

    closeModal(first, 'test')
    expect(document.body.style.overflow).toBe('')
  })
})

describe('trapFocus', () => {
  it('desde el último elemento envuelve al primero con Tab', () => {
    const { panel } = makeModal()
    const first = panel.querySelector('#first')
    const last = panel.querySelector('#last')
    last.focus()

    const event = { key: 'Tab', shiftKey: false, preventDefault: vi.fn() }
    trapFocus(event, panel)

    expect(event.preventDefault).toHaveBeenCalled()
    expect(document.activeElement).toBe(first)
  })

  it('desde el primero va al último con Shift+Tab', () => {
    const { panel } = makeModal()
    const first = panel.querySelector('#first')
    const last = panel.querySelector('#last')
    first.focus()

    const event = { key: 'Tab', shiftKey: true, preventDefault: vi.fn() }
    trapFocus(event, panel)

    expect(event.preventDefault).toHaveBeenCalled()
    expect(document.activeElement).toBe(last)
  })

  it('no interfiere con otras teclas', () => {
    const { panel } = makeModal()
    const event = { key: 'Escape', shiftKey: false, preventDefault: vi.fn() }
    trapFocus(event, panel)
    expect(event.preventDefault).not.toHaveBeenCalled()
  })
})

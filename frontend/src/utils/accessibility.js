// ========================================
// miMuro - Accesibilidad para diálogos
//
// Los modales del proyecto usan `role="dialog"`/`alertdialog` y
// `aria-modal="true"`, pero eso solo es una promesa si el foco queda
// atrapado dentro y el fondo se marca como inerte. Este módulo concentra
// esa mecánica para no repetirla en cada modal.
//
// Uso típico en un componente Alpine:
//
//   import { openModal, closeModal } from '../utils/accessibility.js'
//
//   openModal(this, 'create')            // al mostrar
//   closeModal(this, 'create')           // al cerrar
//   trapFocus(event, this.$refs.panel)   // en @keydown.tab
// ========================================

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',')

// Guardamos, por elemento, la clave con la que se abrió: el último modal
// abierto es el que corre el trap y el que devuelve el foco al cerrar.
const openStack = []

function focusableElements(root) {
  if (!root) return []
  return Array.from(root.querySelectorAll(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('disabled') && el.offsetParent !== null
  )
}

// Abre un modal: guarda el elemento que tenía el foco para devolvérselo
// al cerrar y bloquea el scroll del fondo. El foco queda atrapado con
// `trapFocus` (los modales llevan `aria-modal`, que ya oculta el resto
// para los lectores de pantalla).
export function openModal(context, key, { initialFocus } = {}) {
  const panel = context.$refs?.[`${key}Panel`] || null
  const entry = {
    key,
    panel,
    opener: document.activeElement instanceof HTMLElement ? document.activeElement : null,
    previousOverflow: document.body.style.overflow
  }
  openStack.push(entry)
  document.body.style.overflow = 'hidden'

  // Enfocar el primer elemento útil del panel (o el que se indique).
  context.$nextTick?.(() => {
    const target = initialFocus?.() || focusableElements(panel)[0] || panel
    target?.focus?.({ preventScroll: true })
  })
}

// Cierra un modal: restaura el foco y desbloquea el scroll.
export function closeModal(context, key) {
  const index = [...openStack].reverse().findIndex((entry) => entry.key === key)
  if (index === -1) return
  const entry = openStack.splice(openStack.length - 1 - index, 1)[0]

  if (openStack.length === 0) {
    document.body.style.overflow = entry.previousOverflow
  }

  const opener = entry.opener
  if (opener && document.contains(opener)) {
    context.$nextTick?.(() => opener.focus({ preventScroll: true }))
  }
}

// Cierra todos los modales abiertos (por ejemplo al cambiar de ruta) y
// libera el scroll. Es también el punto de limpieza para los tests.
export function closeAllModals() {
  openStack.length = 0
  document.body.style.overflow = ''
}

// Atrapa el Tab dentro del panel: al llegar al final vuelve al principio
// (y con Shift+Tab al revés). Se engancha en `@keydown.tab` del modal.
export function trapFocus(event, panel) {
  if (event.key !== 'Tab' || !panel) return
  const items = focusableElements(panel)
  if (items.length === 0) {
    event.preventDefault()
    return
  }

  const first = items[0]
  const last = items[items.length - 1]
  const active = document.activeElement

  if (event.shiftKey && (active === first || !panel.contains(active))) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

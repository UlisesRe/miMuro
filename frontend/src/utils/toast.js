// ========================================
// miMuro - Toast Notification System
//
// Single source of truth for user feedback.
// Everything routes through the `toast` store
// so there is one queue and one renderer.
// ========================================

import { TOAST_ICONS } from './icons.js'

export function initToast(Alpine) {
  Alpine.store('toast', {
    notifications: [],
    icons: TOAST_ICONS,

    show(message, type = 'info', duration = 4500) {
      const id = Date.now() + Math.random()
      this.notifications.push({ id, message, type, icon: TOAST_ICONS[type] || TOAST_ICONS.info })

      if (duration > 0) {
        setTimeout(() => this.dismiss(id), duration)
      }

      return id
    },

    dismiss(id) {
      this.notifications = this.notifications.filter((n) => n.id !== id)
    },

    clear() {
      this.notifications = []
    },

    success(message, duration) {
      return this.show(message, 'success', duration)
    },

    error(message, duration) {
      // Errors stay longer: they usually need reading.
      return this.show(message, 'error', duration ?? 6000)
    },

    warning(message, duration) {
      return this.show(message, 'warning', duration)
    },

    info(message, duration) {
      return this.show(message, 'info', duration)
    }
  })
}
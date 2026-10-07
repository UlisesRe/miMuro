// ========================================
// miMuro - Auth Hook
// ========================================

import { api } from '../services/api.js'

// "Recordarme" decides where the token lives, so both
// stores have to be read when restoring a session.
function getStoredToken() {
  return localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token')
}

function clearStoredTokens() {
  localStorage.removeItem('auth_token')
  localStorage.removeItem('refresh_token')
  sessionStorage.removeItem('auth_token')
  sessionStorage.removeItem('refresh_token')
}

function firstName(name) {
  return (name || '').trim().split(' ')[0] || ''
}

export async function initAuth(Alpine, apiClient = api) {
  Alpine.store('auth', {
    user: null,
    loading: true,
    error: null,

    // Alpine auto-calls a method literally named
    // `init` when a store is registered, and boot
    // needs to await the session before guards read
    // it. Naming it `restoreSession` and awaiting it
    // here keeps it to a single network call.
    async restoreSession() {
      if (!getStoredToken()) {
        this.loading = false
        return
      }

      try {
        const user = await apiClient.auth.me()
        this.user = user
        Alpine.store('app').setUser(user)
      } catch (error) {
        console.error('Auth init failed:', error)
        clearStoredTokens()
      } finally {
        this.loading = false
      }
    },

    get isAuthenticated() {
      return Boolean(this.user)
    },

    async login(email, password, remember = true) {
      this.error = null
      try {
        console.log('[Auth] Calling apiClient.auth.login')
        const data = await apiClient.auth.login(email, password)
        console.log('[Auth] Login response:', data)
        this.persistTokens(data, remember)
        this.user = data.user
        Alpine.store('app').setUser(data.user)
        const name = firstName(data.user?.name)
        Alpine.store('toast').success(
          name ? `Hola de nuevo, ${name}` : 'Sesión iniciada'
        )
        return data.user
      } catch (error) {
        console.error('[Auth] Login error:', error)
        this.error = error.message || 'Error al iniciar sesión'
        throw error
      }
    },

    async register(email, password, name) {
      // El registro NO crea sesión: la cuenta queda pendiente
      // hasta que se ingresa el código que llega por correo.
      this.error = null
      try {
        const data = await apiClient.auth.register(email, password, name)
        return data
      } catch (error) {
        this.error = error.message || 'Error al registrar'
        throw error
      }
    },

    async confirmRegistration(email, code, remember = true) {
      this.error = null
      try {
        const data = await apiClient.auth.confirmEmail(email, code)
        this.persistTokens(data, remember)
        this.user = data.user
        Alpine.store('app').setUser(data.user)
        Alpine.store('toast').success('¡Cuenta confirmada! Ya puedes crear tu primer muro')
        return data.user
      } catch (error) {
        this.error = error.message || 'Error al confirmar el correo'
        throw error
      }
    },

    async resendConfirmation(email) {
      return apiClient.auth.resendConfirmation(email)
    },

    persistTokens(data, remember) {
      const primary = remember ? localStorage : sessionStorage
      const secondary = remember ? sessionStorage : localStorage

      // Drop any token left over from a previous
      // choice so the two stores never disagree.
      secondary.removeItem('auth_token')
      secondary.removeItem('refresh_token')

      if (!data?.access_token) return
      primary.setItem('auth_token', data.access_token)
      if (data.refresh_token) {
        primary.setItem('refresh_token', data.refresh_token)
      }
    },

    async logout() {
      try {
        await apiClient.auth.logout()
      } catch {
        // A failed logout must not trap the user in
        // a session they asked to leave.
      }
      clearStoredTokens()
      this.user = null
      Alpine.store('app').logout()
      Alpine.store('toast').info('Sesión cerrada')
    },

    isOwner(wall) {
      return Boolean(this.user && wall?.owner_id === this.user.id)
    },

    getAuthHeader() {
      const token = getStoredToken()
      return token ? `Bearer ${token}` : null
    }
  })

  // Resolve the session before booting so guards can
  // await it instead of guessing.
  await Alpine.store('auth').restoreSession()
  window.dispatchEvent(new CustomEvent('auth:ready'))

  window.addEventListener('auth:logout', () => {
    clearStoredTokens()
    Alpine.store('auth').user = null
    Alpine.store('app').logout()
  })
}

/**
 * Resolves once the session has been read from
 * storage. Pages that need auth call this before
 * deciding whether to redirect.
 */
export function whenAuthReady() {
  return new Promise((resolve) => {
    if (!window.Alpine?.store('auth')?.loading) {
      resolve()
      return
    }

    // Belt and braces: never leave a guard hanging if
    // the ready event was missed.
    const done = () => resolve()
    window.addEventListener('auth:ready', done, { once: true })
    setTimeout(done, 3000)
  })
}

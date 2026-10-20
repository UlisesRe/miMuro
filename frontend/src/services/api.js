// ========================================
// miMuro - API Service
// ========================================

// En dev el proxy de Vite manda /api al backend local; en producción
// (frontend y backend en dominios distintos) se define VITE_API_BASE_URL.
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'
const DEFAULT_TIMEOUT = 30000 // 30 seconds

// "Recordarme" decides where the token lives, so
// both stores have to be consulted on every request.
function getAccessToken() {
  return localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token')
}

function clearTokens() {
  localStorage.removeItem('auth_token')
  localStorage.removeItem('refresh_token')
  sessionStorage.removeItem('auth_token')
  sessionStorage.removeItem('refresh_token')
}

class ApiError extends Error {
  constructor(message, status, data) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

class NetworkError extends ApiError {
  constructor(message, originalError) {
    super(message, 0, { original: originalError?.message })
    this.name = 'NetworkError'
    this.originalError = originalError
  }
}

class ValidationError extends ApiError {
  constructor(message, data) {
    super(message, 422, data)
    this.name = 'ValidationError'
  }
}

class AuthError extends ApiError {
  constructor(message, status = 401, data) {
    super(message, status, data)
    this.name = 'AuthError'
  }
}

async function fetchWithTimeout(url, config, timeout = DEFAULT_TIMEOUT) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    return await fetch(url, {
      // Las cookies de sesión viajan entre dominios (Netlify ↔ backend).
      credentials: 'include',
      ...config,
      signal: controller.signal
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

async function request(endpoint, options = {}, meta = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  }

  // Don't add the auth header for login/register (skipAuthRefresh).
  const token = getAccessToken()
  if (token && !meta.skipAuthRefresh) {
    headers.Authorization = `Bearer ${token}`
  }

  const config = { ...options, headers }
  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body)
  }

  const maxRetries = meta.maxRetries ?? 2

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(`${API_BASE}${endpoint}`, config, meta.timeout)

      if (response.status === 401 && !meta.skipAuthRefresh) {
        const refreshed = await refreshToken()
        if (refreshed) {
          headers.Authorization = `Bearer ${getAccessToken()}`
          const retryResponse = await fetchWithTimeout(
            `${API_BASE}${endpoint}`,
            { ...config, headers },
            meta.timeout
          )
          return handleResponse(retryResponse)
        }

        clearTokens()
        window.dispatchEvent(new CustomEvent('auth:logout'))
        throw new AuthError('Sesión expirada', 401)
      }

      return handleResponse(response)
    } catch (error) {
      if (error instanceof ApiError) throw error
      // Only network/timeout failures are worth retrying.
      if (attempt < maxRetries) continue
      throw new NetworkError('Error de conexión', error)
    }
  }

  throw new NetworkError('Error de conexión después de reintentos')
}

async function handleResponse(response) {
  const contentType = response.headers.get('content-type')
  const isJson = contentType?.includes('application/json')

  if (!response.ok) {
    const data = isJson ? await response.json() : { detail: response.statusText }

    if (response.status === 422) {
      throw new ValidationError(data.detail || 'Error de validación', data)
    }
    if (response.status === 401 || response.status === 403) {
      throw new AuthError(data.detail || 'No autorizado', response.status, data)
    }
    throw new ApiError(data.detail || 'Error en la solicitud', response.status, data)
  }

  if (response.status === 204) return null
  return isJson ? response.json() : response.text()
}

async function refreshToken() {
  const stored =
    localStorage.getItem('refresh_token') || sessionStorage.getItem('refresh_token')
  if (!stored) return false

  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: stored })
    })

    if (response.ok) {
      const data = await response.json()
      const store = localStorage.getItem('auth_token') ? localStorage : sessionStorage
      store.setItem('auth_token', data.access_token)
      if (data.refresh_token) store.setItem('refresh_token', data.refresh_token)
      return true
    }
  } catch {
    // Ignore refresh errors: the caller falls back to a logout.
  }
  return false
}

// Auth endpoints
export const authApi = {
  register: (email, password, name) =>
    request('/auth/register', {
      method: 'POST',
      body: { email, password, name }
    }, { skipAuthRefresh: true }),

  confirmEmail: (email, code) =>
    request('/auth/confirm', {
      method: 'POST',
      body: { email, code }
    }, { skipAuthRefresh: true }),

  resendConfirmation: (email) =>
    request('/auth/resend-confirmation', {
      method: 'POST',
      body: { email }
    }, { skipAuthRefresh: true }),

  login: (email, password) =>
    request('/auth/login', {
      method: 'POST',
      body: { email, password }
    }, { skipAuthRefresh: true }),

  me: () => request('/auth/me'),

  logout: () => request('/auth/logout', { method: 'POST' })
}

// Public stats
export const statsApi = {
  get: () => request('/stats', {}, { skipAuthRefresh: true })
}

// Walls (lienzos del usuario)
export const wallsApi = {
  list: () => request('/walls'),

  create: (data) => request('/walls', { method: 'POST', body: data }),

  get: (id) => request(`/walls/${id}`),

  update: (id, data) => request(`/walls/${id}`, { method: 'PATCH', body: data }),

  remove: (id) => request(`/walls/${id}`, { method: 'DELETE' }),

  // El cliente manda la lista completa de trazos: el backend la reemplaza.
  saveStrokes: (id, strokes) =>
    request(`/walls/${id}/strokes`, { method: 'PUT', body: { strokes } }),

  getPublic: (slug) => request(`/w/${slug}`, {}, { skipAuthRefresh: true }),

  // Firma de invitado: no necesita sesión, agrega trazos al muro público.
  sign: (slug, data) =>
    request(`/w/${slug}/sign`, { method: 'POST', body: data }, { skipAuthRefresh: true })
}

export const api = {
  auth: authApi,
  stats: statsApi,
  walls: wallsApi,
  request,
  ApiError,
  NetworkError,
  ValidationError,
  AuthError
}

export default api

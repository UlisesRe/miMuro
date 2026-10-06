// ========================================
// miMuro - API Service
// ========================================

const API_BASE = '/api'

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

async function request(endpoint, options = {}, meta = {}) {
  const token = getAccessToken()
  console.log('[API] Request:', endpoint, 'hasToken:', !!token, 'skipAuthRefresh:', meta.skipAuthRefresh)
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  }

  // Don't add auth header for login/register (skipAuthRefresh)
  if (token && !meta.skipAuthRefresh) {
    headers.Authorization = `Bearer ${token}`
  }

  const config = {
    ...options,
    headers
  }

  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body)
  }

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, config)
    console.log('[API] Response status:', response.status, 'for', endpoint)

    if (response.status === 401 && !meta.skipAuthRefresh) {
      // Try to refresh token
      const refreshed = await refreshToken()
      if (refreshed) {
        // Retry with new token
        headers.Authorization = `Bearer ${getAccessToken()}`
        const retryResponse = await fetch(`${API_BASE}${endpoint}`, { ...config, headers })
        return handleResponse(retryResponse)
      } else {
        // Redirect to login
        clearTokens()
        window.dispatchEvent(new CustomEvent('auth:logout'))
        throw new ApiError('Sesión expirada', 401)
      }
    }

    return handleResponse(response)
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError('Error de conexión', 0, { original: error.message })
  }
}

async function handleResponse(response) {
  const contentType = response.headers.get('content-type')
  const isJson = contentType?.includes('application/json')

  if (!response.ok) {
    const data = isJson ? await response.json() : { detail: response.statusText }
    throw new ApiError(data.detail || 'Error en la solicitud', response.status, data)
  }

  if (response.status === 204) return null
  return isJson ? response.json() : response.text()
}

async function refreshToken() {
  const refreshTokenValue =
    localStorage.getItem('refresh_token') || sessionStorage.getItem('refresh_token')
  if (!refreshTokenValue) return false

  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshTokenValue })
    })

    if (response.ok) {
      const data = await response.json()
      const store = localStorage.getItem('auth_token') ? localStorage : sessionStorage
      store.setItem('auth_token', data.access_token)
      if (data.refresh_token) {
        store.setItem('refresh_token', data.refresh_token)
      }
      return true
    }
  } catch {
    // Ignore refresh errors
  }
  return false
}

// Auth endpoints
export const authApi = {
  register: (email, password, name) =>
    request('/auth/register', {
      method: 'POST',
      body: { email, password, name }
    }),

  login: (email, password) =>
    request('/auth/login', {
      method: 'POST',
      body: { email, password }
    }, { skipAuthRefresh: true }),

  me: () => request('/auth/me'),

  logout: () =>
    request('/auth/logout', { method: 'POST' })
}

// Wall endpoints
export const wallsApi = {
  list: (params = {}) => {
    const query = new URLSearchParams(params).toString()
    return request(`/walls${query ? `?${query}` : ''}`)
  },

  create: (data) =>
    request('/walls', {
      method: 'POST',
      body: data
    }),

  get: (id) => request(`/walls/${id}`),

  update: (id, data) =>
    request(`/walls/${id}`, {
      method: 'PATCH',
      body: data
    }),

  delete: (id) =>
    request(`/walls/${id}`, { method: 'DELETE' }),

  reset: (id) =>
    request(`/walls/${id}/reset`, { method: 'POST' }),

  deleteStroke: (wallId, strokeId) =>
    request(`/walls/${wallId}/strokes/${strokeId}`, { method: 'DELETE' })
}

// Stroke endpoints
export const strokesApi = {
  list: (wallId, params = {}) => {
    const query = new URLSearchParams(params).toString()
    return request(`/walls/${wallId}/strokes${query ? `?${query}` : ''}`)
  },

  create: (wallId, stroke) =>
    request(`/walls/${wallId}/strokes`, {
      method: 'POST',
      body: stroke
    }),

  batchCreate: (wallId, strokes) =>
    request(`/walls/${wallId}/strokes/batch`, {
      method: 'POST',
      body: { strokes }
    })
}

// User endpoints
export const usersApi = {
  getProfile: (id) => request(`/users/${id}`),
  updateProfile: (data) =>
    request('/users/me', {
      method: 'PATCH',
      body: data
    })
}

// Export all APIs
export const api = {
  auth: authApi,
  walls: wallsApi,
  strokes: strokesApi,
  users: usersApi,
  request,
  ApiError
}

export default api
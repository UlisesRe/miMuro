// ========================================
// miMuro - Entry point
// ========================================

// Order matters: tokens first, then base, layout,
// components and finally the page styles.
import './styles/tokens.css'
import './styles/base.css'
import './styles/layout.css'
import './styles/components.css'
import './styles/home.css'
import './styles/auth.css'
import './styles/app.css'
import './styles/wall.css'

import Alpine from 'alpinejs'

import { initRouter } from './router.js'
import { initAuth } from './hooks/useAuth.js'
import { initToast } from './utils/toast.js'
import { api } from './services/api.js'
import { registerAllComponents } from './components/index.js'
import { registerHomePage } from './pages/Home.js'
import { registerLoginPage } from './pages/Login.js'
import { registerRegisterPage } from './pages/Register.js'
import { registerDashboardPage } from './pages/Dashboard.js'
import { registerWallEditorPage } from './pages/WallEditor.js'
import { registerPublicWallPage } from './pages/PublicWall.js'
import { registerLegalPage } from './pages/Legal.js'

window.Alpine = Alpine

// Toast must exist before anything can report a
// failure during boot.
initToast(Alpine)

// Global app state. `showToast` delegates to the toast
// store instead of keeping a second, never-rendered copy
// of the message.
Alpine.store('app', {
  user: null,
  isAuthenticated: false,
  currentPage: 'HomePage',

  setUser(user) {
    this.user = user
    this.isAuthenticated = !!user
  },

  logout() {
    this.user = null
    this.isAuthenticated = false
    localStorage.removeItem('auth_token')
    localStorage.removeItem('refresh_token')
    sessionStorage.removeItem('auth_token')
    sessionStorage.removeItem('refresh_token')
  },

  showToast(message, type = 'info', duration) {
    Alpine.store('toast').show(message, type, duration)
  }
})

const router = initRouter(Alpine)

// The router is reachable as $store.router as well as
// the $router magic, so store methods can navigate.
Alpine.store('router', router)

// Session restore runs in the background: the shell and the
// pages render right away and the auth guards await
// `whenAuthReady()`, so a slow /me call never blocks the boot.
initAuth(Alpine, api)
registerAllComponents(Alpine)

// Pages are registered directly so there is a single
// registration point and no chance of double-registering.
registerHomePage(Alpine)
registerLoginPage(Alpine)
registerRegisterPage(Alpine)
registerDashboardPage(Alpine)
registerWallEditorPage(Alpine)
registerPublicWallPage(Alpine)
registerLegalPage(Alpine)

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason)
  // Network failures are already surfaced by the API layer:
  // don't stack a second toast on top.
  if (event.reason?.message === 'Error de conexión') return
  Alpine.store('toast').error('Ha ocurrido un error inesperado')
})

// Boot Alpine. Required: the npm build of Alpine does NOT
// auto-start (only the CDN build does), so without this the
// DOM never renders and the page stays blank.
Alpine.start()

// Offline support is a production-only extra. In dev a
// service worker would serve cached modules, so the app
// would keep running the previous bundle and never pick
// up changes. Here we register it only in production and,
// in dev, remove any leftover worker plus its caches.
if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Offline support is a bonus: never block on it.
    })
  } else {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => Promise.all(registrations.map((r) => r.unregister())))
      .then(() => ('caches' in window ? caches.keys() : []))
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .catch(() => {
        // A stale worker must never keep the dev app from booting.
      })
  }
}

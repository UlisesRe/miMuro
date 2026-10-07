// ========================================
// miMuro - Main Entry Point
// ========================================

// Order matters: tokens define the variables every
// other sheet consumes, base normalises, then
// layout, components and finally pages.
import './styles/tokens.css'
import './styles/base.css'
import './styles/layout.css'
import './styles/components.css'
import './styles/home.css'
import './styles/auth.css'
import './styles/app.css'

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
import { registerWallViewPage } from './pages/WallView.js'
import { registerPublicWallPage } from './pages/PublicWall.js'
import { registerLegalPage } from './pages/Legal.js'

window.Alpine = Alpine

// Toast must exist before anything can report a
// failure during boot.
initToast(Alpine)

// Global app state.
// `showToast` delegates to the toast store instead of
// keeping a second, never-rendered copy of the message.
Alpine.store('app', {
  user: null,
  isAuthenticated: false,
  currentPage: 'HomePage',

  // How many walls the signed-in user owns. Kept in the
  // shell store so the header badge and tabbar stay in
  // sync no matter which page is mounted.
  wallCount: 0,

  // The create-wall sheet lives in the shell so the
  // FAB, the header and the dashboard share it.
  createWallOpen: false,
  editWallOpen: false,
  editWallData: null,

  // A page that owns the whole viewport (the public
  // wall) hides the app header/footer/nav.
  immersive: false,

  // Full-screen wall overlay opened from the dashboard:
  // mode "view" shows the JPG, mode "edit" the canvas.
  wallOverlay: { open: false, mode: null, wallId: null },

  setUser(user) {
    this.user = user
    this.isAuthenticated = !!user
    if (user) {
      this.refreshWallCount()
    } else {
      this.wallCount = 0
    }
  },

  async refreshWallCount() {
    if (!this.isAuthenticated) {
      this.wallCount = 0
      return
    }
    try {
      const data = await api.walls.list()
      const walls = data.walls || data || []
      this.wallCount = walls.length
    } catch {
      // Keep the last known count; the next successful
      // load will correct it.
    }
  },

  logout() {
    this.user = null
    this.isAuthenticated = false
    this.wallCount = 0
    this.createWallOpen = false
    this.editWallOpen = false
    this.editWallData = null
    this.wallOverlay = { open: false, mode: null, wallId: null }
    this.immersive = false
    localStorage.removeItem('auth_token')
    localStorage.removeItem('refresh_token')
    sessionStorage.removeItem('auth_token')
    sessionStorage.removeItem('refresh_token')
  },

  openCreateWall() {
    if (!this.isAuthenticated) {
      Alpine.store('router').navigate('/register')
      return
    }
    this.createWallOpen = true
  },

  closeCreateWall() {
    this.createWallOpen = false
  },

  openEditWall(wall) {
    if (!this.isAuthenticated) return
    this.editWallData = wall
    this.editWallOpen = true
  },

  closeEditWall() {
    this.editWallOpen = false
    this.editWallData = null
  },

  openWallOverlay(mode, wallId) {
    if (!this.isAuthenticated) {
      Alpine.store('router').navigate('/login')
      return
    }
    this.wallOverlay = {
      open: true,
      mode: mode === 'edit' ? 'edit' : 'view',
      wallId
    }
  },

  closeWallOverlay() {
    this.wallOverlay = { open: false, mode: null, wallId: null }
  },

  showToast(message, type = 'info', duration) {
    Alpine.store('toast').show(message, type, duration)
  }
})

const router = initRouter(Alpine)

// The router is reachable as $store.router as well as
// the $router magic, so store methods can navigate.
Alpine.store('router', router)

initAuth(Alpine, api)
registerAllComponents(Alpine)

// Pages are registered directly rather than through
// pages/index.js so there is a single registration
// point and no chance of double-registering.
registerHomePage(Alpine)
registerLoginPage(Alpine)
registerRegisterPage(Alpine)
registerDashboardPage(Alpine)
registerWallViewPage(Alpine)
registerPublicWallPage(Alpine)
registerLegalPage(Alpine)

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason)
  const reason = event.reason
  // Network failures are already surfaced by the API
  // layer; don't stack a second toast on top.
  if (reason?.message === 'Error de conexión') return
  Alpine.store('toast').error('Ha ocurrido un error inesperado')
})

Alpine.start()

// Keep the wall-count badge in the header and tabbar
// accurate no matter where a wall is created/destroyed.
// Only refresh a running session to avoid pointless calls.
window.addEventListener('walls:changed', () => {
  if (Alpine.store('app').isAuthenticated) {
    Alpine.store('app').refreshWallCount()
  }
})

// Expose for debugging
window.router = router

console.log('miMuro inicializado')
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

  // The create-wall sheet lives in the shell so the
  // FAB, the header and the dashboard share it.
  createWallOpen: false,
  editWallOpen: false,
  editWallData: null,

  setUser(user) {
    this.user = user
    this.isAuthenticated = !!user
  },

  logout() {
    this.user = null
    this.isAuthenticated = false
    this.createWallOpen = false
    this.editWallOpen = false
    this.editWallData = null
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

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason)
  const reason = event.reason
  // Network failures are already surfaced by the API
  // layer; don't stack a second toast on top.
  if (reason?.message === 'Error de conexión') return
  Alpine.store('toast').error('Ha ocurrido un error inesperado')
})

Alpine.start()

// Expose for debugging
window.router = router

console.log('miMuro inicializado')
// ========================================
// miMuro - Dashboard Page
// ========================================

import { api } from '../services/api.js'
import { whenAuthReady } from '../hooks/useAuth.js'

export function DashboardPageComponent() {
  return {
    walls: [],
    loading: true,
    error: null,
    dashboardPageTemplate: DashboardPageTemplate,

    async init() {
      console.log('[Dashboard] init() called')
      // Never flash the empty state at a signed-in
      // user while the session is still resolving.
      await whenAuthReady()

      console.log('[Dashboard] Auth ready, isAuthenticated:', this.$store.auth.isAuthenticated, 'user:', this.$store.auth.user)

      if (!this.$store.auth.isAuthenticated) {
        console.log('[Dashboard] Not authenticated, redirecting to login')
        this.$store.toast.info('Entra a tu cuenta para ver tus muros')
        this.$router.navigate('/login')
        return
      }

      // If user has walls, go to the first one (most recent)
      // Otherwise stay here to create one.
      try {
        const data = await api.walls.list()
        console.log('[Dashboard] Walls loaded:', data)
        this.walls = data.walls || data || []
        if (this.walls.length > 0) {
          console.log('[Dashboard] Redirecting to wall:', this.walls[0].id)
          this.$router.replace(`/wall/${this.walls[0].id}`)
          return
        }
      } catch (error) {
        console.error('[Dashboard] Error loading walls:', error)
        // Fall through to show empty state
      } finally {
        this.loading = false
      }
    },

    async loadWalls() {
      this.loading = true
      this.error = null

      try {
        const data = await api.walls.list()
        this.walls = data.walls || data || []
      } catch (error) {
        this.error =
          error?.message === 'Error de conexión'
            ? 'No pudimos conectar con el servidor. Revisa tu conexión.'
            : 'No pudimos cargar tus muros'
      } finally {
        this.loading = false
      }
    },

    async handleDeleteWall(wallId) {
      this.walls = this.walls.filter((wall) => wall.id !== wallId)
      this.$store.toast.success('Muro eliminado')
    },

    handleEditWall(wall) {
      this.$store.toast.info('La edición de muros todavía no está disponible')
      console.log('Edit wall:', wall)
    }
  }
}

export function registerDashboardPage(Alpine) {
  Alpine.data('dashboardPage', DashboardPageComponent)
}

export const DashboardPageTemplate = `
<div class="page page--dashboard">
  <div class="container">

    <header class="page-header">
      <div>
        <h1 class="page-header__title">Mis muros</h1>
        <p class="page-header__subtitle">
          Gestiona tus lienzos y comparte el que quieras.
        </p>
      </div>

      <button type="button" class="btn btn--primary" @click="$store.app.openCreateWall()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        Nuevo muro
      </button>
    </header>

    <template x-if="loading">
      <div class="walls-grid" aria-busy="true" aria-label="Cargando tus muros">
        <template x-for="i in 3" :key="i">
          <div class="card">
            <div class="card__body stack">
              <div class="skeleton" style="height:1rem;width:60%"></div>
              <div class="skeleton" style="height:0.75rem;width:90%"></div>
              <div class="skeleton" style="height:0.75rem;width:40%"></div>
            </div>
          </div>
        </template>
      </div>
    </template>

    <template x-if="!loading && error">
      <div class="state state--error" role="alert">
        <span class="state__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        </span>
        <h2 class="state__title">No se pudieron cargar tus muros</h2>
        <p class="state__text" x-text="error"></p>
        <button type="button" class="btn btn--primary" @click="loadWalls()">Reintentar</button>
      </div>
    </template>

    <template x-if="!loading && !error && walls.length === 0">
      <div class="state">
        <span class="state__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"
               stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"></rect>
            <path d="M9 12l2 2 4-4"></path>
          </svg>
        </span>
        <h2 class="state__title">Todavía no tienes muros</h2>
        <p class="state__text">
          Crea el primero, comparte el link y empieza a recibir firmas.
        </p>
        <button type="button" class="btn btn--primary btn--lg" @click="$store.app.openCreateWall()">
          Crear mi primer muro
        </button>
      </div>
    </template>

    <template x-if="!loading && !error && walls.length > 0">
      <ul class="walls-grid" role="list">
        <template x-for="wall in walls" :key="wall.id">
          <li class="wall-card-item" role="listitem">
            <div x-data="wallCard" x-init="init(wall, true, $root.handleDeleteWall, $root.handleEditWall)">
              <div x-html="$store.templates.wallCard"></div>
            </div>
          </li>
        </template>
      </ul>
    </template>

  </div>
</div>
`
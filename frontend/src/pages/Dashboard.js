// ========================================
// miMuro - Dashboard Page
// "Mis muros" as a table (stacked rows on
// mobile). Nothing is opened automatically:
// every wall is reached through its row.
// ========================================

import { api } from '../services/api.js'
import { whenAuthReady } from '../hooks/useAuth.js'

export function DashboardPageComponent() {
  return {
    walls: [],
    loading: true,
    error: null,
    busyId: null,
    dashboardPageTemplate: DashboardPageTemplate,

    async init() {
      await whenAuthReady()

      if (!this.$store.auth.isAuthenticated) {
        this.$store.toast.info('Entra a tu cuenta para ver tus muros')
        this.$router.navigate('/login')
        return
      }

      // The edit overlay and owner actions report changes
      // through a single event; refresh quietly in place.
      this._wallsChangedHandler = () => this.refreshWalls()
      window.addEventListener('walls:changed', this._wallsChangedHandler)

      await this.loadWalls()
    },

    destroy() {
      window.removeEventListener('walls:changed', this._wallsChangedHandler)
    },

    async loadWalls() {
      this.loading = true
      this.error = null

      try {
        const data = await api.walls.list()
        this.walls = data.walls || data || []
        this.$store.app.wallCount = this.walls.length
      } catch (error) {
        this.error =
          error?.message === 'Error de conexión'
            ? 'No pudimos conectar con el servidor. Revisa tu conexión.'
            : 'No pudimos cargar tus muros'
      } finally {
        this.loading = false
      }
    },

    async refreshWalls() {
      try {
        const data = await api.walls.list()
        this.walls = data.walls || data || []
        this.$store.app.wallCount = this.walls.length
      } catch {
        // Keep the rows we already have; the next action
        // will surface any real problem.
      }
    },

    formatDate(dateString) {
      if (!dateString) return ''
      return new Date(dateString).toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      })
    },

    strokesLabel(wall) {
      const count = wall.strokes_count ?? 0
      return `${count} ${count === 1 ? 'trazo' : 'trazos'}`
    },

    openView(wall) {
      this.$store.app.openWallOverlay('view', wall.id)
    },

    openEdit(wall) {
      this.$store.app.openWallOverlay('edit', wall.id)
    },

    async handleDeleteWall(wall) {
      if (this.busyId) return
      if (!confirm(`¿Eliminar el muro "${wall.title}" permanentemente? Se borrarán todos los trazos y no se puede deshacer.`)) return

      this.busyId = wall.id
      try {
        await api.walls.delete(wall.id)
        this.walls = this.walls.filter((w) => w.id !== wall.id)
        this.$store.app.wallCount = this.walls.length
        this.$store.toast.success('Muro eliminado')
      } catch {
        this.$store.toast.error('No se pudo eliminar el muro')
      } finally {
        this.busyId = null
      }
    },

    async handleResetWall(wall) {
      if (this.busyId) return
      if (!confirm(`¿Reiniciar el muro "${wall.title}"? Se borrarán todos los trazos.`)) return

      this.busyId = wall.id
      try {
        await api.walls.reset(wall.id)
        this.walls = this.walls.map((w) =>
          w.id === wall.id ? { ...w, strokes_count: 0 } : w
        )
        this.$store.toast.success('Muro reiniciado')
      } catch {
        this.$store.toast.error('No se pudo reiniciar el muro')
      } finally {
        this.busyId = null
      }
    },

    shareWall(wall) {
      // The share sheet lives in the shell and listens for this event.
      window.dispatchEvent(new CustomEvent('wall:share', { detail: wall }))
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
      <div class="walls-table-wrap" aria-busy="true" aria-label="Cargando tus muros">
        <template x-for="i in 3" :key="i">
          <div class="skeleton" style="height:3.5rem;width:100%;margin-bottom:var(--space-sm)"></div>
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
      <div class="walls-table-wrap">
        <table class="walls-table">
          <thead>
            <tr>
              <th scope="col">Muro</th>
              <th scope="col" class="walls-table__cell">Ver</th>
              <th scope="col" class="walls-table__cell">Editar</th>
              <th scope="col" class="walls-table__cell">Eliminar</th>
              <th scope="col" class="walls-table__cell">Reiniciar</th>
              <th scope="col" class="walls-table__cell">Compartir</th>
              <th scope="col" class="walls-table__actions">
                <span class="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <template x-for="wall in walls" :key="wall.id">
              <tr class="walls-table__row">
                <td class="walls-table__name">
                  <span class="walls-table__title" x-text="wall.title"></span>
                  <span class="walls-table__meta">
                    <span class="badge"
                          :class="wall.is_public ? 'badge--success' : 'badge--neutral'"
                          x-text="wall.is_public ? 'Público' : 'Privado'"></span>
                    <span x-text="formatDate(wall.created_at)"></span>
                    <span aria-hidden="true">·</span>
                    <span x-text="strokesLabel(wall)"></span>
                  </span>
                </td>

                <td class="walls-table__cell">
                  <button type="button" class="btn btn--ghost btn--sm"
                          @click="openView(wall)"
                          title="Ver el muro"
                          :aria-label="'Ver el muro ' + wall.title">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                      <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                    <span class="walls-table__label">Ver</span>
                  </button>
                </td>

                <td class="walls-table__cell">
                  <button type="button" class="btn btn--ghost btn--sm"
                          @click="openEdit(wall)"
                          title="Editar el muro"
                          :aria-label="'Editar el muro ' + wall.title">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                      <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                    <span class="walls-table__label">Editar</span>
                  </button>
                </td>

                <td class="walls-table__cell">
                  <button type="button" class="btn btn--danger btn--sm"
                          @click="handleDeleteWall(wall)"
                          :disabled="busyId === wall.id"
                          title="Eliminar el muro"
                          :aria-label="'Eliminar el muro ' + wall.title">
                    <span class="spinner spinner--sm" x-show="busyId === wall.id" x-cloak aria-hidden="true"></span>
                    <svg x-show="busyId !== wall.id" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    <span class="walls-table__label">Eliminar</span>
                  </button>
                </td>

                <td class="walls-table__cell">
                  <button type="button" class="btn btn--ghost btn--sm"
                          @click="handleResetWall(wall)"
                          :disabled="busyId === wall.id"
                          title="Borrar todos los trazos"
                          :aria-label="'Reiniciar el muro ' + wall.title">
                    <span class="spinner spinner--sm" x-show="busyId === wall.id" x-cloak aria-hidden="true"></span>
                    <svg x-show="busyId !== wall.id" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                      <path d="M3 3v5h5"></path>
                    </svg>
                    <span class="walls-table__label">Reiniciar</span>
                  </button>
                </td>

                <td class="walls-table__cell">
                  <button type="button" class="btn btn--ghost btn--sm"
                          @click="shareWall(wall)"
                          title="Compartir link del muro"
                          :aria-label="'Compartir el muro ' + wall.title">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <circle cx="18" cy="5" r="3"></circle>
                      <circle cx="6" cy="12" r="3"></circle>
                      <circle cx="18" cy="19" r="3"></circle>
                      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                    </svg>
                    <span class="walls-table__label">Compartir</span>
                  </button>
                </td>

                <td class="walls-table__actions">
                  <div class="walls-menu" x-data="{ open: false }"
                       @keydown.escape.window="open = false">
                    <button type="button" class="btn btn--ghost btn--icon"
                            @click="open = !open"
                            :aria-expanded="open ? 'true' : 'false'"
                            aria-haspopup="menu"
                            :aria-label="'Acciones del muro ' + wall.title">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <circle cx="12" cy="5" r="1"></circle>
                        <circle cx="12" cy="12" r="1"></circle>
                        <circle cx="12" cy="19" r="1"></circle>
                      </svg>
                    </button>

                    <div class="walls-menu__panel" x-show="open" x-cloak
                         @click.outside="open = false"
                         x-transition.origin.top.right
                         role="menu"
                         :aria-label="'Acciones del muro ' + wall.title">
                      <button type="button" class="walls-menu__item" role="menuitem"
                              @click="open = false; openView(wall)">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                          <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                        Ver
                      </button>

                      <button type="button" class="walls-menu__item" role="menuitem"
                              @click="open = false; openEdit(wall)">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                          <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                        Editar
                      </button>

                      <button type="button" class="walls-menu__item" role="menuitem"
                              @click="open = false; shareWall(wall)">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                          <circle cx="18" cy="5" r="3"></circle>
                          <circle cx="6" cy="12" r="3"></circle>
                          <circle cx="18" cy="19" r="3"></circle>
                          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                        </svg>
                        Compartir
                      </button>

                      <button type="button" class="walls-menu__item" role="menuitem"
                              @click="open = false; handleResetWall(wall)"
                              :disabled="busyId === wall.id">
                        <span class="spinner spinner--sm" x-show="busyId === wall.id" x-cloak aria-hidden="true"></span>
                        <svg x-show="busyId !== wall.id" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                          <path d="M3 3v5h5"></path>
                        </svg>
                        Reiniciar
                      </button>

                      <button type="button" class="walls-menu__item walls-menu__item--danger" role="menuitem"
                              @click="open = false; handleDeleteWall(wall)"
                              :disabled="busyId === wall.id">
                        <span class="spinner spinner--sm" x-show="busyId === wall.id" x-cloak aria-hidden="true"></span>
                        <svg x-show="busyId !== wall.id" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                          <polyline points="3 6 5 6 21 6"></polyline>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                        Eliminar
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</div>
`

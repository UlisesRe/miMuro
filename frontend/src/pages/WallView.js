// ========================================
// miMuro - WallView Page (Main App)
// The canvas where users draw, share, manage walls.
// ========================================

import { api } from '../services/api.js'
import { useCanvas } from '../hooks/useCanvas.js'
import { wsClient } from '../services/ws.js'

export function WallViewPageComponent() {
  return {
    wall: null,
    loading: true,
    error: null,
    isOwner: false,
    userName: 'Anónimo',
    onlineUsers: [],
    cursors: [],
    canvasRef: { value: null },
    canvasApi: null,
    wallViewTemplate: WallViewTemplate,
    showUserMenu: false,
    wallsCache: [],

    async init() {
      const wallId = this.$router.getParams().id
      if (!wallId) {
        // No wallId: try to load user's walls and pick first, or redirect to dashboard
        await this.loadUserWallsAndRedirect()
        return
      }
      await this.loadWall(wallId)
    },

    destroy() {
      this.canvasApi?.destroy()
      wsClient.disconnect()
      window.removeEventListener('wall:updated', this._wallUpdatedHandler)
    },

    async loadUserWallsAndRedirect() {
      try {
        const data = await api.walls.list()
        this.wallsCache = data.walls || data || []
        if (this.wallsCache.length > 0) {
          this.$router.navigate(`/wall/${this.wallsCache[0].id}`)
        } else {
          this.$router.navigate('/dashboard')
        }
      } catch {
        this.$router.navigate('/dashboard')
      }
    },

    async loadWall(wallId) {
      this.loading = true
      this.error = null

      try {
        this.wall = await api.walls.get(wallId)

        const auth = this.$store.auth
        this.isOwner = Boolean(auth.user && this.wall.owner_id === auth.user.id)
        this.userName = auth.user?.name || 'Anónimo'

        this.loading = false
        await this.$nextTick()
        this.initCanvas()

        await this.loadStrokes()
        this.connectWebSocket()

        // Listen for wall updates from edit modal
        this._wallUpdatedHandler = (event) => this.handleWallUpdated(event)
        window.addEventListener('wall:updated', this._wallUpdatedHandler)
      } catch (error) {
        this.error =
          error?.message === 'Error de conexión'
            ? 'No pudimos conectar con el servidor.'
            : error?.message || 'No se pudo cargar el muro'
        this.loading = false
      }
    },

    initCanvas() {
      this.canvasApi = useCanvas({ value: this.canvasRef }, {
        readOnly: !this.canDraw,
        backgroundColor: this.wall?.background_color || '#ffffff',
        onStrokeComplete: (stroke) => this.handleStrokeComplete(stroke)
      })
      this.canvasApi.init()
    },

    async loadStrokes() {
      try {
        const data = await api.strokes.list(this.wall.id)
        this.canvasApi?.loadStrokes(data.strokes || data || [])
      } catch (error) {
        console.error('No se pudieron cargar los trazos:', error)
      }
    },

    connectWebSocket() {
      wsClient.on('stroke', (stroke) => {
        if (stroke.author_id !== this.getUserId()) {
          this.canvasApi?.addRemoteStroke(stroke)
        }
      })

      wsClient.on('delete', (data) => this.canvasApi?.removeRemoteStroke(data.stroke_id))
      wsClient.on('reset', () => this.canvasApi?.resetRemote())

      wsClient.on('user_joined', (data) => {
        if (!this.onlineUsers.some((u) => u.user_id === data.user_id)) {
          this.onlineUsers.push(data)
        }
      })

      wsClient.on('user_left', (data) => {
        this.onlineUsers = this.onlineUsers.filter((u) => u.user_id !== data.user_id)
      })

      wsClient
        .connect(this.wall.id, this.$store.auth.getAuthHeader())
        .catch((error) => console.error('WebSocket no disponible:', error))
    },

    handleStrokeComplete(stroke) {
      api.strokes.create(this.wall.id, stroke).catch(console.error)
      wsClient.sendStroke(stroke)
    },

    getUserId() {
      return this.$store.auth.user?.id || null
    },

    get canDraw() {
      return this.isOwner || this.wall?.is_public
    },

    get shareUrl() {
      return `${window.location.origin}/w/${this.wall?.slug}`
    },

    get initials() {
      const name = this.$store.auth.user?.name?.trim()
      if (!name) return '?'
      const parts = name.split(/\s+/)
      if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
      return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
    },

    undo() {
      if (this.canvasApi?.undo()) {
        const strokes = this.canvasApi.getStrokes()
        if (strokes.length > 0) wsClient.sendDeleteStroke(strokes[strokes.length - 1].id)
      }
    },

    redo() {
      this.canvasApi?.redo()
    },

    async resetWall() {
      if (!confirm('¿Vas a borrar todos los trazos del muro? Esto no se puede deshacer.')) return

      try {
        await api.walls.reset(this.wall.id)
        this.canvasApi?.resetRemote()
        wsClient.sendReset()
        this.$store.toast.success('Muro limpiado')
      } catch (error) {
        this.$store.toast.error('No se pudo limpiar el muro')
      }
    },

    async copyShareUrl() {
      try {
        await navigator.clipboard.writeText(this.shareUrl)
        this.$store.toast.success('Link copiado al portapapeles')
      } catch {
        this.$store.toast.info('Copia el link desde la barra de direcciones')
      }
    },

    async createNewWall() {
      this.showUserMenu = false
      this.$store.app.openCreateWall()
    },

    async deleteCurrentWall() {
      if (!this.isOwner) return
      if (!confirm('¿Eliminar este muro permanentemente? Se borrarán todos los trazos y no se puede deshacer.')) return

      try {
        await api.walls.delete(this.wall.id)
        this.$store.toast.success('Muro eliminado')
        // Redirect to next wall or dashboard
        await this.loadUserWallsAndRedirect()
      } catch (error) {
        this.$store.toast.error('No se pudo eliminar el muro')
      }
    },

    editWall() {
      this.$store.app.openEditWall(this.wall)
    },

    async handleWallUpdated(event) {
      if (event.detail.wallId === this.wall?.id) {
        try {
          this.wall = await api.walls.get(this.wall.id)
          // Update canvas background color
          if (this.canvasApi) {
            this.canvasApi.setBackgroundColor(this.wall.background_color || '#ffffff')
          }
          this.$store.toast.success('Cambios guardados')
        } catch (error) {
          console.error('Failed to reload wall:', error)
        }
      }
    },

    logout() {
      this.showUserMenu = false
      this.$store.auth.logout()
      this.$router.navigate('/')
    },

    goToProfile() {
      this.showUserMenu = false
      this.$store.toast.info('Mi perfil - próximamente')
    },

    goToSettings() {
      this.showUserMenu = false
      this.$store.toast.info('Mi configuración - próximamente')
    }
  }
}

export function registerWallViewPage(Alpine) {
  Alpine.data('wallViewPage', WallViewPageComponent)
}

export const WallViewTemplate = `
<div class="page page--wall"
     data-wall-page
     @keydown.ctrl.z.prevent="undo()"
     @keydown.ctrl.y.prevent="redo()"
     @keydown.meta.z.prevent="undo()"
     @keydown.meta.y.prevent="redo()">

  <template x-if="loading">
    <div class="state" role="status">
      <span class="spinner spinner--lg" aria-hidden="true"></span>
      <p class="state__text">Cargando tu muro...</p>
    </div>
  </template>

  <template x-if="error && !loading">
    <div class="state state--error" role="alert">
      <span class="state__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
      </span>
      <h1 class="state__title">No se pudo abrir el muro</h1>
      <p class="state__text" x-text="error"></p>
      <a href="/" class="btn btn--primary" @click.prevent="$router.navigate('/')">Volver al inicio</a>
    </div>
  </template>

  <template x-if="wall && !loading && !error">

    <!-- Modern Header with Avatar Dropdown -->
    <header class="wall-header">
      <div class="container wall-header__inner">
        <div class="wall-header__info">
          <h1 class="wall-header__title" x-text="wall.title"></h1>
          <div class="wall-header__meta">
            <span class="avatar avatar--sm" x-text="(wall.owner_name || '?').charAt(0).toUpperCase()"></span>
            <span x-text="wall.owner_name || 'Desconocido'"></span>
            <span class="badge" :class="wall.is_public ? 'badge--success' : 'badge--neutral'"
                  x-text="wall.is_public ? 'Público' : 'Privado'"></span>
          </div>
        </div>

        <div class="wall-header__actions">
          <!-- Online users avatars -->
          <div class="wall-online" x-show="onlineUsers.length > 0"
               :aria-label="onlineUsers.length + ' personas firmando ahora'">
            <template x-for="user in onlineUsers" :key="user.user_id">
              <span class="avatar avatar--sm"
                    :title="user.user_name"
                    :style="'background-color: ' + (user.color || 'var(--color-accent)')"
                    x-text="(user.user_name || '?').charAt(0).toUpperCase()"></span>
            </template>
          </div>

          <!-- Owner actions -->
          <template x-if="isOwner">
            <div class="flex items-center gap-xs">
              <button type="button" class="btn btn--ghost btn--icon"
                      @click="copyShareUrl()" title="Copiar link para compartir" aria-label="Copiar link para compartir">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                </svg>
              </button>

              <button type="button" class="btn btn--ghost btn--icon"
                      @click="editWall()" title="Editar muro" aria-label="Editar título, color y visibilidad del muro">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>

              <button type="button" class="btn btn--ghost btn--icon"
                      @click="resetWall()" title="Limpiar muro" aria-label="Limpiar todos los trazos del muro">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                  <path d="M3 3v5h5"></path>
                </svg>
              </button>

              <button type="button" class="btn btn--danger btn--icon"
                      @click="deleteCurrentWall()" title="Eliminar muro" aria-label="Eliminar este muro permanentemente">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </template>

          <!-- User Avatar Dropdown - "Mi" concept -->
          <div class="user-menu" x-data="{ open: false }" @keydown.escape.window="open = false">
            <button type="button" class="user-menu__trigger"
                    @click="open = !open"
                    :aria-expanded="open ? 'true' : 'false'"
                    aria-haspopup="menu"
                    aria-label="Mi menú">
              <span class="avatar avatar--md" x-text="initials"></span>
            </button>

            <div class="user-menu__panel" x-show="open" x-cloak
                 @click.outside="open = false"
                 x-transition.origin.top.right
                 role="menu"
                 aria-label="Mi menú">
              <div class="user-menu__header">
                <span class="avatar avatar--md" x-text="initials"></span>
                <div class="user-menu__identity">
                  <p class="user-menu__display-name" x-text="$store.auth.user?.name"></p>
                  <p class="user-menu__email" x-text="$store.auth.user?.email"></p>
                </div>
              </div>

              <a href="#" class="user-menu__item" role="menuitem"
                 @click.prevent="goToProfile()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
                Mi perfil
              </a>

              <a href="#" class="user-menu__item" role="menuitem"
                 @click.prevent="goToSettings()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="3"></circle>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 21.9a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.69 9 1.65 1.65 0 0 0 3 10.9V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
                Mi configuración
              </a>

              <div class="user-menu__divider" role="separator"></div>

              <button type="button" class="user-menu__item user-menu__item--danger"
                      role="menuitem" @click="logout()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                  <polyline points="16 17 21 12 16 7"></polyline>
                  <line x1="21" y1="12" x2="9" y2="12"></line>
                </svg>
                Mi puerta de salida
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>

    <!-- Toolbar -->
    <template x-if="canDraw">
      <div class="wall-toolbar-bar">
        <div class="container">
          <div x-data="toolbarComponent">
            <div x-html="$store.templates.toolbar"></div>
          </div>
        </div>
      </div>
    </template>

    <!-- Canvas Stage - Full viewport -->
    <div class="wall-stage">
      <div class="container">
        <div class="wall-canvas-frame"
             :style="'--canvas-bg: ' + (wall.background_color || '#ffffff')">
          <div class="wall-canvas-holder">
            <canvas class="wall-canvas"
                    ref="canvasRef"
                    role="application"
                    aria-label="Lienzo de dibujo. Mantén pulsado y arrastra para firmar."></canvas>

            <div class="wall-cursors" aria-hidden="true">
              <template x-for="cursor in cursors" :key="cursor.user_id">
                <div class="remote-cursor"
                     :style="'left: ' + cursor.x + 'px; top: ' + cursor.y + 'px; --cursor-color: ' + (cursor.color || 'var(--color-primary)')">
                  <span class="remote-cursor__pointer"></span>
                  <span class="remote-cursor__label" x-text="cursor.name"></span>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer with share link -->
    <footer class="wall-footer">
      <div class="container wall-footer__inner">
        <p class="wall-footer__hint">
          <span x-show="canDraw">Mantén pulsado y arrastra para dibujar.</span>
          <span x-show="!canDraw">Solo el propietario puede dibujar en este muro.</span>
          <span class="wall-footer__keys" x-show="canDraw">
            <kbd>Ctrl</kbd>+<kbd>Z</kbd> deshacer · <kbd>Ctrl</kbd>+<kbd>Y</kbd> rehacer.
          </span>
        </p>

        <template x-if="isOwner">
          <div class="wall-share">
            <span class="text-muted">Link para compartir:</span>
            <span class="wall-share__url" x-text="shareUrl"></span>
            <button type="button" class="link-button" @click="copyShareUrl()">Copiar</button>
          </div>
        </template>
      </div>
    </footer>

  </template>
</div>
`
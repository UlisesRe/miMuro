// ========================================
// miMuro - Public Wall Page (for /w/:slug)
//
// NOTE: the drawing runtime (useCanvas + ws) is
// owned elsewhere and is still being wired up.
// Only the shell around it is kept in sync with
// the design system here.
// ========================================

import { api } from '../services/api.js'
import { useCanvas } from '../hooks/useCanvas.js'
import { wsClient } from '../services/ws.js'

export function PublicWallPageComponent() {
  return {
    wall: null,
    loading: true,
    error: null,
    userName: 'Visitante',
    cursors: [],
    canvasRef: { value: null },
    canvasApi: null,
    publicWallTemplate: PublicWallTemplate,

    async init() {
      const slug = this.$router.getParams().slug
      if (!slug) {
        this.error = 'El enlace del muro no es válido'
        this.loading = false
        return
      }

      await this.loadWall(slug)
    },

    destroy() {
      this.canvasApi?.destroy()
      wsClient.disconnect()
    },

    async loadWall(slug) {
      this.loading = true
      this.error = null

      try {
        // The backend still needs a slug lookup; until
        // then this is the closest available endpoint.
        this.wall = await api.request(`/walls/slug/${slug}`)
        this.userName = this.$store.auth.user?.name || 'Visitante'

        // The canvas only exists once the view has
        // rendered, so the flag has to drop and the
        // DOM has to settle before it can be wired.
        this.loading = false
        await this.$nextTick()
        this.initCanvas()

        await this.loadStrokes()
        this.connectWebSocket()
      } catch (error) {
        this.error =
          error?.status === 404
            ? 'El muro que buscas no existe o ya no es público.'
            : error?.message === 'Error de conexión'
              ? 'No pudimos conectar con el servidor.'
              : 'No se pudo cargar el muro'
        this.loading = false
      }
    },

    initCanvas() {
      // Alpine's ref assigns the element itself, while
      // useCanvas expects a ref object.
      this.canvasApi = useCanvas({ value: this.canvasRef }, {
        // Public walls are open, so visitors can sign.
        readOnly: false,
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

      wsClient.on('cursor', (position) => {
        if (position.user_id !== this.getUserId()) this.cursors.push(position)
      })

      wsClient
        .connect(this.wall.id, this.$store.auth.getAuthHeader())
        .catch((error) => console.error('WebSocket no disponible:', error))
    },

    handleStrokeComplete(stroke) {
      const payload = {
        ...stroke,
        author_id: this.getUserId(),
        author_name: this.userName
      }

      api.strokes.create(this.wall.id, payload).catch(console.error)
      wsClient.sendStroke(payload)
    },

    getUserId() {
      return this.$store.auth.user?.id || null
    },

    get shareUrl() {
      return `${window.location.origin}/w/${this.wall?.slug}`
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

    async copyShareUrl() {
      try {
        await navigator.clipboard.writeText(this.shareUrl)
        this.$store.toast.success('Link copiado al portapapeles')
      } catch {
        this.$store.toast.info('Copia el link desde la barra de direcciones')
      }
    }
  }
}

export function registerPublicWallPage(Alpine) {
  Alpine.data('publicWallPage', PublicWallPageComponent)
}

export const PublicWallTemplate = `
<div class="page page--wall"
     data-wall-page
     @keydown.ctrl.z.prevent="undo()"
     @keydown.ctrl.y.prevent="redo()"
     @keydown.meta.z.prevent="undo()"
     @keydown.meta.y.prevent="redo()">

  <template x-if="loading">
    <div class="state" role="status">
      <span class="spinner spinner--lg" aria-hidden="true"></span>
      <p class="state__text">Cargando el muro...</p>
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
      <h1 class="state__title">Muro no encontrado</h1>
      <p class="state__text" x-text="error"></p>
      <a href="/" class="btn btn--primary" @click.prevent="$router.navigate('/')">Volver al inicio</a>
    </div>
  </template>

  <template x-if="wall && !loading && !error">

    <header class="wall-header">
      <div class="container wall-header__inner">
        <div class="wall-header__info">
          <h1 class="wall-header__title" x-text="wall.title"></h1>
          <div class="wall-header__meta">
            <span class="avatar avatar--sm"
                  x-text="(wall.owner_name || '?').charAt(0).toUpperCase()"></span>
            <span x-text="wall.owner_name || 'Desconocido'"></span>
            <span class="badge badge--success">Público</span>
          </div>
        </div>

        <div class="wall-header__actions">
          <span class="wall-guest-note">Firma con el dedo o el ratón</span>
        </div>
      </div>
    </header>

    <div class="wall-toolbar-bar">
      <div class="container">
        <div x-data="toolbarComponent">
          <div x-html="$store.templates.toolbar"></div>
        </div>
      </div>
    </div>

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
                     :style="'left: ' + cursor.x + 'px; top: ' + cursor.y + 'px; --cursor-color: ' + (cursor.color || '#7c3aed')">
                  <span class="remote-cursor__pointer"></span>
                  <span class="remote-cursor__label" x-text="cursor.name"></span>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>

    <footer class="wall-footer">
      <div class="container wall-footer__inner">
        <p class="wall-footer__hint">
          Mantén pulsado y arrastra para firmar.
          <span class="wall-footer__keys">
            <kbd>Ctrl</kbd>+<kbd>Z</kbd> deshacer · <kbd>Ctrl</kbd>+<kbd>Y</kbd> rehacer.
          </span>
        </p>

        <div class="wall-share">
          <span class="text-muted">Link para compartir:</span>
          <span class="wall-share__url" x-text="shareUrl"></span>
          <button type="button" class="link-button" @click="copyShareUrl()">Copiar</button>
        </div>
      </div>
    </footer>

  </template>
</div>
`

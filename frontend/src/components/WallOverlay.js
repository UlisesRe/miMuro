// ========================================
// miMuro - WallOverlay Component
// Full-screen overlay opened from the dashboard:
//   mode "view"  -> JPG of the canvas + share options
//   mode "edit"  -> full-screen canvas + tools + owner actions
// ========================================

import { api } from '../services/api.js'
import { useCanvas, WALL_SIZE } from '../hooks/useCanvas.js'
import { wsClient } from '../services/ws.js'
import { trackOverlayInsets } from '../utils/overlayInsets.js'

// Renders the wall exactly as it lives: the fixed
// 1080x1080 logical square. The grid is UI chrome and
// is deliberately left out of the shared image.
async function renderWallJpg(strokes, backgroundColor) {
  const canvas = document.createElement('canvas')
  canvas.width = WALL_SIZE
  canvas.height = WALL_SIZE

  const ctx = canvas.getContext('2d')
  ctx.fillStyle = backgroundColor
  ctx.fillRect(0, 0, WALL_SIZE, WALL_SIZE)

  for (const stroke of strokes) {
    const points = stroke.points || []
    if (!points.length) continue

    const isEraser = stroke.tool === 'eraser'
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = isEraser ? backgroundColor : stroke.color || '#111827'
    ctx.lineWidth = isEraser ? (stroke.width || 3) * 2 : stroke.width || 3

    if (points.length === 1) {
      ctx.beginPath()
      ctx.arc(points[0].x, points[0].y, ctx.lineWidth / 2, 0, Math.PI * 2)
      ctx.fillStyle = ctx.strokeStyle
      ctx.fill()
      continue
    }

    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y)
    }
    ctx.stroke()
  }

  const url = canvas.toDataURL('image/jpeg', 0.92)
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
  return { url, blob }
}

export function WallOverlayComponent() {
  return {
    mode: 'view',
    wallId: null,
    wall: null,
    loading: true,
    error: null,
    canvasApi: null,
    imageUrl: null,
    imageBlob: null,
    canNativeShare: false,
    onlineUsers: [],
    busy: false,
    wallOverlayTemplate: WallOverlayTemplate,

    async init() {
      const overlay = this.$store.app.wallOverlay
      this.mode = overlay.mode === 'edit' ? 'edit' : 'view'
      this.wallId = overlay.wallId
      // The overlay covers the page; stop the body behind it from scrolling.
      document.body.style.overflow = 'hidden'
      // Publish the footer height so the overlay stops
      // exactly where the app footer begins.
      this._stopInsets = trackOverlayInsets(this.$el)
      await this.load()
    },

    destroy() {
      document.body.style.overflow = ''
      this._stopInsets?.()
      this.canvasApi?.destroy()
      wsClient.disconnect()
      window.removeEventListener('wall:updated', this._wallUpdatedHandler)
    },

    close() {
      this.$store.app.closeWallOverlay()
    },

    handleEscape() {
      // Esc closes the topmost layer first: an open create/edit
      // sheet wins over the overlay itself.
      if (this.$store.app.editWallOpen || this.$store.app.createWallOpen) return
      this.close()
    },

    async load() {
      this.loading = true
      this.error = null

      try {
        this.wall = await api.walls.get(this.wallId)

        if (this.mode === 'view') {
          await this.renderImage()
        } else {
          this.loading = false
          await this.$nextTick()
          if (!(await this.initCanvas())) return
          await this.loadStrokes()
          this.connectWebSocket()
          this._wallUpdatedHandler = (event) => this.handleWallUpdated(event)
          window.addEventListener('wall:updated', this._wallUpdatedHandler)
        }

        this.loading = false
      } catch (error) {
        this.error =
          error?.message === 'Error de conexión'
            ? 'No pudimos conectar con el servidor.'
            : error?.message || 'No se pudo cargar el muro'
        this.loading = false
      }
    },

    async renderImage() {
      const data = await api.strokes.list(this.wallId)
      const strokes = data.strokes || data || []
      const { url, blob } = await renderWallJpg(strokes, this.wall?.background_color || '#ffffff')
      this.imageUrl = url
      this.imageBlob = blob
      this.canNativeShare = Boolean(
        blob && navigator.canShare?.({ files: [this.buildImageFile()] })
      )
    },

    buildImageFile() {
      return new File([this.imageBlob], `${this.wall?.slug || 'muro'}.jpg`, {
        type: 'image/jpeg'
      })
    },

    async shareImage() {
      if (!this.imageBlob) return

      const file = this.buildImageFile()
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: this.wall?.title || 'miMuro',
            text: `Firma mi muro "${this.wall?.title || ''}"`
          })
          return
        } catch (error) {
          if (error?.name === 'AbortError') return
        }
      }

      this.downloadImage()
      this.$store.toast.info('Imagen descargada. Ábrela en la app donde quieras compartirla.')
    },

    downloadImage() {
      if (!this.imageBlob) return
      const url = URL.createObjectURL(this.imageBlob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${this.wall?.slug || 'muro'}.jpg`
      link.click()
      URL.revokeObjectURL(url)
    },

    async shareTo(platform) {
      this.downloadImage()
      const targets = {
        whatsapp: 'https://wa.me/',
        facebook: 'https://www.facebook.com/',
        instagram: 'https://www.instagram.com/'
      }
      const target = targets[platform]
      if (target) window.open(target, '_blank', 'noopener')
      this.$store.toast.info('Imagen descargada. Adjúntala en la app que se abrió.')
    },

    // ---- Edit mode (canvas + tools) ----

    async initCanvas() {
      // The canvas lives inside an x-html template injected
      // after init, so wait for the element like WallView does.
      for (let attempt = 0; attempt < 10 && !this.$refs.canvasRef; attempt++) {
        await this.$nextTick()
      }

      const canvasEl = this.$refs.canvasRef
      if (typeof canvasEl?.getContext !== 'function') {
        this.error = 'No pudimos inicializar el lienzo.'
        this.loading = false
        return false
      }

      this.canvasApi = useCanvas({ value: canvasEl }, {
        readOnly: !this.canDraw,
        backgroundColor: this.wall?.background_color || '#ffffff',
        onStrokeComplete: (stroke) => this.handleStrokeComplete(stroke)
      })
      this.canvasApi.init()
      return true
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
      return true
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
    },

    async shareLink() {
      const url = this.shareUrl
      if (navigator.share) {
        try {
          await navigator.share({
            title: this.wall?.title || 'miMuro',
            text: `Firma mi muro "${this.wall?.title || ''}"`,
            url
          })
          return
        } catch (error) {
          if (error?.name === 'AbortError') return
        }
      }
      await this.copyShareUrl()
    },

    editWall() {
      this.$store.app.openEditWall(this.wall)
    },

    async resetWall() {
      if (this.busy) return
      if (!confirm('¿Vas a borrar todos los trazos del muro? Esto no se puede deshacer.')) return

      this.busy = true
      try {
        await api.walls.reset(this.wall.id)
        this.canvasApi?.resetRemote()
        wsClient.sendReset()
        this.$store.toast.success('Muro limpiado')
        window.dispatchEvent(new CustomEvent('walls:changed'))
      } catch {
        this.$store.toast.error('No se pudo limpiar el muro')
      } finally {
        this.busy = false
      }
    },

    async deleteCurrentWall() {
      if (this.busy) return
      if (!confirm('¿Eliminar este muro permanentemente? Se borrarán todos los trazos y no se puede deshacer.')) return

      this.busy = true
      try {
        await api.walls.delete(this.wall.id)
        this.$store.toast.success('Muro eliminado')
        window.dispatchEvent(new CustomEvent('walls:changed'))
        this.close()
      } catch {
        this.$store.toast.error('No se pudo eliminar el muro')
      } finally {
        this.busy = false
      }
    },

    async handleWallUpdated(event) {
      if (event.detail.wallId !== this.wall?.id) return
      try {
        this.wall = await api.walls.get(this.wall.id)
        this.canvasApi?.setBackgroundColor(this.wall.background_color || '#ffffff')
        window.dispatchEvent(new CustomEvent('walls:changed'))
      } catch (error) {
        console.error('Failed to reload wall:', error)
      }
    }
  }
}

export function registerWallOverlay(Alpine) {
  Alpine.data('wallOverlay', WallOverlayComponent)
}

export const WallOverlayTemplate = `
<div class="wall-overlay__inner"
     @keydown.ctrl.z.prevent="mode === 'edit' && undo()"
     @keydown.ctrl.y.prevent="mode === 'edit' && redo()"
     @keydown.meta.z.prevent="mode === 'edit' && undo()"
     @keydown.meta.y.prevent="mode === 'edit' && redo()">

  <header class="wall-overlay__bar">
    <div class="wall-overlay__info">
      <h2 class="wall-overlay__title" x-text="wall?.title || 'Muro'"></h2>
      <div class="wall-overlay__badges" x-show="wall">
        <span class="badge"
              :class="wall?.is_public ? 'badge--success' : 'badge--neutral'"
              x-text="wall?.is_public ? 'Público' : 'Privado'"></span>
      </div>
    </div>

    <div class="wall-overlay__actions">
      <template x-if="mode === 'edit' && wall">
        <div class="flex items-center gap-xs">
          <button type="button" class="btn btn--ghost btn--sm"
                  @click="resetWall()" :disabled="busy" title="Limpiar todos los trazos"
                  aria-label="Reiniciar: limpiar todos los trazos">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8"></path>
              <path d="M3 3v5h5"></path>
            </svg>
            <span class="btn__label">Reiniciar</span>
          </button>
          <button type="button" class="btn btn--danger btn--sm"
                  @click="deleteCurrentWall()" :disabled="busy" title="Eliminar muro"
                  aria-label="Eliminar muro">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 6h18"></path>
              <path d="M8 6V4h8v2"></path>
              <path d="M19 6l-1 14H6L5 6"></path>
              <path d="M10 11v6M14 11v6"></path>
            </svg>
            <span class="btn__label">Eliminar</span>
          </button>
        </div>
      </template>

      <button type="button" class="btn btn--ghost btn--icon"
              @click="close()" aria-label="Cerrar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
  </header>

  <template x-if="loading">
    <div class="wall-overlay__state" role="status">
      <span class="spinner spinner--lg" aria-hidden="true"></span>
      <p class="state__text">Cargando tu muro...</p>
    </div>
  </template>

  <template x-if="error && !loading">
    <div class="wall-overlay__state state--error" role="alert">
      <span class="state__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
      </span>
      <h3 class="state__title">No se pudo abrir el muro</h3>
      <p class="state__text" x-text="error"></p>
      <button type="button" class="btn btn--primary" @click="close()">Cerrar</button>
    </div>
  </template>

  <!-- View mode: the JPG inside the same framed stage as
       the public wall, so the export mirrors what people
       see when they open the link -->
  <template x-if="mode === 'view' && wall && !loading && !error">
    <div class="wall-overlay__media">
      <div class="wall-stage wall-stage--framed wall-stage--image">
        <div class="container">
          <img class="wall-overlay__image"
               x-show="imageUrl"
               :src="imageUrl"
               :alt="'Dibujo del muro ' + wall.title">
        </div>
      </div>

      <div class="wall-overlay__share" x-show="imageUrl">
        <button type="button" class="btn btn--primary"
                @click="shareImage()"
                x-text="canNativeShare ? 'Compartir imagen' : 'Descargar imagen'"></button>
        <button type="button" class="btn btn--secondary btn--sm"
                @click="shareTo('whatsapp')">WhatsApp</button>
        <button type="button" class="btn btn--secondary btn--sm"
                @click="shareTo('facebook')">Facebook</button>
        <button type="button" class="btn btn--secondary btn--sm"
                @click="shareTo('instagram')">Instagram</button>
      </div>
    </div>
  </template>

  <!-- Edit mode: full-screen canvas + tools + owner actions -->
  <template x-if="mode === 'edit' && wall && !loading && !error">
    <div class="wall-overlay__edit">
      <div class="wall-overlay__toolbar">
        <div x-data="toolbarComponent">
          <div x-html="$store.templates.toolbar"></div>
        </div>
      </div>

      <div class="wall-stage wall-stage--framed">
        <div class="container">
          <div class="wall-canvas-frame wall-canvas-frame--framed"
               :style="'--canvas-bg: ' + (wall.background_color || '#ffffff')">
            <div class="wall-canvas-holder">
              <canvas class="wall-canvas"
                      x-ref="canvasRef"
                      role="application"
                      aria-label="Lienzo de dibujo. Mantén pulsado y arrastra para firmar."></canvas>
            </div>
          </div>
        </div>
      </div>

      <div class="wall-overlay__footer">
        <p class="wall-overlay__hint">
          Mantén pulsado y arrastra para dibujar.
          <span class="wall-footer__keys">
            <kbd>Ctrl</kbd>+<kbd>Z</kbd> deshacer · <kbd>Ctrl</kbd>+<kbd>Y</kbd> rehacer.
          </span>
        </p>
      </div>
    </div>
  </template>
</div>
`

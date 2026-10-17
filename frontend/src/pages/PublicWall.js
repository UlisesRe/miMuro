// ========================================
// miMuro - Public wall page (/w/:slug)
//
// El invitado llega por el link, mira el muro en solo lectura (zoom,
// desplazamiento y descarga) y puede **firmar**: escribe su nombre,
// dibuja con el lápiz y esos trazos se agregan al final del lienzo.
//
// Solo lápiz: nadie borra lo de los demás. Los trazos de la firma viven
// en `draft` hasta que se envían; el muro completo se redibuja desde los
// datos con el motor compartido (`utils/wallCanvas.js`).
// ========================================

import { api } from '../services/api.js'
import {
  WALL_SIZE,
  renderStrokes,
  drawSegment,
  pointFromEvent,
  downloadWallPng
} from '../utils/wallCanvas.js'

const ICONS = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 5 5 12 12 19"></polyline></svg>',
  minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"></line></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>'
}

const COLORS = [
  '#16181d',
  '#ffffff',
  '#e03131',
  '#f08c00',
  '#2f9e44',
  '#1971c2',
  '#7048e8',
  '#d6336c'
]

// Tope de trazos por firma (el backend corta en el mismo número).
const MAX_DRAFT_STROKES = 60

export function PublicWallPageComponent() {
  return {
    publicWallTemplate: PublicWallTemplate,

    wallSize: WALL_SIZE,
    wallSlug: '',
    wall: null,

    loading: true,
    loadError: null,

    // Modo ver: zoom y desplazamiento con CSS (no se repinta el canvas).
    zoom: 1,
    panX: 0,
    panY: 0,
    panning: false,
    panOrigin: { x: 0, y: 0 },

    // Firma del invitado.
    signing: false,
    signerName: '',
    color: COLORS[0],
    width: 6,
    colors: COLORS,
    draft: [],
    drawing: false,
    sending: false,

    async init() {
      this.wallSlug = this.$router.getParams().slug || ''
      await this.load()
    },

    get backgroundColor() {
      return this.wall?.background_color || '#ffffff'
    },

    get canvasTransform() {
      return `transform: translate(${this.panX}px, ${this.panY}px) scale(${this.zoom});`
    },

    // Nombres únicos de quienes ya firmaron (los trazos del dueño no tienen).
    get signerNames() {
      const names = []
      for (const stroke of this.strokes) {
        const name = stroke.signer_name
        if (name && !names.includes(name)) names.push(name)
      }
      return names
    },

    get canSign() {
      return Boolean(this.signerName.trim()) && this.draft.length > 0 && !this.sending
    },

    async load() {
      this.loading = true
      this.loadError = null
      try {
        const wall = await api.walls.getPublic(this.wallSlug)
        this.wall = wall
        this.strokes = wall.strokes || []
        await this.$nextTick()
        this.redraw()
      } catch (error) {
        this.loadError =
          error?.status === 404
            ? 'Este muro no existe o es privado.'
            : error?.message || 'No pudimos cargar el muro'
      } finally {
        this.loading = false
      }
    },

    redraw() {
      const ctx = this.context()
      if (ctx) renderStrokes(ctx, [...this.strokes, ...this.draft])
    },

    context() {
      const canvas = this.$refs.canvas
      return canvas ? canvas.getContext('2d') : null
    },

    goHome() {
      this.$router.navigate('/')
    },

    // --------------------------------------
    // Firma

    startSigning() {
      this.signing = true
      this.draft = []
      this.resetView()
    },

    cancelSigning() {
      this.signing = false
      this.drawing = false
      this.draft = []
      this.redraw()
    },

    onPointerDown(event) {
      if (this.loading || this.loadError) return

      // Sin firmar: el puntero mueve el lienzo.
      if (!this.signing) {
        this.panning = true
        this.panOrigin = { x: event.clientX - this.panX, y: event.clientY - this.panY }
        event.currentTarget.setPointerCapture(event.pointerId)
        return
      }

      if (this.draft.length >= MAX_DRAFT_STROKES) {
        this.$store.toast.info('Tu firma ya es bastante grande')
        return
      }

      event.currentTarget.setPointerCapture(event.pointerId)
      const point = pointFromEvent(this.$refs.canvas, event)
      this.draft.push({
        tool: 'pen',
        color: this.color,
        width: this.width,
        points: [point.x, point.y]
      })
      this.drawing = true
      // Repinta con el punto inicial para que un toque suelto deje marca.
      this.redraw()
    },

    onPointerMove(event) {
      if (!this.signing) {
        if (!this.panning) return
        this.panX = event.clientX - this.panOrigin.x
        this.panY = event.clientY - this.panOrigin.y
        return
      }

      if (!this.drawing) return
      const stroke = this.draft[this.draft.length - 1]
      if (!stroke) return

      const ctx = this.context()
      if (!ctx) return

      const point = pointFromEvent(this.$refs.canvas, event)
      stroke.points.push(point.x, point.y)
      drawSegment(ctx, stroke)
    },

    onPointerUp() {
      this.drawing = false
      this.panning = false
    },

    async submitSignature() {
      if (!this.canSign) return
      this.sending = true
      const name = this.signerName.trim()
      try {
        await api.walls.sign(this.wall.slug, { name, strokes: this.draft })
        // El backend guarda los mismos trazos con el nombre: los sumamos
        // en local para no volver a pedir el muro entero.
        this.strokes = this.strokes.concat(
          this.draft.map((stroke) => ({ ...stroke, signer_name: name }))
        )
        this.draft = []
        this.drawing = false
        this.signing = false
        this.signerName = ''
        this.resetView()
        await this.$nextTick()
        this.redraw()
        this.$store.toast.success('¡Gracias por firmar!')
      } catch (error) {
        this.$store.toast.error(error?.message || 'No pudimos guardar tu firma')
      } finally {
        this.sending = false
      }
    },

    // --------------------------------------
    // Zoom y descarga

    setZoom(value) {
      this.zoom = Math.min(4, Math.max(1, Math.round(value * 100) / 100))
    },

    zoomIn() {
      this.setZoom(this.zoom + 0.25)
    },

    zoomOut() {
      this.setZoom(this.zoom - 0.25)
    },

    resetView() {
      this.zoom = 1
      this.panX = 0
      this.panY = 0
    },

    onWheel(event) {
      // Mientras firma, la rueda no mueve el lienzo: se está dibujando.
      if (this.signing) return
      event.preventDefault()
      this.setZoom(this.zoom + (event.deltaY < 0 ? 0.15 : -0.15))
    },

    async download() {
      if (!this.wall) return
      const name = this.wall.title.replace(/[^\w\-áéíóúñ ]+/gi, '').trim() || 'mimuro'
      const ok = await downloadWallPng(
        this.$refs.canvas,
        this.backgroundColor,
        `${name}.png`
      )
      if (ok) this.$store.toast.success('Imagen descargada')
    }
  }
}

export function registerPublicWallPage(Alpine) {
  Alpine.data('publicWallPage', PublicWallPageComponent)
}

export const PublicWallTemplate = `
<div class="page page--editor">
  <div class="container container--wide">

    <header class="editor-header">
      <div class="editor-header__identity">
        <a href="/" class="btn btn--icon btn--ghost"
           @click.prevent="goHome()" aria-label="Volver al inicio">
          ${ICONS.back}
        </a>
        <div class="editor-header__text">
          <h1 class="editor-header__title" x-text="wall?.title || 'Muro'"></h1>
          <span class="editor-header__meta" x-show="wall?.owner_name" x-cloak>
            Muro de <strong x-text="wall?.owner_name"></strong>
          </span>
        </div>
      </div>

      <span class="badge badge--success" x-show="wall" x-cloak>Se puede firmar</span>
    </header>

    <div class="state" x-show="loading" x-cloak>
      <span class="spinner spinner--lg" aria-hidden="true"></span>
      <p class="state__text">Cargando el muro...</p>
    </div>

    <div class="state state--error" x-show="!loading && loadError" x-cloak>
      <span class="state__icon" aria-hidden="true">${ICONS.alert}</span>
      <h2 class="state__title">No pudimos abrir el muro</h2>
      <p class="state__text" x-text="loadError"></p>
      <a href="/" class="btn btn--primary" @click.prevent="goHome()">Volver al inicio</a>
    </div>

    <div class="editor" x-show="!loading && !loadError" x-cloak>

      <div class="toolbar" x-show="!signing" x-cloak>
        <div class="toolbar__group">
          <button type="button" class="btn btn--icon btn--ghost" @click="zoomOut()" aria-label="Alejar">
            ${ICONS.minus}
          </button>
          <span class="toolbar__zoom" x-text="Math.round(zoom * 100) + '%'"></span>
          <button type="button" class="btn btn--icon btn--ghost" @click="zoomIn()" aria-label="Acercar">
            ${ICONS.plus}
          </button>
          <button type="button" class="btn btn--ghost btn--sm" @click="resetView()">Centrar</button>
        </div>

        <div class="toolbar__group toolbar__group--end">
          <button type="button" class="btn btn--ghost btn--sm" @click="download()">
            ${ICONS.download}
            Descargar PNG
          </button>
          <button type="button" class="btn btn--primary btn--sm" @click="startSigning()">
            Firmar el muro
          </button>
        </div>
      </div>

      <div class="toolbar" x-show="signing" x-cloak>
        <label class="toolbar__field">
          <span class="toolbar__label">Tu nombre</span>
          <input type="text" class="toolbar__input" maxlength="60" placeholder="Ej.: Ana"
                 x-model="signerName" aria-label="Tu nombre">
        </label>

        <div class="toolbar__group toolbar__colors">
          <template x-for="option in colors" :key="option">
            <button type="button" class="swatch swatch--sm"
                    :class="{ 'swatch--active': color === option }"
                    :style="'background-color:' + option"
                    :aria-label="'Color ' + option"
                    :aria-pressed="color === option ? 'true' : 'false'"
                    @click="color = option"></button>
          </template>
        </div>

        <label class="toolbar__range">
          <span class="toolbar__label">Grosor</span>
          <input type="range" min="2" max="24" step="1" x-model.number="width"
                 :aria-valuetext="width + ' píxeles'">
        </label>

        <div class="toolbar__group toolbar__group--end">
          <button type="button" class="btn btn--ghost btn--sm" @click="cancelSigning()">Cancelar</button>
          <button type="button" class="btn btn--primary btn--sm"
                  @click="submitSignature()" :disabled="!canSign"
                  :data-busy="sending ? 'true' : 'false'">
            <span class="spinner spinner--sm" x-show="sending" x-cloak aria-hidden="true"></span>
            <span x-text="sending ? 'Firmando...' : 'Firmar el muro'"></span>
          </button>
        </div>
      </div>

      <div class="editor__stage" :class="{ 'editor__stage--view': !signing }"
           @wheel="onWheel($event)">
        <div class="editor__canvas-wrap" :style="canvasTransform">
          <canvas class="editor__canvas" x-ref="canvas" x-init="redraw()"
                  :width="wallSize" :height="wallSize"
                  :style="'background-color:' + backgroundColor"
                  @pointerdown="onPointerDown($event)"
                  @pointermove="onPointerMove($event)"
                  @pointerup="onPointerUp()"
                  @pointercancel="onPointerUp()"></canvas>
        </div>
      </div>

      <p class="editor__hint" x-show="!signing" x-cloak>
        Arrastrá para mover el lienzo. Usá la rueda o los botones para acercar.
      </p>
      <p class="editor__hint" x-show="signing" x-cloak>
        Escribí tu nombre y dibujá con el dedo o el mouse. Solo se agrega lo que dibujes vos.
      </p>

      <section class="signers" x-show="!signing && signerNames.length" x-cloak>
        <h2 class="signers__title" x-text="'Ya firmaron (' + signerNames.length + ')'"></h2>
        <ul class="signers__list">
          <template x-for="name in signerNames" :key="name">
            <li class="signers__item" x-text="name"></li>
          </template>
        </ul>
      </section>

    </div>
  </div>
</div>
`

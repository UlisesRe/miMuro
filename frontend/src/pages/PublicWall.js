// ========================================
// miMuro - Public wall page (/w/:slug)
//
// El invitado llega por el link y firma el muro: apenas entra se le pide
// su nombre y el lienzo queda siempre en modo firma (no hay que activar
// nada). Dibuja con lápiz o goma, y su firma se agrega **debajo** de las
// firmas que ya había, así nadie pisa lo de los demás.
//
// La goma del invitado trabaja solo sobre su propio borrador (`draft`):
// `erasePoints` reescribe los datos del borrador y nunca toca los trazos
// ya guardados. El muro se redibuja con el motor compartido
// (`utils/wallCanvas.js`).
// ========================================

import { api } from '../services/api.js'
import {
  WALL_SIZE,
  renderStrokes,
  drawSegment,
  pointFromEvent,
  clampZoom,
  distance,
  midPoint,
  eraseAlong
} from '../utils/wallCanvas.js'

const ICONS = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 5 5 12 12 19"></polyline></svg>',
  pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="M2 2l7.586 7.586"></path><circle cx="11" cy="11" r="2"></circle></svg>',
  eraser: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l9.6-9.6a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L13 21"></path><path d="M22 21H7"></path><path d="m5 11 9 9"></path></svg>',
  minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"></line></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>',
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

// Orden de pintado del muro: las firmas más nuevas primero (quedan abajo),
// las más viejas encima y, al final, los trazos del dueño.
function displayOrder(strokes) {
  const guests = []
  const owner = []
  for (const stroke of strokes || []) {
    if (stroke.signer_name) guests.push(stroke)
    else owner.push(stroke)
  }
  return [...guests.reverse(), ...owner]
}

export function PublicWallPageComponent() {
  return {
    publicWallTemplate: PublicWallTemplate,

    wallSize: WALL_SIZE,
    wallSlug: '',
    wall: null,

    loading: true,
    loadError: null,

    // Zoom y desplazamiento con CSS (no se repinta el canvas).
    zoom: 1,
    panX: 0,
    panY: 0,
    panning: false,
    panOrigin: { x: 0, y: 0 },

    // Firma del invitado: el lienzo siempre está en modo firma.
    signerName: '',
    showNameModal: false,
    tool: 'pen',
    color: COLORS[0],
    width: 6,
    colors: COLORS,
    // Trazos ya guardados (los del dueño y las firmas anteriores) y el
    // borrador que el invitado está dibujando ahora.
    strokes: [],
    draft: [],
    drawing: false,
    sending: false,

    // Punteros activos, para el gesto de dos dedos (zoom táctil).
    pointers: {},
    pinching: false,
    pinchStartDistance: 1,
    pinchStartZoom: 1,
    pinchWorld: { x: 0, y: 0 },
    lastEraserPoint: null,

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

    get eraserRadius() {
      return Math.max(6, this.width * 2)
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
      return this.draft.length > 0 && !this.sending
    },

    async load() {
      this.loading = true
      this.loadError = null
      try {
        const wall = await api.walls.getPublic(this.wallSlug)
        this.wall = wall
        this.strokes = displayOrder(wall.strokes || [])
        await this.$nextTick()
        this.redraw()
        this.requestSignerName()
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
      if (ctx) renderStrokes(ctx, [...this.draft, ...this.strokes])
    },

    context() {
      const canvas = this.$refs.canvas
      return canvas ? canvas.getContext('2d') : null
    },

    goHome() {
      this.$router.navigate('/')
    },

    // --------------------------------------
    // Nombre del invitado

    getNameStorageKey() {
      return 'mimuro_signer_name_' + this.wallSlug
    },

    requestSignerName() {
      if (!this.wall) return
      const stored = localStorage.getItem(this.getNameStorageKey())
      if (stored && stored.trim().length > 0) {
        this.signerName = stored.trim().slice(0, 60)
        return
      }
      this.showNameModal = true
      this.$nextTick(() => {
        if (this.$refs.signerNameInput) this.$refs.signerNameInput.focus()
      })
    },

    saveSignerName() {
      const name = this.signerName.trim()
      if (name.length === 0 || name.length > 60) {
        this.$store.toast.error('Escribí tu nombre (hasta 60 caracteres)')
        return
      }
      this.signerName = name
      localStorage.setItem(this.getNameStorageKey(), name)
      this.showNameModal = false
    },

    skipSignerName() {
      this.showNameModal = false
    },

    // --------------------------------------
    // Dibujo

    selectTool(tool) {
      this.tool = tool
    },

    pointerList() {
      return Object.keys(this.pointers).map((id) => this.pointers[id])
    },

    trackPointer(event) {
      this.pointers[event.pointerId] = { x: event.clientX, y: event.clientY }
    },

    onPointerDown(event) {
      if (this.loading || this.loadError) return

      this.trackPointer(event)
      event.currentTarget.setPointerCapture(event.pointerId)

      const count = this.pointerList().length
      if (count === 2) {
        this.beginPinch()
        return
      }
      if (count > 2) return

      // El botón secundario del mouse mueve el lienzo; el táctil dibuja.
      if (event.pointerType === 'mouse' && event.button !== 0) {
        this.panning = true
        this.panOrigin = { x: event.clientX - this.panX, y: event.clientY - this.panY }
        return
      }

      this.startStroke(event)
    },

    startStroke(event) {
      const point = pointFromEvent(this.$refs.canvas, event)

      if (this.tool === 'eraser') {
        this.lastEraserPoint = point
        const next = eraseAlong(this.draft, point, point, this.eraserRadius)
        this.drawing = true
        if (next !== this.draft) {
          this.draft = next
          this.redraw()
        }
        return
      }

      if (this.draft.length >= MAX_DRAFT_STROKES) {
        this.$store.toast.info('Tu firma ya es bastante grande')
        return
      }

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
      if (!this.pointers[event.pointerId]) return
      this.trackPointer(event)

      if (this.pointerList().length >= 2) {
        this.updatePinch()
        return
      }

      if (this.panning) {
        this.panX = event.clientX - this.panOrigin.x
        this.panY = event.clientY - this.panOrigin.y
        return
      }

      if (!this.drawing) return
      const point = pointFromEvent(this.$refs.canvas, event)

      if (this.tool === 'eraser') {
        const from = this.lastEraserPoint || point
        const next = eraseAlong(this.draft, from, point, this.eraserRadius)
        this.lastEraserPoint = point
        if (next !== this.draft) {
          this.draft = next
          this.redraw()
        }
        return
      }

      const stroke = this.draft[this.draft.length - 1]
      if (!stroke) return

      const ctx = this.context()
      if (!ctx) return

      stroke.points.push(point.x, point.y)
      drawSegment(ctx, stroke)
    },

    onPointerUp(event) {
      delete this.pointers[event.pointerId]
      if (this.pinching && this.pointerList().length < 2) this.pinching = false
      this.drawing = false
      this.panning = false
      this.lastEraserPoint = null
    },

    // --------------------------------------
    // Gesto de dos dedos (zoom táctil)

    stageCenter() {
      const stage = this.$refs.stage
      if (!stage) return { x: 0, y: 0 }
      const rect = stage.getBoundingClientRect()
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    },

    beginPinch() {
      const [a, b] = this.pointerList()
      if (!a || !b) return

      this.pinching = true
      this.drawing = false
      this.panning = false
      this.lastEraserPoint = null

      // Si el primer dedo ya había empezado un trazo a lápiz, se descarta:
      // apoyar un segundo dedo para el zoom no debe dejar una raya suelta.
      if (this.tool === 'pen' && this.draft.length) {
        const last = this.draft[this.draft.length - 1]
        if ((last.points || []).length <= 2) {
          this.draft.pop()
          this.redraw()
        }
      }

      this.pinchStartDistance = Math.max(1, distance(a, b))
      this.pinchStartZoom = this.zoom

      const mid = midPoint(a, b)
      const center = this.stageCenter()
      this.pinchWorld = {
        x: (mid.x - center.x - this.panX) / this.zoom,
        y: (mid.y - center.y - this.panY) / this.zoom
      }
    },

    updatePinch() {
      const [a, b] = this.pointerList()
      if (!a || !b) return

      const nextZoom = clampZoom(
        this.pinchStartZoom * (distance(a, b) / this.pinchStartDistance)
      )
      const mid = midPoint(a, b)
      const center = this.stageCenter()

      this.zoom = nextZoom
      this.panX = mid.x - center.x - this.pinchWorld.x * nextZoom
      this.panY = mid.y - center.y - this.pinchWorld.y * nextZoom
    },

    // --------------------------------------
    // Zoom

    setZoom(value) {
      this.zoom = clampZoom(value)
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
      event.preventDefault()
      this.setZoom(this.zoom + (event.deltaY < 0 ? 0.15 : -0.15))
    },

    // --------------------------------------
    // Guardar

    async submitSignature() {
      if (this.sending) return

      if (!this.draft.length) {
        this.$store.toast.info('Dibujá algo antes de guardar')
        return
      }
      if (!this.signerName.trim()) {
        this.showNameModal = true
        this.$nextTick(() => {
          if (this.$refs.signerNameInput) this.$refs.signerNameInput.focus()
        })
        return
      }

      this.sending = true
      const name = this.signerName.trim()
      try {
        await api.walls.sign(this.wall.slug, { name, strokes: this.draft })
        // El backend guarda los trazos después de los que ya había; en
        // pantalla los ponemos al principio para que queden por debajo.
        const newStrokes = this.draft.map((stroke) => ({ ...stroke, signer_name: name }))
        this.strokes = [...newStrokes, ...this.strokes]
        localStorage.setItem(this.getNameStorageKey(), name)
        this.draft = []
        this.drawing = false
        this.lastEraserPoint = null
        this.resetView()
        await this.$nextTick()
        this.redraw()
        this.$store.toast.success('¡Gracias por firmar!')
      } catch (error) {
        this.$store.toast.error(error?.message || 'No pudimos guardar tu firma')
      } finally {
        this.sending = false
      }
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

      <div class="toolbar">
        <div class="toolbar__group">
          <button type="button" class="tool" :class="{ 'is-active': tool === 'pen' }"
                  @click="selectTool('pen')" aria-label="Lápiz" :aria-pressed="tool === 'pen' ? 'true' : 'false'">
            ${ICONS.pen}
          </button>
          <button type="button" class="tool" :class="{ 'is-active': tool === 'eraser' }"
                  @click="selectTool('eraser')" aria-label="Goma" :aria-pressed="tool === 'eraser' ? 'true' : 'false'">
            ${ICONS.eraser}
          </button>
        </div>

        <div class="toolbar__group toolbar__colors" x-show="tool === 'pen'" x-cloak>
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
          <button type="button" class="btn btn--ghost btn--sm" x-show="signerName" x-cloak
                  @click="showNameModal = true"
                  :title="'Firmás como ' + signerName + '. Tocá para cambiar el nombre.'">
            <span x-text="'Firmás como ' + signerName"></span>
          </button>
          <button type="button" class="btn btn--icon btn--ghost" @click="zoomOut()" aria-label="Alejar">
            ${ICONS.minus}
          </button>
          <span class="toolbar__zoom" x-text="Math.round(zoom * 100) + '%'"></span>
          <button type="button" class="btn btn--icon btn--ghost" @click="zoomIn()" aria-label="Acercar">
            ${ICONS.plus}
          </button>
          <button type="button" class="btn btn--ghost btn--sm" @click="resetView()">Centrar</button>
          <button type="button" class="btn btn--primary btn--sm"
                  @click="submitSignature()" :disabled="!canSign"
                  :data-busy="sending ? 'true' : 'false'">
            <span class="spinner spinner--sm" x-show="sending" x-cloak aria-hidden="true"></span>
            <span x-text="sending ? 'Guardando...' : 'Guardar firma'"></span>
          </button>
        </div>
      </div>

      <div class="editor__stage" x-ref="stage" @wheel="onWheel($event)" @contextmenu.prevent>
        <div class="editor__canvas-wrap" :style="canvasTransform">
          <canvas class="editor__canvas" x-ref="canvas" x-init="redraw()"
                  :width="wallSize" :height="wallSize"
                  :style="'background-color:' + backgroundColor"
                  @pointerdown="onPointerDown($event)"
                  @pointermove="onPointerMove($event)"
                  @pointerup="onPointerUp($event)"
                  @pointercancel="onPointerUp($event)"></canvas>
        </div>
      </div>

      <p class="editor__hint">
        Dibujá con el lápiz y guardá tu firma. Se agrega debajo de las firmas anteriores.
        Con dos dedos podés hacer zoom y mover el lienzo.
      </p>

      <section class="signers" x-show="signerNames.length" x-cloak>
        <h2 class="signers__title" x-text="'Ya firmaron (' + signerNames.length + ')'"></h2>
        <ul class="signers__list">
          <template x-for="name in signerNames" :key="name">
            <li class="signers__item" x-text="name"></li>
          </template>
        </ul>
      </section>

    </div>
  </div>

  <div class="modal" x-show="showNameModal" x-cloak @keydown.escape.window="skipSignerName()">
    <div class="modal__backdrop" @click="skipSignerName()"></div>

    <div class="modal__panel" role="dialog" aria-modal="true" aria-labelledby="signer-name-title">
      <form @submit.prevent="saveSignerName()">
        <header class="modal__header">
          <h2 class="modal__title" id="signer-name-title" tabindex="-1">¿Con qué nombre querés firmar?</h2>
        </header>

        <div class="modal__body">
          <p class="modal__text">Este nombre lo verá el dueño del muro.</p>
          <div class="field">
            <label class="field__label" for="signer-name">Tu nombre</label>
            <input id="signer-name" class="field__input" type="text" maxlength="60"
                   placeholder="Ej.: Ana" x-model="signerName" x-ref="signerNameInput">
          </div>
        </div>

        <footer class="modal__footer">
          <button type="button" class="btn btn--ghost" @click="skipSignerName()">Cancelar</button>
          <button type="submit" class="btn btn--primary">Continuar</button>
        </footer>
      </form>
    </div>
  </div>
</div>
`

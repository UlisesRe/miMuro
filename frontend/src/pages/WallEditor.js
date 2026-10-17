// ========================================
// miMuro - Wall editor page (/dashboard/w/:id)
//
// El dueño tiene dos modos sobre el mismo lienzo:
//   - Editar: dibuja (lápiz y goma), deshace y guarda.
//   - Ver: solo mira, con zoom, desplazamiento y descarga.
//
// Los trazos viven como datos en `this.strokes`; el canvas solo los
// dibuja. Así deshacer, borrar todo y la goma son operaciones sobre la
// lista, y guardar es enviarla completa.
// ========================================

import { api } from '../services/api.js'
import { whenAuthReady } from '../hooks/useAuth.js'
import {
  WALL_SIZE,
  renderStrokes,
  drawSegment,
  pointFromEvent,
  downloadWallPng
} from '../utils/wallCanvas.js'

const ICONS = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>',
  pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="M2 2l7.586 7.586"></path><circle cx="11" cy="11" r="2"></circle></svg>',
  eraser: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l9.6-9.6a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L13 21"></path><path d="M22 21H7"></path><path d="m5 11 9 9"></path></svg>',
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

export function WallEditorPageComponent() {
  return {
    wallEditorTemplate: WallEditorTemplate,

    wallSize: WALL_SIZE,
    wallId: null,
    wall: null,

    loading: true,
    loadError: null,

    mode: 'edit',
    tool: 'pen',
    color: COLORS[0],
    width: 6,
    colors: COLORS,
    strokes: [],

    drawing: false,
    panning: false,
    panOrigin: { x: 0, y: 0 },
    zoom: 1,
    panX: 0,
    panY: 0,

    dirty: false,
    saving: false,
    confirmingClear: false,

    async init() {
      await whenAuthReady()

      if (!this.$store.auth.isAuthenticated) {
        this.$store.toast.info('Entrá a tu cuenta para abrir este muro')
        this.$router.navigate('/login')
        return
      }

      this.wallId = this.$router.getParams().id
      await this.load()
    },

    get backgroundColor() {
      return this.wall?.background_color || '#ffffff'
    },

    // Nombres únicos de quienes ya firmaron (los trazos propios no tienen).
    get signerNames() {
      const names = []
      for (const stroke of this.strokes) {
        const name = stroke.signer_name
        if (name && !names.includes(name)) names.push(name)
      }
      return names
    },

    get canvasTransform() {
      return `transform: translate(${this.panX}px, ${this.panY}px) scale(${this.zoom});`
    },

    async load() {
      this.loading = true
      this.loadError = null
      try {
        const wall = await api.walls.get(this.wallId)
        this.wall = wall
        this.strokes = wall.strokes || []
        this.dirty = false
        await this.$nextTick()
        this.redraw()
      } catch (error) {
        this.loadError =
          error?.status === 404
            ? 'Ese muro no existe o no es tuyo.'
            : error?.message || 'No pudimos cargar el muro'
      } finally {
        this.loading = false
      }
    },

    redraw() {
      const ctx = this.context()
      if (ctx) renderStrokes(ctx, this.strokes)
    },

    context() {
      const canvas = this.$refs.canvas
      return canvas ? canvas.getContext('2d') : null
    },

    goBack() {
      this.$router.navigate('/dashboard')
    },

    // Link que el dueño comparte para que los invitados firmen.
    async copyLink() {
      if (!this.wall) return
      const url = `${window.location.origin}/w/${this.wall.slug}`
      try {
        await navigator.clipboard.writeText(url)
        this.$store.toast.success('Link copiado. Compartilo para que firmen.')
      } catch {
        this.$store.toast.info(url)
      }
    },

    setMode(mode) {
      this.mode = mode
      this.drawing = false
      this.panning = false
      this.confirmingClear = false
      if (mode === 'edit') this.resetView()
    },

    selectTool(tool) {
      this.tool = tool
    },

    // --------------------------------------
    // Dibujo

    onPointerDown(event) {
      if (this.loading || this.loadError) return

      if (this.mode !== 'edit') {
        this.panning = true
        this.panOrigin = { x: event.clientX - this.panX, y: event.clientY - this.panY }
        event.currentTarget.setPointerCapture(event.pointerId)
        return
      }

      event.currentTarget.setPointerCapture(event.pointerId)
      const point = pointFromEvent(this.$refs.canvas, event)
      const eraser = this.tool === 'eraser'
      this.strokes.push({
        tool: this.tool,
        color: eraser ? '#111111' : this.color,
        // La goma es más gruesa: el mismo control sirve para elegir
        // punta fina o borrar zonas grandes.
        width: eraser ? this.width * 3 : this.width,
        points: [point.x, point.y]
      })
      this.drawing = true
      this.dirty = true
      // Repinta con el punto inicial para que un toque suelto deje marca.
      this.redraw()
    },

    onPointerMove(event) {
      if (this.mode !== 'edit') {
        if (!this.panning) return
        this.panX = event.clientX - this.panOrigin.x
        this.panY = event.clientY - this.panOrigin.y
        return
      }

      if (!this.drawing) return
      const stroke = this.strokes[this.strokes.length - 1]
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

    undo() {
      if (!this.strokes.length) return
      this.strokes.pop()
      this.dirty = true
      this.redraw()
    },

    clearAll() {
      this.strokes = []
      this.dirty = true
      this.confirmingClear = false
      this.redraw()
      this.$store.toast.info('Lienzo borrado. Acordate de guardar.')
    },

    async save() {
      if (this.saving || !this.wall) return
      this.saving = true
      try {
        await api.walls.saveStrokes(this.wall.id, this.strokes)
        this.dirty = false
        this.$store.toast.success('Muro guardado')
      } catch (error) {
        this.$store.toast.error(error?.message || 'No pudimos guardar el muro')
      } finally {
        this.saving = false
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
      // En modo edición la rueda sigue haciendo scroll en la página.
      if (this.mode !== 'view') return
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

export function registerWallEditorPage(Alpine) {
  Alpine.data('wallEditorPage', WallEditorPageComponent)
}

export const WallEditorTemplate = `
<div class="page page--editor">
  <div class="container container--wide">

    <header class="editor-header">
      <div class="editor-header__identity">
        <a class="btn btn--icon btn--ghost" href="/dashboard"
           @click.prevent="goBack()" aria-label="Volver a mis muros">
          ${ICONS.back}
        </a>
        <div class="editor-header__text">
          <h1 class="editor-header__title" x-text="wall?.title || 'Muro'"></h1>
          <span class="editor-header__meta">
            <span class="badge" x-show="wall" x-cloak
                  :class="wall?.is_public ? 'badge--success' : 'badge--neutral'"
                  x-text="wall?.is_public ? 'Público' : 'Privado'"></span>
            <button type="button" class="editor-header__link" x-show="wall?.is_public" x-cloak
                    @click="copyLink()">Copiar link para firmar</button>
          </span>
        </div>
      </div>

      <div class="mode-switch" role="tablist" aria-label="Modo del lienzo">
        <button type="button" role="tab" class="mode-switch__btn"
                :class="{ 'is-active': mode === 'edit' }"
                :aria-selected="mode === 'edit' ? 'true' : 'false'"
                @click="setMode('edit')">Editar</button>
        <button type="button" role="tab" class="mode-switch__btn"
                :class="{ 'is-active': mode === 'view' }"
                :aria-selected="mode === 'view' ? 'true' : 'false'"
                @click="setMode('view')">Ver</button>
      </div>
    </header>

    <div class="state" x-show="loading" x-cloak>
      <span class="spinner spinner--lg" aria-hidden="true"></span>
      <p class="state__text">Cargando el muro...</p>
    </div>

    <div class="state state--error" x-show="!loading && loadError" x-cloak>
      <span class="state__icon" aria-hidden="true">${ICONS.alert}</span>
      <h2 class="state__title">No pudimos abrir el muro</h2>
      <p class="state__text" x-text="loadError"></p>
      <button type="button" class="btn btn--primary" @click="goBack()">Volver a mis muros</button>
    </div>

    <div class="editor" x-show="!loading && !loadError" x-cloak>

      <div class="toolbar" x-show="mode === 'edit'" x-cloak>
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
          <button type="button" class="btn btn--ghost btn--sm"
                  @click="undo()" :disabled="strokes.length === 0">Deshacer</button>

          <template x-if="!confirmingClear">
            <button type="button" class="btn btn--ghost btn--sm"
                    @click="confirmingClear = true" :disabled="strokes.length === 0">Borrar todo</button>
          </template>
          <template x-if="confirmingClear">
            <span class="toolbar__confirm">
              <button type="button" class="btn btn--danger btn--sm" @click="clearAll()">Sí, borrar</button>
              <button type="button" class="btn btn--ghost btn--sm" @click="confirmingClear = false">No</button>
            </span>
          </template>

          <button type="button" class="btn btn--primary btn--sm"
                  @click="save()" :disabled="!dirty || saving" :data-busy="saving ? 'true' : 'false'">
            <span class="spinner spinner--sm" x-show="saving" x-cloak aria-hidden="true"></span>
            <span x-text="saving ? 'Guardando...' : 'Guardar'"></span>
          </button>
        </div>
      </div>

      <div class="toolbar" x-show="mode === 'view'" x-cloak>
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
          <button type="button" class="btn btn--primary btn--sm" @click="download()">
            ${ICONS.download}
            Descargar PNG
          </button>
        </div>
      </div>

      <div class="editor__stage" :class="{ 'editor__stage--view': mode === 'view' }"
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

      <p class="editor__hint" x-show="mode === 'edit'">
        <span x-show="dirty" x-cloak>Tenés cambios sin guardar.</span>
        <span x-show="!dirty" x-cloak>Todo guardado.</span>
      </p>
      <p class="editor__hint" x-show="mode === 'view'" x-cloak>
        Arrastrá para mover el lienzo. Usá la rueda o los botones para acercar.
      </p>
      <p class="editor__hint" x-show="mode === 'edit' && signerNames.length" x-cloak>
        Este muro ya tiene firmas de invitados. "Borrar todo" también las borra.
      </p>

      <section class="signers" x-show="signerNames.length" x-cloak>
        <h2 class="signers__title" x-text="'Firmaron (' + signerNames.length + ')'"></h2>
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

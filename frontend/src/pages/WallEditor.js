// ========================================
// miMuro - Wall editor page (/dashboard/w/:id)
//
// El dueño tiene dos modos sobre el mismo lienzo:
//   - Editar: dibuja (lápiz y goma), deshace y guarda.
//   - Ver: solo mira, con zoom, desplazamiento y descarga.
//
// Los trazos viven como datos en `this.strokes`; el canvas solo los
// dibuja. Así deshacer, borrar todo y la goma son operaciones sobre la
// lista, y guardar es enviarla completa. Toda la mecánica de punteros,
// zoom y dibujo viene del módulo compartido `wallInteraction`.
// ========================================

import { api } from '../services/api.js'
import { whenAuthReady } from '../hooks/useAuth.js'
import { downloadWallPng } from '../utils/wallCanvas.js'
import { mixWallInteraction, wallCanvasState } from '../utils/wallInteraction.js'
import { DEFAULT_INK, PEN_COLORS } from '../utils/constants.js'
import { ICONS } from '../utils/icons.js'
import { setDocumentTitle } from '../utils/documentTitle.js'

// Mecánica compartida del lienzo, con los hooks de esta página:
// dibujar solo en modo Editar, la rueda solo hace zoom en Ver, un trazo
// nuevo marca el muro como "sin guardar" y empezar un pinch descarta el
// trazo que hubiera quedado suelto.
const CANVAS_OPTIONS = {
  getStrokes: (context) => context.strokes,
  canDraw: (context) => context.mode === 'edit',
  wheelZoom: (context) => context.mode === 'view',
  onStrokeAdded: (context) => {
    context.dirty = true
  },
  discardStartedStroke: (context) => {
    if (context.mode === 'edit' && context.strokes.length) {
      context.strokes.pop()
      context.redraw()
    }
  }
}

export function WallEditorPageComponent() {
  const base = {
    wallEditorTemplate: WallEditorTemplate,

    wallId: null,
    wall: null,

    loading: true,
    loadError: null,

    mode: 'edit',
    color: DEFAULT_INK,
    colors: PEN_COLORS,
    strokes: [],

    dirty: false,
    saving: false,
    confirmingClear: false,

    ...wallCanvasState(),

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

    async load() {
      this.loading = true
      this.loadError = null
      try {
        const wall = await api.walls.get(this.wallId)
        this.wall = wall
        this.strokes = wall.strokes || []
        setDocumentTitle(wall.title)
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

  return mixWallInteraction(base, CANVAS_OPTIONS)
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
                 aria-label="Grosor del trazo"
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
          <span class="toolbar__zoom" aria-live="polite" x-text="Math.round(zoom * 100) + '%'"></span>
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

      <div class="editor__stage" x-ref="stage"
           :class="{ 'editor__stage--view': mode === 'view' }"
           @wheel="onWheel($event)" @contextmenu.prevent>
        <div class="editor__canvas-wrap" :style="canvasTransform">
          <canvas class="editor__canvas" x-ref="canvas" x-init="redraw()"
                  :width="wallSize" :height="wallSize"
                  :style="'background-color:' + backgroundColor"
                  role="img"
                  :aria-label="'Lienzo del muro ' + (wall?.title || '')"
                  @pointerdown="onPointerDown($event)"
                  @pointermove="onPointerMove($event)"
                  @pointerup="onPointerUp($event)"
                  @pointercancel="onPointerUp($event)"></canvas>
        </div>
      </div>

      <p class="editor__hint" x-show="mode === 'edit'">
        <span x-show="dirty" x-cloak>Tenés cambios sin guardar.</span>
        <span x-show="!dirty" x-cloak>Todo guardado.</span>
        En el móvil podés hacer zoom y mover el lienzo con dos dedos.
      </p>
      <p class="editor__hint" x-show="mode === 'view'" x-cloak>
        Arrastrá para mover el lienzo. Usá la rueda o los botones para acercar.
        En el móvil, dos dedos para el zoom.
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

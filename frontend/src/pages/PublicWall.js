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
// ya guardados. Toda la mecánica de punteros, zoom y dibujo viene del
// módulo compartido `wallInteraction`.
// ========================================

import { api } from '../services/api.js'
import { mixWallInteraction, wallCanvasState } from '../utils/wallInteraction.js'
import { DEFAULT_INK, PEN_COLORS } from '../utils/constants.js'
import { ICONS } from '../utils/icons.js'
import { openModal, closeModal, trapFocus } from '../utils/accessibility.js'
import { setDocumentTitle } from '../utils/documentTitle.js'

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

const CANVAS_OPTIONS = {
  // Se dibuja el borrador encima de los trazos ya guardados.
  getStrokes: (context) => [...context.draft, ...context.strokes],
  getActiveList: (context) => context.draft,
  setActiveList: (context, list) => {
    context.draft = list
  },
  // El botón secundario del mouse mueve el lienzo; el táctil dibuja.
  canDraw: (context, event) => !(event.pointerType === 'mouse' && event.button !== 0),
  // La goma borra el borrador (datos), nunca las firmas de otros.
  eraserEnabled: () => true,
  onStrokeStart: (context) => {
    if (context.tool === 'pen' && context.draft.length >= MAX_DRAFT_STROKES) {
      context.$store.toast.info('Tu firma ya es bastante grande')
      return false
    }
    return true
  },
  // Apoyar un segundo dedo descarta el trazo a lápiz recién empezado.
  discardStartedStroke: (context) => {
    if (context.tool !== 'pen' || !context.draft.length) return
    const last = context.draft[context.draft.length - 1]
    if ((last.points || []).length <= 2) {
      context.draft.pop()
      context.redraw()
    }
  }
}

export function PublicWallPageComponent() {
  const base = {
    publicWallTemplate: PublicWallTemplate,

    wallSlug: '',
    wall: null,

    loading: true,
    loadError: null,

    // Firma del invitado: el lienzo siempre está en modo firma.
    signerName: '',
    showNameModal: false,
    color: DEFAULT_INK,
    colors: PEN_COLORS,
    // Trazos ya guardados (los del dueño y las firmas anteriores) y el
    // borrador que el invitado está dibujando ahora.
    strokes: [],
    draft: [],
    sending: false,

    ...wallCanvasState(),

    async init() {
      this.wallSlug = this.$router.getParams().slug || ''
      await this.load()
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
        setDocumentTitle(wall.title)
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

    goHome() {
      this.$router.navigate('/')
    },

    // --------------------------------------
    // Nombre del invitado

    getNameStorageKey() {
      return 'mimuro_signer_name_' + this.wallSlug
    },

    // Abre el modal del nombre siempre por el mismo camino: marca el
    // estado, bloquea el fondo y deja el foco en el campo de texto.
    openSignerModal() {
      if (this.showNameModal) return
      this.showNameModal = true
      openModal(this, 'signerName', { initialFocus: () => this.$refs.signerNameInput })
    },

    requestSignerName() {
      if (!this.wall) return
      const stored = localStorage.getItem(this.getNameStorageKey())
      if (stored && stored.trim().length > 0) {
        this.signerName = stored.trim().slice(0, 60)
        return
      }
      this.openSignerModal()
    },

    saveSignerName() {
      const name = this.signerName.trim()
      if (name.length === 0 || name.length > 60) {
        this.$store.toast.error('Escribí tu nombre (hasta 60 caracteres)')
        return
      }
      this.signerName = name
      localStorage.setItem(this.getNameStorageKey(), name)
      this.closeNameModal()
    },

    closeNameModal() {
      this.showNameModal = false
      closeModal(this, 'signerName')
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
        this.openSignerModal()
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
    },

    handleModalTab(event) {
      trapFocus(event, this.$refs.signerNamePanel)
    }
  }

  return mixWallInteraction(base, CANVAS_OPTIONS)
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
                 aria-label="Grosor del trazo"
                 :aria-valuetext="width + ' píxeles'">
        </label>

        <div class="toolbar__group toolbar__group--end">
          <button type="button" class="btn btn--ghost btn--sm" x-show="signerName" x-cloak
                  @click="openSignerModal()"
                  :title="'Firmás como ' + signerName + '. Tocá para cambiar el nombre.'">
            <span x-text="'Firmás como ' + signerName"></span>
          </button>
          <button type="button" class="btn btn--icon btn--ghost" @click="zoomOut()" aria-label="Alejar">
            ${ICONS.minus}
          </button>
          <span class="toolbar__zoom" aria-live="polite" x-text="Math.round(zoom * 100) + '%'"></span>
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
                  role="img"
                  :aria-label="'Lienzo del muro ' + (wall?.title || '') + '. Dibujá tu firma aquí.'"
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

  <div class="modal" x-show="showNameModal" x-cloak
       @keydown.escape.window="closeNameModal()" @keydown.tab="handleModalTab($event)">
    <div class="modal__backdrop" @click="closeNameModal()"></div>

    <div class="modal__panel" x-ref="signerNamePanel"
         role="dialog" aria-modal="true" aria-labelledby="signer-name-title">
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
          <button type="button" class="btn btn--ghost" @click="closeNameModal()">Cancelar</button>
          <button type="submit" class="btn btn--primary">Continuar</button>
        </footer>
      </form>
    </div>
  </div>
</div>
`

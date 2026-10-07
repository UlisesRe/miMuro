// ========================================
// miMuro - Drawing palette
//
// Round floating handle the user can drag
// anywhere on screen (mouse or finger).
// It always starts at the bottom-right
// corner INSIDE the canvas, then clamps
// against the app header on top and the
// footer/tab bar at the bottom. Tapping it
// opens a rounded menu with the basic
// tools: pen, eraser, colour, width and
// undo/redo.
// ========================================

const COLORS = [
  '#111827',
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#7c3aed',
  '#ec4899',
  '#ffffff'
]

// Widths live in the wall's 1080px logical space: on a
// phone (canvas ~350px wide) 10 renders about 3px thick.
const LINE_WIDTHS = [3, 6, 10, 15, 21, 28]

const TOOLS = [
  { id: 'pen', label: 'Lápiz' },
  { id: 'eraser', label: 'Borrador' }
]

const HANDLE_SIZE = 56
const CANVAS_PAD = 12
// Rough menu footprint: used to flip the menu
// when it would open outside the viewport.
const MENU_W = 250
const MENU_H = 210
// Bottom bars the handle must not cross. The first
// list is looked up inside the current wall view
// (so a fullscreen overlay ignores the page footer
// behind it); the second is the app-wide fallback.
const LOCAL_BARRIERS = ['.wall-overlay__footer', '.wall-footer']
const GLOBAL_BARRIERS = ['.tabbar', '.footer']

export function ToolbarComponent() {
  return {
    tools: TOOLS,
    colors: COLORS,
    lineWidths: LINE_WIDTHS,
    selectedTool: 'pen',
    selectedColor: '#111827',
    selectedWidth: 10,
    open: false,
    dragging: false,
    canUndo: false,
    canRedo: false,
    pos: { x: 0, y: 0 },
    _drag: null,
    _moved: false,
    _snapped: false,
    syncTimer: null,

    init() {
      this.pos = this.initialPos()
      // The stage often mounts in the same flush as the
      // palette: once the DOM settles, snap into the
      // canvas' bottom-right corner.
      this.$nextTick(() => {
        this.pos = this.initialPos()
      })
      // The canvas api is a plain object, so its
      // history is not reactive. Polling keeps the
      // undo/redo buttons honest without pushing
      // reactivity into the drawing layer.
      this.syncTimer = setInterval(() => this.syncWithCanvas(), 800)
      this._onResize = () => this.clampPos()
      window.addEventListener('resize', this._onResize)
    },

    destroy() {
      if (this.syncTimer) clearInterval(this.syncTimer)
      if (this._onResize) window.removeEventListener('resize', this._onResize)
    },

    // ------------------------------------
    // Position (start inside the canvas,
    // then free drag with clamps)
    // ------------------------------------

    canvasFrame() {
      const host = this.$el?.closest('[data-wall-page]')
      return host?.querySelector('.wall-canvas-frame') || null
    },

    // Top edge of the bottom bar the handle may not cross.
    bottomBarrier() {
      const host = this.$el?.closest('[data-wall-page]') || document
      const visibleMin = (root, selectors) => {
        let top = null
        for (const selector of selectors) {
          const el = root.querySelector(selector)
          if (!el) continue
          const rect = el.getBoundingClientRect()
          if (rect.height > 0 && rect.top < window.innerHeight && rect.bottom > 0) {
            if (top === null || rect.top < top) top = rect.top
          }
        }
        return top
      }
      return visibleMin(host, LOCAL_BARRIERS) ?? visibleMin(document, GLOBAL_BARRIERS)
    },

    // Always start at the bottom-right INSIDE the canvas.
    // Before the stage exists (public wall still loading)
    // the handle parks at the viewport's bottom-right and
    // snaps into the canvas as soon as it appears.
    initialPos() {
      const frame = this.canvasFrame()
      if (frame) {
        const rect = frame.getBoundingClientRect()
        this.pos = {
          x: rect.right - HANDLE_SIZE - CANVAS_PAD,
          y: rect.bottom - HANDLE_SIZE - CANVAS_PAD
        }
      } else {
        this.pos = {
          x: window.innerWidth - HANDLE_SIZE - 16,
          y: window.innerHeight - HANDLE_SIZE - 16
        }
      }
      this.clampPos()
      return this.pos
    },

    // The handle never leaves the window: it hits the
    // app header on top and the footer (or tab bar) below.
    clampPos() {
      const header = document.querySelector('.header')
      const headerRect = header?.getBoundingClientRect()
      const minY =
        headerRect && headerRect.height > 0 && headerRect.bottom > 0
          ? Math.min(headerRect.bottom, window.innerHeight)
          : 0
      const maxX = Math.max(0, window.innerWidth - HANDLE_SIZE)
      let maxY = window.innerHeight - HANDLE_SIZE
      const barrier = this.bottomBarrier()
      if (barrier !== null) maxY = Math.min(maxY, barrier - HANDLE_SIZE)
      this.pos.x = Math.min(Math.max(this.pos.x, 0), maxX)
      this.pos.y = Math.min(Math.max(this.pos.y, minY), Math.max(minY, maxY))
    },

    // Open the menu away from the viewport edge it sits on.
    get menuFlipX() {
      return this.pos.x < MENU_W
    },

    get menuFlipY() {
      return this.pos.y < MENU_H
    },

    onHandleDown(event) {
      this._drag = { ox: event.clientX - this.pos.x, oy: event.clientY - this.pos.y }
      this._moved = false
      this.dragging = true
      event.currentTarget.setPointerCapture?.(event.pointerId)
    },

    onHandleMove(event) {
      if (!this.dragging || !this._drag) return
      const x = event.clientX - this._drag.ox
      const y = event.clientY - this._drag.oy
      if (!this._moved && Math.hypot(x - this.pos.x, y - this.pos.y) > 5) this._moved = true
      if (!this._moved) return
      this.pos.x = x
      this.pos.y = y
      this.clampPos()
    },

    onHandleUp() {
      if (this._moved) {
        // The user owns the position from now on.
        this._snapped = true
      } else {
        this.open = !this.open
      }
      this.dragging = false
      this._drag = null
    },

    onHandleCancel() {
      this.dragging = false
      this._drag = null
    },

    onHandleClick(event) {
      // Pointer taps already toggled on pointerup; a keyboard
      // Enter/Space arrives here as a click with detail 0.
      if (event.detail === 0) this.open = !this.open
    },

    // ------------------------------------
    // Canvas wiring
    // ------------------------------------

    // The wall pages own the canvas, so the palette
    // reaches up to the nearest one instead of
    // keeping a second copy of the drawing state.
    getCanvasApi() {
      const host = this.$el?.closest('[data-wall-page]')
      const stack = host?._x_dataStack
      const page = stack?.[stack.length - 1]
      return page?.canvasApi || null
    },

    syncWithCanvas() {
      // First sign of the stage: settle into the canvas'
      // bottom-right corner (skipped once the user has
      // already dragged the handle somewhere).
      if (!this._snapped && !this._moved && this.canvasFrame()) {
        this._snapped = true
        this.pos = this.initialPos()
      }

      const canvas = this.getCanvasApi()
      if (!canvas) return

      this.selectedTool = canvas.tool
      this.selectedColor = canvas.color
      this.selectedWidth = canvas.lineWidth
      this.canUndo = canvas.canUndo()
      this.canRedo = canvas.canRedo()
    },

    toggleTool(tool) {
      this.selectedTool = this.selectedTool === tool ? 'pen' : tool
      this.getCanvasApi()?.setTool(this.selectedTool)
      // Close so the result is visible right away.
      this.open = false
    },

    selectColor(color) {
      this.selectedColor = color
      // Picking a colour while erasing is confusing.
      if (this.selectedTool === 'eraser') {
        this.selectedTool = 'pen'
        this.getCanvasApi()?.setTool('pen')
      }
      this.getCanvasApi()?.setColor(color)
      // The menu stays open for rapid picks.
    },

    selectWidth(width) {
      this.selectedWidth = width
      this.getCanvasApi()?.setLineWidth(width)
    },

    undo() {
      this.getCanvasApi()?.undo()
      this.syncWithCanvas()
    },

    redo() {
      this.getCanvasApi()?.redo()
      this.syncWithCanvas()
    }
  }
}

export function registerToolbarComponent(Alpine) {
  Alpine.data('toolbarComponent', ToolbarComponent)
}

export const ToolbarTemplate = `
<div class="palette"
     :class="{ 'palette--flip-x': menuFlipX, 'palette--flip-y': menuFlipY }"
     :style="'left: ' + pos.x + 'px; top: ' + pos.y + 'px'"
     @keydown.escape.window="open = false"
     @click.outside="open = false">

  <div class="palette__menu"
       x-show="open"
       x-cloak
       x-transition.opacity.duration.150ms
       role="group"
       aria-label="Herramientas de dibujo">

    <div class="palette__row" role="group" aria-label="Herramientas">
      <template x-for="tool in tools" :key="tool.id">
        <button type="button"
                class="palette__btn"
                :class="{ 'is-active': selectedTool === tool.id }"
                :aria-pressed="selectedTool === tool.id ? 'true' : 'false'"
                :title="tool.label"
                :aria-label="tool.label"
                @click="toggleTool(tool.id)">
          <svg x-show="tool.id === 'pen'" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 19l7-7 3 3-7 7-3-3z"></path>
            <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path>
            <path d="M2 2l7.586 7.586"></path>
          </svg>
          <svg x-show="tool.id === 'eraser'" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M20 20H7.5L4 16.5V4a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2z"></path>
          </svg>
        </button>
      </template>

      <span class="palette__sep" aria-hidden="true"></span>

      <button type="button"
              class="palette__btn"
              @click="undo()"
              :disabled="!canUndo"
              :aria-disabled="!canUndo"
              title="Deshacer (Ctrl+Z)"
              aria-label="Deshacer">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 7v6h6"></path>
          <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path>
        </svg>
      </button>

      <button type="button"
              class="palette__btn"
              @click="redo()"
              :disabled="!canRedo"
              :aria-disabled="!canRedo"
              title="Rehacer (Ctrl+Y)"
              aria-label="Rehacer">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 7v6h-6"></path>
          <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"></path>
        </svg>
      </button>
    </div>

    <div class="palette__colors" role="group" aria-label="Color del trazo">
      <template x-for="color in colors" :key="color">
        <button type="button"
                class="palette__color"
                :class="{ 'is-active': selectedColor === color }"
                :aria-pressed="selectedColor === color ? 'true' : 'false'"
                :style="'background-color: ' + color"
                :title="color"
                :aria-label="'Color ' + color"
                @click="selectColor(color)"></button>
      </template>
    </div>

    <div class="palette__widths" role="group" aria-label="Grosor del trazo">
      <template x-for="width in lineWidths" :key="width">
        <button type="button"
                class="palette__width"
                :class="{ 'is-active': selectedWidth === width }"
                :aria-pressed="selectedWidth === width ? 'true' : 'false'"
                :aria-label="'Grosor ' + width + ' píxeles'"
                :title="width + ' px'"
                @click="selectWidth(width)">
          <span class="palette__width-dot"
                :style="'width: ' + width + 'px; height: ' + width + 'px'"></span>
        </button>
      </template>
    </div>
  </div>

  <button type="button"
          class="palette__handle"
          :class="{ 'is-open': open, 'is-dragging': dragging }"
          :aria-expanded="open ? 'true' : 'false'"
          aria-haspopup="true"
          title="Herramientas (arrastra para mover)"
          aria-label="Herramientas de dibujo. Arrastra para mover el menú."
          @pointerdown.prevent="onHandleDown($event)"
          @pointermove="onHandleMove($event)"
          @pointerup="onHandleUp($event)"
          @pointercancel="onHandleCancel()"
          @click="onHandleClick($event)">
    <svg x-show="selectedTool === 'pen'" x-cloak class="palette__icon" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 19l7-7 3 3-7 7-3-3z"></path>
      <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path>
      <path d="M2 2l7.586 7.586"></path>
    </svg>
    <svg x-show="selectedTool === 'eraser'" x-cloak class="palette__icon" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M20 20H7.5L4 16.5V4a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2z"></path>
    </svg>
    <span class="palette__dot" :style="'background-color: ' + selectedColor" aria-hidden="true"></span>
  </button>
</div>
`

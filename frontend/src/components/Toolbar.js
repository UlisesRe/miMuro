// ========================================
// miMuro - Toolbar Component
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

const LINE_WIDTHS = [1, 2, 3, 5, 8, 12]

const TOOLS = [
  { id: 'pen', label: 'Lápiz' },
  { id: 'eraser', label: 'Borrador' }
]

export function ToolbarComponent() {
  return {
    tools: TOOLS,
    colors: COLORS,
    lineWidths: LINE_WIDTHS,
    selectedTool: 'pen',
    selectedColor: '#111827',
    selectedWidth: 3,
    showColorPicker: false,
    showWidthPicker: false,
    canUndo: false,
    canRedo: false,
    syncTimer: null,

    init() {
      // The canvas api is a plain object, so its
      // history is not reactive. Polling keeps the
      // undo/redo buttons honest without pushing
      // reactivity into the drawing layer.
      this.syncTimer = setInterval(() => this.syncWithCanvas(), 800)
    },

    destroy() {
      if (this.syncTimer) clearInterval(this.syncTimer)
    },

    // The wall pages own the canvas, so the toolbar
    // reaches up to the nearest one instead of
    // keeping a second copy of the drawing state.
    getCanvasApi() {
      const host = this.$el?.closest('[data-wall-page]')
      const stack = host?._x_dataStack
      const page = stack?.[stack.length - 1]
      return page?.canvasApi || null
    },

    syncWithCanvas() {
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
      this.showColorPicker = false
      this.showWidthPicker = false
    },

    selectColor(color) {
      this.selectedColor = color
      this.showColorPicker = false
      // Picking a colour while erasing is confusing.
      if (this.selectedTool === 'eraser') this.selectedTool = 'pen'
      this.getCanvasApi()?.setColor(color)
      this.getCanvasApi()?.setTool(this.selectedTool)
    },

    selectWidth(width) {
      this.selectedWidth = width
      this.showWidthPicker = false
      this.getCanvasApi()?.setLineWidth(width)
    },

    undo() {
      this.getCanvasApi()?.undo()
      this.syncWithCanvas()
    },

    redo() {
      this.getCanvasApi()?.redo()
      this.syncWithCanvas()
    },

    clear() {
      const canvas = this.getCanvasApi()
      if (!canvas) return
      if (confirm('¿Borrar todos los trazos del lienzo?')) {
        canvas.clear()
        this.syncWithCanvas()
      }
    },

    isSelected(tool) {
      return this.selectedTool === tool
    }
  }
}

export function registerToolbarComponent(Alpine) {
  Alpine.data('toolbarComponent', ToolbarComponent)
}

export const ToolbarTemplate = `
<div class="toolbar" role="toolbar" aria-label="Herramientas de dibujo">

  <div class="toolbar-group" role="group" aria-label="Herramientas">
    <template x-for="tool in tools" :key="tool.id">
      <button type="button"
              class="toolbar-btn"
              :class="{ 'toolbar-btn--active': isSelected(tool.id) }"
              :aria-pressed="isSelected(tool.id)"
              @click="toggleTool(tool.id)"
              :title="tool.label"
              :aria-label="tool.label">
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
  </div>

  <span class="toolbar-divider" role="separator" aria-hidden="true"></span>

  <div class="toolbar-group" role="group" aria-label="Color">
    <button type="button"
            class="toolbar-btn"
            @click="showColorPicker = !showColorPicker; showWidthPicker = false"
            :aria-expanded="showColorPicker"
            :aria-label="'Color actual: ' + selectedColor"
            title="Color">
      <span class="toolbar-color-preview" :style="'background-color: ' + selectedColor"></span>
    </button>

    <div class="toolbar-dropdown"
         x-show="showColorPicker"
         x-transition.opacity.duration.120ms
         x-cloak
         role="group"
         aria-label="Paleta de colores">
      <template x-for="color in colors" :key="color">
        <button type="button"
                class="toolbar-color-option"
                :aria-checked="selectedColor === color"
                :aria-label="'Color ' + color"
                :title="color"
                :style="'background-color: ' + color"
                @click="selectColor(color)"></button>
      </template>
    </div>
  </div>

  <span class="toolbar-divider" role="separator" aria-hidden="true"></span>

  <div class="toolbar-group" role="group" aria-label="Grosor">
    <button type="button"
            class="toolbar-btn"
            @click="showWidthPicker = !showWidthPicker; showColorPicker = false"
            :aria-expanded="showWidthPicker"
            :aria-label="'Grosor actual: ' + selectedWidth + ' píxeles'"
            title="Grosor">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-linecap="round" aria-hidden="true">
        <line x1="4" y1="12" x2="20" y2="12" stroke-width="1"></line>
        <line x1="4" y1="12" x2="20" y2="12" :stroke-width="selectedWidth"></line>
      </svg>
    </button>

    <div class="toolbar-dropdown toolbar-dropdown--list"
         x-show="showWidthPicker"
         x-transition.opacity.duration.120ms
         x-cloak
         role="group"
         aria-label="Grosor del trazo">
      <template x-for="width in lineWidths" :key="width">
        <button type="button"
                class="toolbar-width-option"
                :aria-checked="selectedWidth === width"
                @click="selectWidth(width)">
          <span class="toolbar-width-option__dot"
                :style="'width: ' + width + 'px; height: ' + width + 'px'"></span>
          <span x-text="width + ' px'"></span>
        </button>
      </template>
    </div>
  </div>

  <span class="toolbar-divider" role="separator" aria-hidden="true"></span>

  <div class="toolbar-group" role="group" aria-label="Historial">
    <button type="button"
            class="toolbar-btn"
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
            class="toolbar-btn"
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

  <span class="toolbar-divider" role="separator" aria-hidden="true"></span>

  <div class="toolbar-group" role="group" aria-label="Acciones">
    <button type="button"
            class="toolbar-btn toolbar-btn--danger"
            @click="clear()"
            title="Borrar todo el lienzo"
            aria-label="Borrar todo el lienzo">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      </svg>
    </button>
  </div>

</div>
`

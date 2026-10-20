// ========================================
// miMuro - Interacción del lienzo
//
// El dueño (WallEditor) y el invitado (PublicWall) trabajan sobre el
// mismo lienzo y comparten: zoom, desplazamiento, gesto de dos dedos
// (pinch), captura de punteros, conversión de coordenadas y el dibujo.
// Este módulo concentra esa mecánica en un factory para que cada página
// solo aporte lo suyo (de dónde salen los trazos y qué pasa al terminar
// un trazo), sin repetir ~250 líneas.
//
// Cada página mezcla el resultado en su objeto Alpine:
//
//   Object.assign(component, createWallInteraction({ ... }))
//
// Hooks que puede aportar la página (además de los datos):
//   - getStrokes(context)      trazos visibles, en orden de pintado
//   - getActiveList(context)   lista donde se agrega el trazo nuevo
//   - setActiveList(context,l) reemplaza la lista tras borrar con goma
//   - canDraw(context, event)  false => ese gesto mueve el lienzo
//   - eraserEnabled(context)   true => la goma trabaja sobre datos
//   - onStrokeStart(context, point)  false cancela el trazo (p. ej. tope)
//   - onStrokeAdded(context)   se llama al agregar un trazo nuevo
//   - wheelZoom(context)       true => la rueda hace zoom (por defecto sí)
//   - discardStartedStroke(context)  al empezar un pinch, descarta el trazo
// ========================================

import {
  WALL_SIZE,
  renderStrokes,
  drawSegment,
  pointFromEvent,
  clampZoom,
  distance,
  midPoint,
  eraseAlong
} from './wallCanvas.js'

// Estado común del lienzo. Las páginas lo extienden con lo suyo.
export function wallCanvasState() {
  return {
    wallSize: WALL_SIZE,

    zoom: 1,
    panX: 0,
    panY: 0,
    panning: false,
    panOrigin: { x: 0, y: 0 },

    tool: 'pen',
    width: 6,
    drawing: false,

    // Punteros activos, para el gesto de dos dedos (zoom táctil).
    pointers: {},
    pinching: false,
    pinchStartDistance: 1,
    pinchStartZoom: 1,
    pinchWorld: { x: 0, y: 0 },
    lastEraserPoint: null
  }
}

function createWallInteraction(options = {}) {
  const {
    getStrokes = (context) => context.strokes,
    getActiveList = (context) => context.strokes,
    setActiveList = (context, list) => { context.strokes = list },
    canDraw = () => true,
    eraserEnabled = () => false,
    onStrokeStart,
    onStrokeAdded,
    wheelZoom = () => true,
    discardStartedStroke,
    eraserRadius = (context) => Math.max(6, context.width * 2)
  } = options

  return {
    // --------------------------------------
    // Vista

    get backgroundColor() {
      return this.wall?.background_color || '#ffffff'
    },

    get canvasTransform() {
      return `transform: translate(${this.panX}px, ${this.panY}px) scale(${this.zoom});`
    },

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

    selectTool(tool) {
      this.tool = tool
    },

    // --------------------------------------
    // Redibujado

    context() {
      const canvas = this.$refs.canvas
      return canvas ? canvas.getContext('2d') : null
    },

    redraw() {
      const ctx = this.context()
      if (ctx) renderStrokes(ctx, getStrokes(this))
    },

    // --------------------------------------
    // Punteros y gesto de dos dedos

    pointerList() {
      return Object.keys(this.pointers).map((id) => this.pointers[id])
    },

    trackPointer(event) {
      this.pointers[event.pointerId] = { x: event.clientX, y: event.clientY }
    },

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

      // Apoyar un segundo dedo para el zoom no debe dejar una raya suelta.
      discardStartedStroke?.(this)

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
    // Eventos de puntero

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

      if (!canDraw(this, event)) {
        this.startPan(event)
        return
      }

      this.startStroke(event)
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

      if (this.drawing) this.extendStroke(event)
    },

    onPointerUp(event) {
      if (event && event.pointerId !== undefined) delete this.pointers[event.pointerId]
      if (this.pinching && this.pointerList().length < 2) this.pinching = false
      this.drawing = false
      this.panning = false
      this.lastEraserPoint = null
    },

    startPan(event) {
      this.panning = true
      this.panOrigin = { x: event.clientX - this.panX, y: event.clientY - this.panY }
    },

    onWheel(event) {
      if (!wheelZoom(this)) return
      event.preventDefault()
      this.setZoom(this.zoom + (event.deltaY < 0 ? 0.15 : -0.15))
    },

    // --------------------------------------
    // Dibujo

    startStroke(event) {
      const point = pointFromEvent(this.$refs.canvas, event)
      if (onStrokeStart && onStrokeStart(this, point) === false) return

      const eraser = this.tool === 'eraser'

      // En la página pública la goma borra el borrador (operación sobre
      // datos). En el editor deja un trazo `destination-out` más grueso.
      if (eraser && eraserEnabled(this)) {
        this.lastEraserPoint = point
        this.drawing = true
        this.applyEraser(point, point)
        return
      }

      getActiveList(this).push({
        tool: eraser ? 'eraser' : 'pen',
        color: eraser ? '#111111' : this.color,
        width: eraser ? this.width * 3 : this.width,
        points: [point.x, point.y]
      })
      this.drawing = true
      onStrokeAdded?.(this)
      // Repinta con el punto inicial para que un toque suelto deje marca.
      this.redraw()
    },

    extendStroke(event) {
      const point = pointFromEvent(this.$refs.canvas, event)

      if (this.tool === 'eraser' && eraserEnabled(this)) {
        const from = this.lastEraserPoint || point
        this.lastEraserPoint = point
        this.applyEraser(from, point)
        return
      }

      const list = getActiveList(this)
      const stroke = list[list.length - 1]
      if (!stroke) return

      const ctx = this.context()
      if (!ctx) return

      stroke.points.push(point.x, point.y)
      drawSegment(ctx, stroke)
    },

    applyEraser(from, to) {
      const list = getActiveList(this)
      const next = eraseAlong(list, from, to, eraserRadius(this))
      if (next === list) return
      setActiveList(this, next)
      this.redraw()
    },

    // Nombres únicos de quienes ya firmaron (los trazos propios no tienen).
    get signerNames() {
      const names = []
      for (const stroke of this.strokes) {
        const name = stroke.signer_name
        if (name && !names.includes(name)) names.push(name)
      }
      return names
    }
  }
}

// Mezcla el lienzo dentro del objeto de una página preservando los
// getters. `Object.assign` no sirve: al copiar leería cada getter (con
// `this` vacío) y lo congelaría en un valor fijo.
export function mixWallInteraction(component, options = {}) {
  return Object.defineProperties(
    component,
    Object.getOwnPropertyDescriptors(createWallInteraction(options))
  )
}

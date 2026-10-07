// ========================================
// miMuro - Canvas Hook
//
// The wall is a fixed 1080x1080 logical
// square. The frame is fitted into the
// space the layout gives it and the
// context is scaled, so every device
// draws, stores and shows the exact same
// wall (only zoomed to fit).
// ========================================

export const WALL_SIZE = 1080
const GRID_STEP = 90
const GRID_LINE = 1.5

export function useCanvas(canvasRef, options = {}) {
  const {
    backgroundColor: defaultBackground = '#ffffff',
    onStrokeComplete,
    onStrokeUpdate,
    readOnly: initialReadOnly = false
  } = options

  let backgroundColor = defaultBackground
  let readOnly = initialReadOnly

  let ctx = null
  let isDrawing = false
  let currentStroke = null
  let strokes = []
  let history = []
  let historyIndex = -1
  let tool = 'pen'
  let color = '#000000'
  let lineWidth = 3
  let lastPoint = null
  let frameObserver = null

  // Touch handling
  let activeTouches = new Map()

  // Largest square that fits the space the frame was
  // given, so the frame (border, radius) hugs the
  // square canvas instead of wrapping a rectangle.
  function fitFrame() {
    const canvas = canvasRef.value
    const frame = canvas?.closest('.wall-canvas-frame')
    const parent = frame?.parentElement
    if (!frame || !parent) return

    const cs = getComputedStyle(parent)
    const availW =
      parent.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0)
    const availH =
      parent.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0)
    const side = Math.floor(Math.min(availW, availH))

    // Not laid out yet (hidden or zero-height): keep the
    // current size and wait for the next layout pass.
    if (side < 64) return

    frame.style.flex = '0 0 auto'
    frame.style.width = `${side}px`
    frame.style.height = `${side}px`
    frame.style.margin = 'auto'
  }

  // Maps CSS pixels to the 1080 logical space: everything
  // drawn and stored lives in that space from now on.
  function applyTransform() {
    const canvas = canvasRef.value
    if (!canvas || !ctx) return
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return

    const sx = WALL_SIZE / rect.width
    const sy = WALL_SIZE / rect.height
    ctx.setTransform(sx, 0, 0, sy, 0, 0)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }

  function layout() {
    fitFrame()
    applyTransform()
  }

  function init() {
    if (!canvasRef.value) return

    const canvas = canvasRef.value
    ctx = canvas.getContext('2d')

    // Fixed logical resolution: the buffer never changes,
    // only the CSS size (and the context scale) does, so
    // existing strokes stay put when the layout moves.
    canvas.width = WALL_SIZE
    canvas.height = WALL_SIZE

    layout()
    drawBackground()
    redrawAllStrokes()

    // Event listeners
    canvas.addEventListener('mousedown', onPointerDown)
    canvas.addEventListener('mousemove', onPointerMove)
    canvas.addEventListener('mouseup', onPointerUp)
    canvas.addEventListener('mouseleave', onPointerUp)

    canvas.addEventListener('touchstart', onTouchStart, { passive: false })
    canvas.addEventListener('touchmove', onTouchMove, { passive: false })
    canvas.addEventListener('touchend', onTouchEnd)
    canvas.addEventListener('touchcancel', onTouchEnd)

    window.addEventListener('resize', layout)

    const frame = canvas.closest('.wall-canvas-frame')
    if (frame?.parentElement && typeof ResizeObserver !== 'undefined') {
      frameObserver = new ResizeObserver(() => layout())
      frameObserver.observe(frame.parentElement)
    }
  }

  function destroy() {
    if (!canvasRef.value) return
    const canvas = canvasRef.value

    canvas.removeEventListener('mousedown', onPointerDown)
    canvas.removeEventListener('mousemove', onPointerMove)
    canvas.removeEventListener('mouseup', onPointerUp)
    canvas.removeEventListener('mouseleave', onPointerUp)

    canvas.removeEventListener('touchstart', onTouchStart)
    canvas.removeEventListener('touchmove', onTouchMove)
    canvas.removeEventListener('touchend', onTouchEnd)
    canvas.removeEventListener('touchcancel', onTouchEnd)

    window.removeEventListener('resize', layout)
    frameObserver?.disconnect()
    frameObserver = null
  }

  function getPointFromEvent(event) {
    const canvas = canvasRef.value
    const rect = canvas.getBoundingClientRect()
    const clientX = event.clientX || event.touches?.[0]?.clientX || 0
    const clientY = event.clientY || event.touches?.[0]?.clientY || 0
    const sx = rect.width ? WALL_SIZE / rect.width : 1
    const sy = rect.height ? WALL_SIZE / rect.height : 1

    return {
      x: (clientX - rect.left) * sx,
      y: (clientY - rect.top) * sy,
      pressure: event.pressure || 1,
      time: Date.now()
    }
  }

  function onPointerDown(event) {
    if (readOnly) return
    if (event.button !== 0) return // Only left click

    const point = getPointFromEvent(event)
    startStroke(point)
  }

  function onPointerMove(event) {
    if (readOnly) return
    if (!isDrawing) return

    const point = getPointFromEvent(event)
    continueStroke(point)
  }

  function onPointerUp(event) {
    if (readOnly) return
    if (!isDrawing) return

    endStroke()
  }

  function onTouchStart(event) {
    if (readOnly) return
    event.preventDefault()

    for (const touch of event.changedTouches) {
      const point = getPointFromEvent({ clientX: touch.clientX, clientY: touch.clientY })
      point.touchId = touch.identifier
      activeTouches.set(touch.identifier, point)

      if (activeTouches.size === 1) {
        startStroke(point)
      }
    }
  }

  function onTouchMove(event) {
    if (readOnly) return
    event.preventDefault()

    for (const touch of event.changedTouches) {
      const point = getPointFromEvent({ clientX: touch.clientX, clientY: touch.clientY })
      point.touchId = touch.identifier
      activeTouches.set(touch.identifier, point)

      if (activeTouches.size === 1 && isDrawing) {
        continueStroke(point)
      }
    }
  }

  function onTouchEnd(event) {
    if (readOnly) return

    for (const touch of event.changedTouches) {
      activeTouches.delete(touch.identifier)
    }

    if (activeTouches.size === 0 && isDrawing) {
      endStroke()
    }
  }

  function startStroke(point) {
    isDrawing = true
    lastPoint = point

    currentStroke = {
      id: `stroke_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      tool,
      color,
      width: lineWidth,
      points: [point],
      author: 'local'
    }

    drawPoint(point)
  }

  function continueStroke(point) {
    if (!lastPoint) return

    // Draw line segment
    drawLine(lastPoint, point)

    // Add to current stroke
    currentStroke.points.push(point)
    lastPoint = point

    if (onStrokeUpdate) {
      onStrokeUpdate(currentStroke)
    }
  }

  function endStroke() {
    if (!currentStroke || currentStroke.points.length < 2) {
      isDrawing = false
      currentStroke = null
      lastPoint = null
      return
    }

    isDrawing = false
    strokes.push(currentStroke)
    addToHistory('add', currentStroke)

    if (onStrokeComplete) {
      onStrokeComplete(currentStroke)
    }

    currentStroke = null
    lastPoint = null
  }

  function drawPoint(point) {
    if (!ctx) return
    ctx.beginPath()
    ctx.arc(point.x, point.y, lineWidth / 2, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
  }

  function drawLine(from, to) {
    if (!ctx) return

    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.strokeStyle = tool === 'eraser' ? backgroundColor : color
    ctx.lineWidth = tool === 'eraser' ? lineWidth * 2 : lineWidth
    ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over'
    ctx.stroke()
    ctx.globalCompositeOperation = 'source-over'
  }

  function drawBackground() {
    if (!ctx) return

    ctx.fillStyle = backgroundColor
    ctx.fillRect(0, 0, WALL_SIZE, WALL_SIZE)

    // Draw subtle grid
    drawGrid()
  }

  function drawGrid() {
    if (!ctx) return
    ctx.strokeStyle = '#e2e8f0'
    ctx.lineWidth = GRID_LINE

    ctx.beginPath()
    for (let x = 0; x <= WALL_SIZE; x += GRID_STEP) {
      ctx.moveTo(x, 0)
      ctx.lineTo(x, WALL_SIZE)
    }
    for (let y = 0; y <= WALL_SIZE; y += GRID_STEP) {
      ctx.moveTo(0, y)
      ctx.lineTo(WALL_SIZE, y)
    }
    ctx.stroke()
  }

  function redrawAllStrokes() {
    drawBackground()

    for (const stroke of strokes) {
      drawStroke(stroke)
    }
  }

  function drawStroke(stroke) {
    if (!ctx || stroke.points.length < 2) return

    ctx.strokeStyle = stroke.tool === 'eraser' ? backgroundColor : stroke.color
    ctx.lineWidth = stroke.tool === 'eraser' ? stroke.width * 2 : stroke.width
    ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over'
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    ctx.beginPath()
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y)

    for (let i = 1; i < stroke.points.length; i++) {
      const point = stroke.points[i]
      ctx.lineTo(point.x, point.y)
    }

    ctx.stroke()
    ctx.globalCompositeOperation = 'source-over'
  }

  function addToHistory(action, stroke) {
    // Remove any redo history
    history = history.slice(0, historyIndex + 1)
    history.push({ action, stroke })
    historyIndex = history.length - 1

    // Limit history size
    if (history.length > 100) {
      history.shift()
      historyIndex--
    }
  }

  function undo() {
    if (historyIndex < 0) return false

    const entry = history[historyIndex]
    if (entry.action === 'add') {
      strokes = strokes.filter(s => s.id !== entry.stroke.id)
      historyIndex--
      redrawAllStrokes()
      return true
    }
    return false
  }

  function redo() {
    if (historyIndex >= history.length - 1) return false

    historyIndex++
    const entry = history[historyIndex]
    if (entry.action === 'add') {
      strokes.push(entry.stroke)
      redrawAllStrokes()
      return true
    }
    return false
  }

  function canUndo() {
    return historyIndex >= 0
  }

  function canRedo() {
    return historyIndex < history.length - 1
  }

  function clear() {
    strokes = []
    history = []
    historyIndex = -1
    drawBackground()
  }

  function loadStrokes(newStrokes) {
    strokes = newStrokes || []
    history = []
    historyIndex = -1
    redrawAllStrokes()
  }

  function addRemoteStroke(stroke) {
    // Check if stroke already exists
    if (strokes.some(s => s.id === stroke.id)) return

    strokes.push(stroke)
    drawStroke(stroke)
  }

  function removeRemoteStroke(strokeId) {
    const index = strokes.findIndex(s => s.id === strokeId)
    if (index !== -1) {
      strokes.splice(index, 1)
      redrawAllStrokes()
    }
  }

  function resetRemote() {
    strokes = []
    history = []
    historyIndex = -1
    drawBackground()
  }

  // Setters
  function setTool(newTool) {
    tool = newTool
  }

  function setColor(newColor) {
    color = newColor
  }

  function setLineWidth(newWidth) {
    lineWidth = newWidth
  }

  function setBackgroundColor(newColor) {
    backgroundColor = newColor
    drawBackground()
    redrawAllStrokes()
  }

  function setReadOnly(value) {
    readOnly = value
  }

  // Getters
  function getStrokes() {
    return [...strokes]
  }

  function getImageData(type = 'image/png', quality = 1.0) {
    if (!canvasRef.value) return null
    return canvasRef.value.toDataURL(type, quality)
  }

  function getBlob(type = 'image/png', quality = 1.0) {
    return new Promise(resolve => {
      if (!canvasRef.value) {
        resolve(null)
        return
      }
      canvasRef.value.toBlob(resolve, type, quality)
    })
  }

  return {
    init,
    destroy,
    undo,
    redo,
    canUndo,
    canRedo,
    clear,
    loadStrokes,
    addRemoteStroke,
    removeRemoteStroke,
    resetRemote,
    setTool,
    setColor,
    setLineWidth,
    setBackgroundColor,
    setReadOnly,
    getStrokes,
    getImageData,
    getBlob,
    // State
    get tool() { return tool },
    get color() { return color },
    get lineWidth() { return lineWidth },
    get isDrawing() { return isDrawing },
    get strokesCount() { return strokes.length }
  }
}
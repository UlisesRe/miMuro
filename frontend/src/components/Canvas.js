// ========================================
// miMuro - Canvas Component
// ========================================

import { useCanvas } from '../hooks/useCanvas.js'
import { useWebSocket } from '../hooks/useWebSocket.js'

export function CanvasComponent() {
  const canvasRef = { value: null }
  let canvasApi = null
  let wsApi = null
  let wallId = null
  let isOwner = false
  let userName = 'Anónimo'

  return {
    canvasRef,
    wallId: null,
    isOwner: false,
    userName: 'Anónimo',
    onlineUsers: [],
    cursors: [],
    loading: true,
    error: null,

    async init(wallId, isOwner, userName) {
      this.wallId = wallId
      this.isOwner = isOwner
      this.userName = userName

      // Initialize canvas
      canvasApi = useCanvas(this.canvasRef, {
        readOnly: !isOwner,
        onStrokeComplete: (stroke) => this.handleStrokeComplete(stroke),
        onStrokeUpdate: (stroke) => this.handleStrokeUpdate(stroke)
      })
      canvasApi.init()

      // Load existing strokes
      await this.loadStrokes()

      // Initialize WebSocket if not read-only
      if (!this.canvasApi.readOnly) {
        wsApi = useWebSocket(wallId, canvasApi, {
          onUserJoined: (data) => this.handleUserJoined(data),
          onUserLeft: (data) => this.handleUserLeft(data),
          onCursorMove: (data) => this.handleCursorMove(data),
          onConnect: () => this.loading = false,
          onError: (error) => this.handleError(error)
        })
        wsApi.setUser(this.getUserId(), userName)
        await wsApi.connect()
      } else {
        this.loading = false
      }
    },

    get canvasApi() {
      return canvasApi
    },

    async loadStrokes() {
      try {
        // For now, we'll load from a local API call
        // In a real app, this would come from the backend
        const response = await fetch(`/api/walls/${this.wallId}/strokes`)
        if (response.ok) {
          const strokes = await response.json()
          canvasApi.loadStrokes(strokes)
        }
      } catch (error) {
        console.error('Failed to load strokes:', error)
      }
    },

    handleStrokeComplete(stroke) {
      if (!wsApi) return

      // Send to backend
      fetch(`/api/walls/${this.wallId}/strokes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify(stroke)
      }).catch(console.error)

      // Broadcast via WebSocket
      wsApi.sendStroke(stroke)
    },

    handleStrokeUpdate(stroke) {
      // For real-time preview, could send cursor position
    },

    handleUserJoined(data) {
      this.onlineUsers.push(data)
    },

    handleUserLeft(data) {
      this.onlineUsers = this.onlineUsers.filter(u => u.user_id !== data.user_id)
    },

    handleCursorMove(data) {
      this.cursors = wsApi.getCursors()
    },

    handleError(error) {
      this.error = 'Error de conexión. Reintentando...'
    },

    getUserId() {
      const auth = Alpine.store('auth')
      return auth.user?.id || null
    },

    undo() {
      if (canvasApi.undo()) {
        // Send undo via WebSocket (delete last stroke)
        const strokes = canvasApi.getStrokes()
        if (strokes.length > 0 && wsApi) {
          wsApi.sendDeleteStroke(strokes[strokes.length - 1].id)
        }
      }
    },

    redo() {
      canvasApi.redo()
    },

    canUndo() {
      return canvasApi.canUndo()
    },

    canRedo() {
      return canvasApi.canRedo()
    },

    clear() {
      if (confirm('¿Estás seguro de que quieres borrar todo el lienzo?')) {
        canvasApi.clear()
        if (wsApi) wsApi.sendReset()
        // Also call backend reset
        fetch(`/api/walls/${this.wallId}/reset`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
        }).catch(console.error)
      }
    },

    setTool(tool) {
      canvasApi.setTool(tool)
    },

    setColor(color) {
      canvasApi.setColor(color)
    },

    setLineWidth(width) {
      canvasApi.setLineWidth(width)
    },

    destroy() {
      canvasApi?.destroy()
      wsApi?.disconnect()
    }
  }
}

// Alpine component registration
export function registerCanvasComponent(Alpine) {
  Alpine.data('canvasComponent', CanvasComponent)
}
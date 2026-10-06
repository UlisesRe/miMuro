// ========================================
// miMuro - WebSocket Hook
// ========================================

import { wsClient } from '../services/ws.js'
import { api } from '../services/api.js'

export function useWebSocket(wallId, canvasApi, options = {}) {
  const {
    onStroke,
    onDeleteStroke,
    onReset,
    onUserJoined,
    onUserLeft,
    onCursorMove,
    onConnect,
    onDisconnect,
    onError
  } = options

  let unsubscribers = []
  let currentUserId = null
  let currentUserName = 'Anónimo'
  let cursors = new Map()

  async function connect() {
    if (!wallId) return

    try {
      // Get auth token for WS connection
      const token = localStorage.getItem('auth_token')
      await wsClient.connect(wallId, token)

      // Setup message handlers
      unsubscribers = [
        wsClient.on('open', handleOpen),
        wsClient.on('stroke', handleStroke),
        wsClient.on('delete', handleDeleteStroke),
        wsClient.on('reset', handleReset),
        wsClient.on('user_joined', handleUserJoined),
        wsClient.on('user_left', handleUserLeft),
        wsClient.on('cursor', handleCursorMove),
        wsClient.on('close', handleClose),
        wsClient.on('error', handleError)
      ]

      // Send join message
      wsClient.send('join', {
        user_id: currentUserId,
        user_name: currentUserName
      })
    } catch (error) {
      console.error('WS connection failed:', error)
      if (onError) onError(error)
    }
  }

  function disconnect() {
    if (wsClient.isConnected()) {
      wsClient.send('leave', {})
    }

    // Cleanup handlers
    for (const unsub of unsubscribers) {
      unsub()
    }
    unsubscribers = []
    cursors.clear()
    wsClient.disconnect()
  }

  function handleOpen(data) {
    console.log('[WS] Connected to wall', data.wallId)
    if (onConnect) onConnect(data)
  }

  function handleStroke(stroke) {
    // Ignore our own strokes (already drawn locally)
    if (stroke.author_id === currentUserId) return

    if (canvasApi) {
      canvasApi.addRemoteStroke(stroke)
    }
    if (onStroke) onStroke(stroke)
  }

  function handleDeleteStroke(data) {
    if (canvasApi) {
      canvasApi.removeRemoteStroke(data.stroke_id)
    }
    if (onDeleteStroke) onDeleteStroke(data.stroke_id)
  }

  function handleReset() {
    if (canvasApi) {
      canvasApi.resetRemote()
    }
    if (onReset) onReset()
  }

  function handleUserJoined(data) {
    console.log('[WS] User joined:', data.user_name)
    if (onUserJoined) onUserJoined(data)
  }

  function handleUserLeft(data) {
    console.log('[WS] User left:', data.user_name)
    // Remove cursor
    cursors.delete(data.user_id)
    if (onUserLeft) onUserLeft(data)
  }

  function handleCursorMove(data) {
    if (data.user_id === currentUserId) return
    cursors.set(data.user_id, {
      x: data.x,
      y: data.y,
      name: data.user_name,
      color: data.color
    })
    if (onCursorMove) onCursorMove(data)
  }

  function handleClose(data) {
    console.log('[WS] Disconnected:', data.code, data.reason)
    if (onDisconnect) onDisconnect(data)
  }

  function handleError(error) {
    console.error('[WS] Error:', error)
    if (onError) onError(error)
  }

  // Public methods
  function sendStroke(stroke) {
    wsClient.sendStroke({
      ...stroke,
      author_id: currentUserId,
      author_name: currentUserName
    })
  }

  function sendDeleteStroke(strokeId) {
    wsClient.sendDeleteStroke(strokeId)
  }

  function sendReset() {
    wsClient.sendReset()
  }

  function sendCursorPosition(x, y) {
    wsClient.sendCursorPosition({
      x,
      y,
      user_id: currentUserId,
      user_name: currentUserName,
      color: canvasApi?.color || '#000000'
    })
  }

  function setUser(userId, userName) {
    currentUserId = userId
    currentUserName = userName
  }

  function getCursors() {
    return Array.from(cursors.values())
  }

  function isConnected() {
    return wsClient.isConnected()
  }

  return {
    connect,
    disconnect,
    sendStroke,
    sendDeleteStroke,
    sendReset,
    sendCursorPosition,
    setUser,
    getCursors,
    isConnected
  }
}
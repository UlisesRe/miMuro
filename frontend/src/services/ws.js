// ========================================
// miMuro - WebSocket Service
// ========================================

const WS_BASE = '/ws'

class WebSocketClient {
  constructor() {
    this.ws = null
    this.wallId = null
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 5
    this.reconnectDelay = 1000
    this.handlers = new Map()
    this.messageQueue = []
    this.isConnecting = false
    this.shouldReconnect = true
  }

  connect(wallId, token = null) {
    if (this.ws?.readyState === WebSocket.OPEN && this.wallId === wallId) {
      return Promise.resolve()
    }

    this.disconnect()
    this.wallId = wallId
    this.shouldReconnect = true
    this.isConnecting = true

    return new Promise((resolve, reject) => {
      const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}${WS_BASE}/walls/${wallId}${token ? `?token=${token}` : ''}`

      try {
        this.ws = new WebSocket(wsUrl)

        this.ws.onopen = () => {
          console.log('[WS] Connected to wall', wallId)
          this.reconnectAttempts = 0
          this.isConnecting = false
          this.flushQueue()
          this.emit('open', { wallId })
          resolve()
        }

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data)
            this.handleMessage(message)
          } catch (error) {
            console.error('[WS] Failed to parse message:', error)
          }
        }

        this.ws.onclose = (event) => {
          console.log('[WS] Disconnected:', event.code, event.reason)
          this.isConnecting = false
          this.emit('close', { code: event.code, reason: event.reason })

          if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect()
          }
        }

        this.ws.onerror = (error) => {
          console.error('[WS] Error:', error)
          this.emit('error', error)
          if (this.isConnecting) {
            this.isConnecting = false
            reject(error)
          }
        }
      } catch (error) {
        this.isConnecting = false
        reject(error)
      }
    })
  }

  scheduleReconnect() {
    this.reconnectAttempts++
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)
    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)

    setTimeout(() => {
      if (this.shouldReconnect && this.wallId) {
        this.connect(this.wallId).catch(() => {
          // Reconnect will be scheduled again in onclose
        })
      }
    }, delay)
  }

  disconnect() {
    this.shouldReconnect = false
    this.messageQueue = []

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect')
      this.ws = null
    }
    this.wallId = null
  }

  send(type, data) {
    const message = JSON.stringify({ type, data, timestamp: Date.now() })

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(message)
    } else {
      this.messageQueue.push(message)
    }
  }

  flushQueue() {
    while (this.messageQueue.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(this.messageQueue.shift())
    }
  }

  handleMessage(message) {
    const { type, data } = message
    this.emit(type, data)
    this.emit('message', message)
  }

  on(event, handler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set())
    }
    this.handlers.get(event).add(handler)

    return () => this.off(event, handler)
  }

  off(event, handler) {
    this.handlers.get(event)?.delete(handler)
  }

  emit(event, data) {
    this.handlers.get(event)?.forEach(handler => {
      try {
        handler(data)
      } catch (error) {
        console.error(`[WS] Handler error for ${event}:`, error)
      }
    })
  }

  // Convenience methods for canvas operations
  sendStroke(stroke) {
    this.send('stroke', stroke)
  }

  sendDeleteStroke(strokeId) {
    this.send('delete', { stroke_id: strokeId })
  }

  sendReset() {
    this.send('reset', {})
  }

  sendCursorPosition(position) {
    this.send('cursor', position)
  }

  getReadyState() {
    return this.ws?.readyState ?? WebSocket.CLOSED
  }

  isConnected() {
    return this.ws?.readyState === WebSocket.OPEN
  }
}

// Singleton instance
export const wsClient = new WebSocketClient()

export default wsClient
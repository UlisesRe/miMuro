// ========================================
// miMuro - Public Wall Page (for /w/:slug)
//
// Flow:
//   1. The visitor lands on a blurred view of
//      the wall inside the normal app page
//      (header, footer and nav stay visible).
//   2. They type their name and confirm.
//   3. The framed canvas becomes drawable plus
//      the floating drawing palette.
//      Signed-in users skip the name prompt.
// ========================================

import { api } from '../services/api.js'
import { useCanvas } from '../hooks/useCanvas.js'
import { wsClient } from '../services/ws.js'
import { trackOverlayInsets } from '../utils/overlayInsets.js'

const NAME_KEY = 'mimuro_visitor_name'

export function PublicWallPageComponent() {
  return {
    wall: null,
    loading: true,
    error: null,
    entered: false,
    nameInput: '',
    userName: 'Visitante',
    cursors: [],
    canvasApi: null,
    publicWallTemplate: PublicWallTemplate,

    async init() {
      const slug = this.$router.getParams().slug
      if (!slug) {
        this.error = 'El enlace del muro no es válido'
        this.loading = false
        return
      }

      await this.loadWall(slug)
    },

    destroy() {
      this._stopEnter?.()
      this.canvasApi?.destroy()
      wsClient.disconnect()
    },

    async loadWall(slug) {
      this.loading = true
      this.error = null

      try {
        this.wall = await api.request(`/walls/slug/${slug}`)

        // Signed-in visitors already have a name. Anonymous
        // ones that already signed in this tab keep the one
        // they entered; otherwise we show the prompt.
        if (this.$store.auth.user) {
          this.userName = this.$store.auth.user.name
          this.entered = true
        } else {
          const saved = sessionStorage.getItem(NAME_KEY)
          if (saved) {
            this.userName = saved
            this.nameInput = saved
            this.entered = true
          }
        }

        // The canvas only exists once the view has
        // rendered, so the flag has to drop and the
        // DOM has to settle before it can be wired.
        this.loading = false
        await this.$nextTick()
        // The name prompt is a fixed layer too: give it
        // the same header/footer insets so the app chrome
        // never disappears behind it.
        this._stopEnter = trackOverlayInsets(
          document.querySelector('.wall-enter')
        )
        if (!(await this.initCanvas())) return

        await this.loadStrokes()
        this.connectWebSocket()
      } catch (error) {
        this.error =
          error?.status === 404
            ? 'El muro que buscas no existe o ya no es público.'
            : error?.message === 'Error de conexión'
              ? 'No pudimos conectar con el servidor.'
              : 'No se pudo cargar el muro'
        this.loading = false
      }
    },

    enterWall() {
      const name = this.nameInput.trim()
      if (name.length < 2) {
        this.$store.toast.info('Escribí tu nombre para firmar')
        return
      }
      this.userName = name
      sessionStorage.setItem(NAME_KEY, name)
      this.entered = true
      this.$store.toast.success(`¡Hola, ${name}! Dejá tu firma en el muro`)
    },

    async initCanvas() {
      // Alpine only registers `x-ref`, and the canvas lives inside
      // an x-if branch, so wait for the element before wiring up.
      for (let attempt = 0; attempt < 10 && !this.$refs.canvasRef; attempt++) {
        await this.$nextTick()
      }

      const canvasEl = this.$refs.canvasRef
      if (typeof canvasEl?.getContext !== 'function') {
        this.error = 'No pudimos inicializar el lienzo.'
        this.loading = false
        return false
      }

      this.canvasApi = useCanvas({ value: canvasEl }, {
        // Public walls are open, so visitors can sign.
        readOnly: false,
        backgroundColor: this.wall?.background_color || '#ffffff',
        onStrokeComplete: (stroke) => this.handleStrokeComplete(stroke)
      })
      this.canvasApi.init()
      return true
    },

    async loadStrokes() {
      try {
        const data = await api.strokes.list(this.wall.id)
        this.canvasApi?.loadStrokes(data.strokes || data || [])
      } catch (error) {
        console.error('No se pudieron cargar los trazos:', error)
      }
    },

    connectWebSocket() {
      wsClient.on('stroke', (stroke) => {
        if (stroke.author_id !== this.getUserId()) {
          this.canvasApi?.addRemoteStroke(stroke)
        }
      })

      wsClient.on('delete', (data) => this.canvasApi?.removeRemoteStroke(data.stroke_id))
      wsClient.on('reset', () => this.canvasApi?.resetRemote())

      wsClient.on('cursor', (position) => {
        if (position.user_id !== this.getUserId()) this.cursors.push(position)
      })

      wsClient
        .connect(this.wall.id, this.$store.auth.getAuthHeader())
        .catch((error) => console.error('WebSocket no disponible:', error))
    },

    handleStrokeComplete(stroke) {
      const payload = {
        ...stroke,
        author_id: this.getUserId(),
        author_name: this.userName
      }

      api.strokes.create(this.wall.id, payload).catch(console.error)
      wsClient.sendStroke(payload)
    },

    getUserId() {
      return this.$store.auth.user?.id || null
    },

    undo() {
      if (this.canvasApi?.undo()) {
        const strokes = this.canvasApi.getStrokes()
        if (strokes.length > 0) wsClient.sendDeleteStroke(strokes[strokes.length - 1].id)
      }
    },

    redo() {
      this.canvasApi?.redo()
    }
  }
}

export function registerPublicWallPage(Alpine) {
  Alpine.data('publicWallPage', PublicWallPageComponent)
}

export const PublicWallTemplate = `
<div class="page page--wall"
     data-wall-page
     @keydown.ctrl.z.prevent="entered && undo()"
     @keydown.ctrl.y.prevent="entered && redo()"
     @keydown.meta.z.prevent="entered && undo()"
     @keydown.meta.y.prevent="entered && redo()">

  <template x-if="loading">
    <div class="state" role="status">
      <span class="spinner spinner--lg" aria-hidden="true"></span>
      <p class="state__text">Cargando el muro...</p>
    </div>
  </template>

  <template x-if="error && !loading">
    <div class="state state--error" role="alert">
      <span class="state__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
      </span>
      <h1 class="state__title">Muro no encontrado</h1>
      <p class="state__text" x-text="error"></p>
      <a href="/" class="btn btn--primary" @click.prevent="$router.navigate('/')">Volver al inicio</a>
    </div>
  </template>

  <!-- Name prompt: the canvas (blurred behind) is already
       loaded and shows every signature left so far. -->
  <template x-if="wall && !loading && !error && !entered">
    <div class="wall-enter" role="dialog" aria-modal="true" aria-labelledby="wall-enter-title">
      <div class="wall-enter__panel">
        <h1 class="wall-enter__title" id="wall-enter-title">Te toca firmar</h1>
        <p class="wall-enter__subtitle">
          Decinos tu nombre y dejá tu firma en
          <strong class="wall-enter__wall" x-text="wall.title"></strong>.
        </p>

        <form class="wall-enter__form" @submit.prevent="enterWall()">
          <input class="field__input wall-enter__input"
                 type="text"
                 x-model="nameInput"
                 maxlength="40"
                 autocomplete="nickname"
                 placeholder="Tu nombre"
                 aria-label="Tu nombre"
                 required>
          <button type="submit" class="btn btn--primary btn--lg btn--block"
                  :disabled="!nameInput.trim()">
            Entrar a firmar
          </button>
        </form>

        <p class="wall-enter__hint" x-show="!$store.auth.isAuthenticated">
          Lo verán los demás junto a tu firma.
        </p>
      </div>
    </div>
  </template>

  <!-- Drawing palette: round floating handle, drag to move -->
  <div x-show="wall && !loading && !error && entered"
       x-cloak>
    <div x-data="toolbarComponent">
      <div x-html="$store.templates.toolbar"></div>
    </div>
  </div>

  <!-- The framed canvas keeps the site look: container gutters,
       border and rounded corners. It flex-fills the height the
       app shell leaves free below the header. Loading happens
       as soon as the wall is known (behind the name prompt) so
       every prior signature is already in place on entry. -->
  <template x-if="wall && !loading && !error">
    <div class="wall-stage wall-stage--framed">
      <div class="container">
        <div class="wall-canvas-frame wall-canvas-frame--framed"
             :style="'--canvas-bg: ' + (wall.background_color || '#ffffff')">
          <div class="wall-canvas-holder">
            <canvas class="wall-canvas"
                    x-ref="canvasRef"
                    role="application"
                    aria-label="Lienzo de dibujo. Mantén pulsado y arrastra para firmar."></canvas>

            <div class="wall-cursors" aria-hidden="true">
              <template x-for="cursor in cursors" :key="cursor.user_id">
                <div class="remote-cursor"
                     :style="'left: ' + cursor.x + 'px; top: ' + cursor.y + 'px; --cursor-color: ' + (cursor.color || '#7c3aed')">
                  <span class="remote-cursor__pointer"></span>
                  <span class="remote-cursor__label" x-text="cursor.name"></span>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
  </template>
</div>
`
// ========================================
// miMuro - Dashboard Page ("Mis muros")
//
// Lista los muros del usuario con una preview JPEG del lienzo
// (fondo + trazos + firmas). Permite crear y editar un muro
// (mismo diálogo: nombre, color y visibilidad), reiniciarlo
// (borra los trazos) o eliminarlo, con confirmación.
// ========================================

import { api } from '../services/api.js'
import { whenAuthReady } from '../hooks/useAuth.js'
import { renderWallThumbnail } from '../utils/wallCanvas.js'

const ICONS = {
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
  brush: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.06 11.9 3.6 6.44A2 2 0 0 1 6.44 3.6l5.46 5.46"></path><path d="m14.5 9.5 5 5a2 2 0 0 1 0 2.83l-1.17 1.17a2 2 0 0 1-2.83 0l-5-5"></path><path d="m9 15-3 3-3 3 4-1 3-3"></path></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.9"></circle><circle cx="12" cy="12" r="1.9"></circle><circle cx="12" cy="19" r="1.9"></circle></svg>'
}

const PALETTE = [
  '#ffffff',
  '#fff3bf',
  '#ffd8a8',
  '#ffe3e3',
  '#d3f9d8',
  '#d0ebff',
  '#e5dbff',
  '#16181d'
]

export function DashboardPageComponent() {
  return {
    dashboardPageTemplate: DashboardPageTemplate,

    loading: true,
    loadError: null,
    walls: [],

    showCreate: false,
    creating: false,
    editingWall: null,
    openMenuId: null,
    confirming: null,
    confirmBusy: false,
    formError: null,
    palette: PALETTE,
    form: { title: '', background_color: '#ffffff', is_public: true },

    async init() {
      await whenAuthReady()

      if (!this.$store.auth.isAuthenticated) {
        this.$store.toast.info('Entrá a tu cuenta para ver tus muros')
        this.$router.navigate('/login')
        return
      }

      await this.loadWalls()
    },

    get firstName() {
      return (this.$store.auth.user?.name || '').trim().split(/\s+/)[0] || ''
    },

    async loadWalls() {
      this.loading = true
      this.loadError = null
      try {
        const data = await api.walls.list()
        this.walls = data.walls || []
        this.loadPreviews()
      } catch (error) {
        this.loadError = error?.message || 'No pudimos cargar tus muros'
      } finally {
        this.loading = false
      }
    },

    // La preview de cada tarjeta es la imagen del muro (fondo + trazos +
    // firmas). El listado no trae trazos, así que se pide cada muro en
    // paralelo y la tarjeta muestra el color del lienzo hasta que llegue.
    async loadPreviews() {
      const targets = this.walls.filter((wall) => (wall.strokes_count || 0) > 0)
      await Promise.all(targets.map((wall) => this.refreshPreview(wall)))
    },

    async refreshPreview(wall) {
      try {
        if ((wall.strokes_count || 0) === 0) {
          wall.preview = null
          return
        }
        const data = await api.walls.get(wall.id)
        wall.preview = renderWallThumbnail(data.strokes || [], wall.background_color)
      } catch {
        // Si falla, la tarjeta queda con el color de fondo del lienzo.
      }
    },

    strokeLabel(wall) {
      const total = wall.strokes_count || 0
      if (total === 0) return 'Lienzo en blanco'
      return total === 1 ? '1 trazo' : `${total} trazos`
    },

    openCreate() {
      this.editingWall = null
      this.form = { title: '', background_color: '#ffffff', is_public: true }
      this.formError = null
      this.showCreate = true
      this.$nextTick(() => this.$refs.createTitle?.focus())
    },

    openEdit(wall) {
      this.openMenuId = null
      this.editingWall = wall
      this.form = {
        title: wall.title,
        background_color: wall.background_color,
        is_public: wall.is_public
      }
      this.formError = null
      this.showCreate = true
      this.$nextTick(() => this.$refs.createTitle?.focus())
    },

    closeCreate() {
      if (this.creating) return
      this.showCreate = false
    },

    get modalTitle() {
      return this.editingWall ? 'Editar muro' : 'Nuevo muro'
    },

    get submitLabel() {
      if (this.creating) return this.editingWall ? 'Guardando...' : 'Creando...'
      return this.editingWall ? 'Guardar cambios' : 'Crear muro'
    },

    async saveWall() {
      if (this.creating) return

      const title = this.form.title.trim()
      if (!title) {
        this.formError = 'Poné un nombre para tu muro'
        return
      }

      this.creating = true
      this.formError = null
      try {
        const payload = {
          title,
          background_color: this.form.background_color,
          is_public: this.form.is_public
        }

        if (this.editingWall) {
          const updated = await api.walls.update(this.editingWall.id, payload)
          this.walls = this.walls.map((w) => (w.id === updated.id ? { ...w, ...updated } : w))
          this.showCreate = false
          this.$store.toast.success('Muro actualizado')
          const saved = this.walls.find((w) => w.id === updated.id)
          if (saved) this.refreshPreview(saved)
          return
        }

        const wall = await api.walls.create(payload)
        this.walls = [wall, ...this.walls]
        this.showCreate = false
        this.$store.toast.success('Muro creado')
        this.$router.navigate(`/dashboard/w/${wall.id}`)
      } catch (error) {
        const detail =
          error?.message && error.message !== 'Error de conexión' ? error.message : null
        this.formError =
          detail ||
          (this.editingWall
            ? 'No pudimos guardar los cambios. Inténtalo de nuevo.'
            : 'No pudimos crear el muro. Inténtalo de nuevo.')
      } finally {
        this.creating = false
      }
    },

    toggleMenu(id) {
      this.openMenuId = this.openMenuId === id ? null : id
    },

    askReset(wall) {
      this.openMenuId = null
      this.confirming = { type: 'reset', wall }
      this.$nextTick(() => this.$refs.confirmTitle?.focus())
    },

    askDelete(wall) {
      this.openMenuId = null
      this.confirming = { type: 'delete', wall }
      this.$nextTick(() => this.$refs.confirmTitle?.focus())
    },

    closeConfirm() {
      if (this.confirmBusy) return
      this.confirming = null
    },

    get confirmTitle() {
      return this.confirming?.type === 'delete' ? 'Eliminar muro' : 'Reiniciar muro'
    },

    get confirmMessage() {
      if (!this.confirming) return ''
      const name = this.confirming.wall.title
      return this.confirming.type === 'delete'
        ? `¿Confirmar eliminar muro (${name})?`
        : `¿Reiniciar el muro (${name})? Se borran todos los dibujos y firmas.`
    },

    get confirmLabel() {
      return this.confirming?.type === 'delete' ? 'Eliminar' : 'Reiniciar'
    },

    async runConfirm() {
      if (this.confirmBusy || !this.confirming) return
      const { type, wall } = this.confirming
      this.confirmBusy = true
      try {
        if (type === 'delete') {
          await api.walls.remove(wall.id)
          this.walls = this.walls.filter((w) => w.id !== wall.id)
          this.$store.toast.success('Muro eliminado')
        } else {
          await api.walls.saveStrokes(wall.id, [])
          this.walls = this.walls.map((w) =>
            w.id === wall.id ? { ...w, strokes_count: 0, preview: null } : w
          )
          this.$store.toast.success('Muro reiniciado')
        }
        this.confirming = null
      } catch (error) {
        this.$store.toast.error(error?.message || 'No pudimos completar la acción')
      } finally {
        this.confirmBusy = false
      }
    },

    openWall(wall) {
      this.$router.navigate(`/dashboard/w/${wall.id}`)
    }
  }
}

export function registerDashboardPage(Alpine) {
  Alpine.data('dashboardPage', DashboardPageComponent)
}

export const DashboardPageTemplate = `
<div class="page page--dashboard" @keydown.escape.window="openMenuId = null">
  <div class="container">

    <header class="page-header">
      <div>
        <h1 class="page-header__title">Mis muros</h1>
        <p class="page-header__subtitle">
          <span x-show="firstName" x-cloak>Hola, <span x-text="firstName"></span>. </span>Cada muro es un lienzo para llenar de firmas.
        </p>
      </div>
      <button type="button" class="btn btn--primary" @click="openCreate()">
        ${ICONS.plus}
        Nuevo muro
      </button>
    </header>

    <div class="state" x-show="loading" x-cloak>
      <span class="spinner spinner--lg" aria-hidden="true"></span>
      <p class="state__text">Cargando tus muros...</p>
    </div>

    <div class="state state--error" x-show="!loading && loadError" x-cloak>
      <span class="state__icon" aria-hidden="true">${ICONS.alert}</span>
      <h2 class="state__title">No pudimos cargar tus muros</h2>
      <p class="state__text" x-text="loadError"></p>
      <button type="button" class="btn btn--primary" @click="loadWalls()">Reintentar</button>
    </div>

    <div class="state" x-show="!loading && !loadError && walls.length === 0" x-cloak>
      <span class="state__icon" aria-hidden="true">${ICONS.brush}</span>
      <h2 class="state__title">Todavía no tenés muros</h2>
      <p class="state__text">
        Creá tu primer lienzo, elegí su color y empezá a llenarlo de firmas.
      </p>
      <button type="button" class="btn btn--primary btn--lg" @click="openCreate()">
        ${ICONS.plus}
        Crear mi primer muro
      </button>
    </div>

    <ul class="wall-grid" x-show="!loading && !loadError && walls.length > 0" x-cloak>
      <template x-for="wall in walls" :key="wall.id">
        <li>
          <div class="wall-card">
            <a class="wall-card__link" :href="'/dashboard/w/' + wall.id" @click.prevent="openWall(wall)">
              <span class="wall-card__thumb" :style="'background-color:' + wall.background_color">
                <template x-if="wall.preview">
                  <img class="wall-card__img" :src="wall.preview" :alt="'Vista previa de ' + wall.title">
                </template>
                <span class="badge wall-card__badge"
                      :class="wall.is_public ? 'badge--success' : 'badge--neutral'"
                      x-text="wall.is_public ? 'Público' : 'Privado'"></span>
              </span>
              <span class="wall-card__body">
                <span class="wall-card__title" x-text="wall.title"></span>
                <span class="wall-card__meta" x-text="strokeLabel(wall)"></span>
              </span>
            </a>

            <div class="wall-card__menu">
              <button type="button" class="wall-card__dots"
                      @click.stop="toggleMenu(wall.id)"
                      :aria-expanded="openMenuId === wall.id ? 'true' : 'false'"
                      aria-haspopup="menu" aria-label="Opciones del muro">
                ${ICONS.more}
              </button>
              <div class="wall-card__panel" x-show="openMenuId === wall.id" x-cloak
                   @click.outside="openMenuId = null"
                   x-transition.origin.top.right
                   role="menu" aria-label="Opciones del muro">
                <button type="button" class="wall-card__menu-item" role="menuitem" @click="openEdit(wall)">Editar</button>
                <button type="button" class="wall-card__menu-item" role="menuitem" @click="askReset(wall)">Reiniciar</button>
                <button type="button" class="wall-card__menu-item wall-card__menu-item--danger" role="menuitem" @click="askDelete(wall)">Eliminar</button>
              </div>
            </div>
          </div>
        </li>
      </template>
    </ul>

  </div>

  <div class="modal" x-show="showCreate" x-cloak @keydown.escape.window="closeCreate()">
    <div class="modal__backdrop" @click="closeCreate()"></div>

    <div class="modal__panel" role="dialog" aria-modal="true" aria-labelledby="create-wall-title">
      <form @submit.prevent="saveWall()">
        <header class="modal__header">
          <h2 class="modal__title" id="create-wall-title" tabindex="-1" x-ref="createTitle" x-text="modalTitle"></h2>
          <button type="button" class="btn btn--icon btn--ghost" @click="closeCreate()" aria-label="Cerrar">
            ${ICONS.close}
          </button>
        </header>

        <div class="modal__body">
          <div class="field">
            <label class="field__label" for="wall-title">Nombre del muro</label>
            <input id="wall-title" class="field__input" type="text" maxlength="100"
                   placeholder="Mi muro de cumpleaños"
                   x-model="form.title"
                   :aria-invalid="formError ? 'true' : 'false'">
            <p class="field__error" x-show="formError" x-cloak role="alert">
              ${ICONS.alert}<span x-text="formError"></span>
            </p>
          </div>

          <div class="field">
            <span class="field__label">Color del lienzo</span>
            <div class="swatches">
              <template x-for="color in palette" :key="color">
                <button type="button" class="swatch"
                        :class="{ 'swatch--active': form.background_color === color }"
                        :style="'background-color:' + color"
                        :aria-pressed="form.background_color === color ? 'true' : 'false'"
                        :aria-label="'Color ' + color"
                        @click="form.background_color = color">
                </button>
              </template>
            </div>
          </div>

          <div class="field">
            <span class="field__label">Visibilidad</span>
            <div class="choices">
              <button type="button" class="choice"
                      :class="{ 'choice--active': form.is_public }"
                      :aria-pressed="form.is_public ? 'true' : 'false'"
                      @click="form.is_public = true">
                <strong>Público</strong>
                <span>Quien tenga el link puede verlo.</span>
              </button>
              <button type="button" class="choice"
                      :class="{ 'choice--active': !form.is_public }"
                      :aria-pressed="!form.is_public ? 'true' : 'false'"
                      @click="form.is_public = false">
                <strong>Privado</strong>
                <span>Solo vos podés verlo.</span>
              </button>
            </div>
          </div>
        </div>

        <footer class="modal__footer">
          <button type="button" class="btn btn--ghost" @click="closeCreate()">Cancelar</button>
          <button type="submit" class="btn btn--primary"
                  :disabled="creating" :data-busy="creating ? 'true' : 'false'">
            <span class="spinner" x-show="creating" x-cloak aria-hidden="true"></span>
            <span x-text="submitLabel"></span>
          </button>
        </footer>
      </form>
    </div>
  </div>

  <div class="modal" x-show="confirming" x-cloak @keydown.escape.window="closeConfirm()">
    <div class="modal__backdrop" @click="closeConfirm()"></div>

    <div class="modal__panel" role="alertdialog" aria-modal="true" aria-labelledby="confirm-wall-title">
      <header class="modal__header">
        <h2 class="modal__title" id="confirm-wall-title" tabindex="-1" x-ref="confirmTitle" x-text="confirmTitle"></h2>
        <button type="button" class="btn btn--icon btn--ghost" @click="closeConfirm()" aria-label="Cerrar">
          ${ICONS.close}
        </button>
      </header>

      <div class="modal__body">
        <p class="modal__text" x-text="confirmMessage"></p>
      </div>

      <footer class="modal__footer">
        <button type="button" class="btn btn--ghost" @click="closeConfirm()" :disabled="confirmBusy">
          Cancelar
        </button>
        <button type="button" class="btn btn--danger"
                @click="runConfirm()" :disabled="confirmBusy"
                :data-busy="confirmBusy ? 'true' : 'false'">
          <span class="spinner" x-show="confirmBusy" x-cloak aria-hidden="true"></span>
          <span x-text="confirmBusy ? 'Un momento...' : confirmLabel"></span>
        </button>
      </footer>
    </div>
  </div>
</div>
`

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
import { WALL_BACKGROUNDS, DEFAULT_BACKGROUND } from '../utils/constants.js'
import { openModal, closeModal, trapFocus } from '../utils/accessibility.js'
import { ICONS } from '../utils/icons.js'

const PALETTE = WALL_BACKGROUNDS

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
    form: { title: '', background_color: DEFAULT_BACKGROUND, is_public: true },
    shareOpen: false,
    shareWall: null,
    shareUrl: '',

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
      if ((wall.strokes_count || 0) === 0) {
        wall.preview = null
        wall.previewLoading = false
        return
      }
      wall.previewLoading = true
      try {
        const data = await api.walls.get(wall.id)
        wall.preview = renderWallThumbnail(data.strokes || [], wall.background_color)
      } catch {
        // Si falla, la tarjeta queda con el color de fondo del lienzo.
      } finally {
        wall.previewLoading = false
      }
    },

    strokeLabel(wall) {
      const total = wall.strokes_count || 0
      if (total === 0) return 'Lienzo en blanco'
      return total === 1 ? '1 trazo' : `${total} trazos`
    },

    openCreate() {
      this.editingWall = null
      this.form = { title: '', background_color: DEFAULT_BACKGROUND, is_public: true }
      this.formError = null
      this.showCreate = true
      openModal(this, 'create', { initialFocus: () => this.$refs.createTitle })
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
      openModal(this, 'create', { initialFocus: () => this.$refs.createTitle })
    },

    closeCreate() {
      if (this.creating) return
      this.showCreate = false
      closeModal(this, 'create')
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
      openModal(this, 'confirm', { initialFocus: () => this.$refs.confirmTitle })
    },

    askDelete(wall) {
      this.openMenuId = null
      this.confirming = { type: 'delete', wall }
      openModal(this, 'confirm', { initialFocus: () => this.$refs.confirmTitle })
    },

    closeConfirm() {
      if (this.confirmBusy) return
      this.confirming = null
      closeModal(this, 'confirm')
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
    },

    openShare(wall) {
      this.openMenuId = null
      this.shareWall = wall
      const origin = window.location.origin
      this.shareUrl = origin + '/w/' + wall.slug
      this.shareOpen = true
      openModal(this, 'share', { initialFocus: () => this.$refs.shareCopy })
    },

    closeShare() {
      this.shareOpen = false
      this.shareWall = null
      closeModal(this, 'share')
    },

    // Atrapa el Tab dentro del modal abierto (se engancha en @keydown.tab).
    trapModal(event, ref) {
      trapFocus(event, this.$refs[ref])
    },

    async copyShare() {
      try {
        await navigator.clipboard.writeText(this.shareUrl)
        this.$store.toast.success('Enlace copiado')
      } catch {
        this.$store.toast.error('No pudimos copiar el enlace')
      }
    },

    shareOnFacebook() {
      const url = encodeURIComponent(this.shareUrl)
      window.open('https://www.facebook.com/sharer/sharer.php?u=' + url, '_blank', 'noopener,noreferrer')
    },

    shareOnWhatsApp() {
      const text = encodeURIComponent('Mira mi muro: ' + this.shareUrl)
      window.open('https://api.whatsapp.com/send?text=' + text, '_blank', 'noopener,noreferrer')
    },

    shareOnTwitter() {
      const text = encodeURIComponent('Mira mi muro: ' + this.shareUrl)
      const url = encodeURIComponent(this.shareUrl)
      window.open('https://twitter.com/intent/tweet?url=' + url + '&text=' + text, '_blank', 'noopener,noreferrer')
    },

    shareOnTelegram() {
      const text = encodeURIComponent('Mira mi muro: ' + this.shareUrl)
      const url = encodeURIComponent(this.shareUrl)
      window.open('https://t.me/share/url?url=' + url + '&text=' + text, '_blank', 'noopener,noreferrer')
    },

    shareOnInstagram() {
      this.copyShare()
      this.$store.toast.info('Enlace copiado. Abrí Instagram Stories y pegalo.')
      window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer')
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
                <span class="wall-card__shimmer skeleton" x-show="wall.previewLoading" x-cloak aria-hidden="true"></span>
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
                <button type="button" class="wall-card__menu-item" role="menuitem" @click="openShare(wall)">Compartir</button>
                <button type="button" class="wall-card__menu-item wall-card__menu-item--danger" role="menuitem" @click="askDelete(wall)">Eliminar</button>
              </div>
            </div>
          </div>
        </li>
      </template>
    </ul>

  </div>

  <div class="modal" x-show="showCreate" x-cloak
       @keydown.escape.window="closeCreate()" @keydown.tab="trapModal($event, 'createPanel')">
    <div class="modal__backdrop" @click="closeCreate()"></div>

    <div class="modal__panel" x-ref="createPanel"
         role="dialog" aria-modal="true" aria-labelledby="create-wall-title">
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

  <div class="modal" x-show="confirming" x-cloak
       @keydown.escape.window="closeConfirm()" @keydown.tab="trapModal($event, 'confirmPanel')">
    <div class="modal__backdrop" @click="closeConfirm()"></div>

    <div class="modal__panel" x-ref="confirmPanel"
         role="alertdialog" aria-modal="true" aria-labelledby="confirm-wall-title">
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

  <div class="modal" x-show="shareOpen" x-cloak
       @keydown.escape.window="closeShare()" @keydown.tab="trapModal($event, 'sharePanel')">
    <div class="modal__backdrop" @click="closeShare()"></div>

    <div class="modal__panel" x-ref="sharePanel"
         role="dialog" aria-modal="true" aria-labelledby="share-wall-title">
      <header class="modal__header">
        <h2 class="modal__title" id="share-wall-title" tabindex="-1">Compartir muro</h2>
        <button type="button" class="btn btn--icon btn--ghost" @click="closeShare()" aria-label="Cerrar">
          ${ICONS.close}
        </button>
      </header>

      <div class="modal__body">
        <p class="modal__text">Copiá el enlace para que la gente pueda firmar tu muro.</p>
        <div class="field">
          <label class="field__label" for="share-url">Enlace</label>
          <input id="share-url" class="field__input" type="text" readonly x-ref="shareCopy" :value="shareUrl">
        </div>
        <div class="field">
          <span class="field__label">Compartir en</span>
          <div class="share-grid">
            <button type="button" class="btn btn--ghost btn--sm" @click="copyShare()">
              ${ICONS.link}<span>Copiar link</span>
            </button>
            <button type="button" class="btn btn--ghost btn--sm" @click="shareOnInstagram()">
              ${ICONS.instagram}<span>Instagram</span>
            </button>
            <button type="button" class="btn btn--ghost btn--sm" @click="shareOnFacebook()">
              ${ICONS.facebook}<span>Facebook</span>
            </button>
            <button type="button" class="btn btn--ghost btn--sm" @click="shareOnWhatsApp()">
              ${ICONS.whatsapp}<span>WhatsApp</span>
            </button>
            <button type="button" class="btn btn--ghost btn--sm" @click="shareOnTwitter()">
              ${ICONS.twitter}<span>X (Twitter)</span>
            </button>
            <button type="button" class="btn btn--ghost btn--sm" @click="shareOnTelegram()">
              ${ICONS.telegram}<span>Telegram</span>
            </button>
          </div>
        </div>
      </div>

      <footer class="modal__footer">
        <button type="button" class="btn btn--ghost" @click="closeShare()">Cerrar</button>
        <button type="button" class="btn btn--primary" @click="copyShare()">Copiar enlace</button>
      </footer>
    </div>
  </div>
</div>
`

// ========================================
// miMuro - WallCard Component
// ========================================

import { api } from '../services/api.js'

export function WallCardComponent() {
  return {
    wall: null,
    isOwner: false,
    onDelete: null,
    onEdit: null,
    confirming: false,
    // Alpine calls init() with no arguments when the
    // component is created, so an absent wall is
    // normal until x-init passes the real one.
    init(wall, isOwner, onDelete, onEdit) {
      if (!wall) return
      this.wall = wall
      this.isOwner = isOwner
      this.onDelete = onDelete
      this.onEdit = onEdit
    },

    formatDate(dateString) {
      if (!dateString) return ''
      return new Date(dateString).toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      })
    },

    getStrokesCount() {
      return this.wall?.strokes_count ?? 0
    },

    handleClick() {
      if (this.confirming) return
      this.$router.navigate(`/wall/${this.wall.id}`)
    },

    handleEdit() {
      this.onEdit?.(this.wall)
    },

    async handleDelete() {
      this.confirming = true

      try {
        await api.walls.delete(this.wall.id)
        this.onDelete?.(this.wall.id)
      } catch (error) {
        this.$store.toast.error(
          error?.message === 'Error de conexión'
            ? 'Sin conexión: no pudimos eliminar el muro'
            : 'No pudimos eliminar el muro'
        )
      } finally {
        this.confirming = false
      }
    },

    getShareUrl() {
      return `${window.location.origin}/w/${this.wall.slug}`
    },

    async copyShareUrl() {
      try {
        await navigator.clipboard.writeText(this.getShareUrl())
        this.$store.toast.success('Link copiado al portapapeles')
      } catch {
        // Clipboard needs a secure context and can be
        // blocked by permissions.
        this.$store.toast.info('Copia el link desde la barra de direcciones')
      }
    }
  }
}

export function registerWallCardComponent(Alpine) {
  Alpine.data('wallCard', WallCardComponent)
}

export const WallCardTemplate = `
<article class="wall-card"
         @click="handleClick()"
         @keydown.enter="handleClick()"
         @keydown.space.prevent="handleClick()"
         role="button"
         tabindex="0"
         :aria-label="'Abrir el muro ' + wall.title">

  <span class="wall-card__bar"
        x-show="wall.background_color && wall.background_color !== '#ffffff'"
        :style="'background-color: ' + (wall.background_color || '#ffffff')"
        aria-hidden="true"></span>

  <div class="wall-card__body">
    <h3 class="wall-card__title" x-text="wall.title"></h3>
    <p class="wall-card__description" x-text="wall.description || 'Sin descripción'"></p>

    <div class="wall-card__meta">
      <span class="badge" :class="wall.is_public ? 'badge--success' : 'badge--neutral'"
            x-text="wall.is_public ? 'Público' : 'Privado'"></span>
      <span x-text="formatDate(wall.created_at)"></span>
      <span aria-hidden="true">·</span>
      <span x-text="getStrokesCount() + (getStrokesCount() === 1 ? ' trazo' : ' trazos')"></span>
    </div>
  </div>

  <div class="wall-card__footer">
    <div class="wall-card__owner">
      <span class="avatar avatar--sm"
            x-text="(wall.owner_name || '?').charAt(0).toUpperCase()"></span>
      <span class="wall-card__owner-name" x-text="wall.owner_name || 'Desconocido'"></span>
    </div>

    <div class="wall-card__actions">
      <template x-if="isOwner">
        <button type="button" class="btn btn--ghost btn--icon btn--sm"
                @click.stop="copyShareUrl()" title="Copiar link" aria-label="Copiar link para compartir">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
          </svg>
        </button>

        <button type="button" class="btn btn--ghost btn--icon btn--sm"
                @click.stop="handleEdit()" title="Editar" aria-label="Editar muro">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4L18.5 2.5z"></path>
          </svg>
        </button>

        <button type="button" class="btn btn--danger btn--icon btn--sm"
                @click.stop="handleDelete()" :disabled="confirming"
                title="Eliminar" aria-label="Eliminar muro">
          <span class="spinner" x-show="confirming" x-cloak aria-hidden="true"></span>
          <svg x-show="!confirming" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </template>
    </div>
  </div>
</article>
`
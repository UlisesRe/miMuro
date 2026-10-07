// ========================================
// miMuro - Share Wall Modal Component
// ========================================

export function ShareWallModalComponent() {
  return {
    open: false,
    wall: null,
    copied: false,
    copyTimeout: null,

    get shareUrl() {
      if (!this.wall) return ''
      return `${window.location.origin}/w/${this.wall.slug}`
    },

    get shareText() {
      if (!this.wall) return 'Firma mi muro en miMuro'
      return `Firma mi muro "${this.wall.title}" en miMuro`
    },

    get shareTitle() {
      if (!this.wall) return 'miMuro'
      return this.wall.title
    },

    openModal(wall) {
      this.wall = wall
      this.open = true
      this.copied = false
      if (this.copyTimeout) clearTimeout(this.copyTimeout)
    },

    closeModal() {
      this.open = false
      this.wall = null
      if (this.copyTimeout) clearTimeout(this.copyTimeout)
    },

    async copyUrl() {
      try {
        await navigator.clipboard.writeText(this.shareUrl)
        this.copied = true
        this.copyTimeout = setTimeout(() => {
          this.copied = false
          this.copyTimeout = null
        }, 2000)
        this.$store.toast.success('Link copiado al portapapeles')
      } catch {
        this.$store.toast.info(`Copia el link: ${this.shareUrl}`)
      }
    },

    shareNative() {
      if (!navigator.share) return
      navigator
        .share({
          title: this.shareTitle,
          text: this.shareText,
          url: this.shareUrl
        })
        .catch((error) => {
          if (error?.name === 'AbortError') return
        })
    },

    shareWhatsApp() {
      const text = encodeURIComponent(`${this.shareText}\n${this.shareUrl}`)
      window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer')
    },

    shareTwitter() {
      const text = encodeURIComponent(this.shareText)
      const url = encodeURIComponent(this.shareUrl)
      window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank', 'noopener,noreferrer')
    },

    shareFacebook() {
      const url = encodeURIComponent(this.shareUrl)
      window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank', 'noopener,noreferrer')
    },

    shareLinkedIn() {
      const url = encodeURIComponent(this.shareUrl)
      const title = encodeURIComponent(this.shareTitle)
      const summary = encodeURIComponent(this.shareText)
      window.open(
        `https://www.linkedin.com/sharing/share-offsite/?url=${url}&title=${title}&summary=${summary}`,
        '_blank',
        'noopener,noreferrer'
      )
    },

    shareTelegram() {
      const text = encodeURIComponent(`${this.shareText}\n${this.shareUrl}`)
      window.open(`https://t.me/share/url?text=${text}`, '_blank', 'noopener,noreferrer')
    },

    shareEmail() {
      const subject = encodeURIComponent(this.shareTitle)
      const body = encodeURIComponent(`${this.shareText}\n\n${this.shareUrl}`)
      window.location.href = `mailto:?subject=${subject}&body=${body}`
    },

    async downloadQr() {
      try {
        const url = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&format=png&data=${encodeURIComponent(this.shareUrl)}`
        const res = await fetch(url)
        const blob = await res.blob()
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `mimuro-${(this.wall?.slug || 'qr')}.png`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(a.href)
      } catch (error) {
        this.$store.toast.error('No se pudo descargar el QR')
      }
    }
  }
}

export function registerShareWallModal(Alpine) {
  Alpine.data('shareWallModal', ShareWallModalComponent)
}

export const ShareWallModalTemplate = `
<div class="modal-overlay"
     x-data="shareWallModal"
     x-show="open"
     x-cloak
     @click.self="closeModal()"
     @keydown.escape.window="closeModal()"
     @wall:share.window="openModal($event.detail)"
     role="dialog"
     aria-modal="true"
     aria-labelledby="share-modal-title">
  <div class="modal share-dialog">
    <span class="modal__handle" aria-hidden="true"></span>

    <header class="modal__header">
      <div>
        <h2 class="modal__title" id="share-modal-title">Compartir muro</h2>
        <p class="modal__subtitle" x-text="wall?.title"></p>
      </div>
      <button type="button" class="btn btn--ghost btn--icon" @click="closeModal()" aria-label="Cerrar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </header>

    <div class="modal__body">
      <div class="share-field">
        <input class="field__input share-field__input"
               type="text"
               :value="shareUrl"
               readonly
               @click="$event.target.select()">
        <button type="button" class="btn btn--primary" @click="copyUrl()">
          <span x-text="copied ? '¡Copiado!' : 'Copiar link'"></span>
        </button>
      </div>

      <p class="share-grid__label">Enviar por</p>

      <div class="share-grid">
        <button type="button" class="share-item" @click="shareWhatsApp()" aria-label="Compartir en WhatsApp">
          <span class="share-item__icon share-item__icon--whatsapp">
            <svg viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M19.11 17.205c-.372 0-1.088 1.39-1.518 1.39a.63.63 0 0 1-.315-.1c-.802-.402-1.504-.817-2.163-1.447-.545-.516-1.146-1.29-1.46-1.963a.426.426 0 0 1-.073-.215c0-.33.99-.945.99-1.49 0-.143-.73-2.09-.832-2.335-.143-.372-.214-.487-.6-.487-.187 0-.36-.043-.53-.043-.302 0-.53.115-.746.315-.688.645-1.032 1.318-1.06 2.264v.114c-.015.99.472 1.977 1.017 2.78 1.23 1.82 2.506 3.41 4.554 4.34.616.287 2.035.888 2.722.888.817 0 2.15-.515 2.478-1.318.13-.33.244-.73.244-1.088 0-.058 0-.144-.03-.215-.1-.172-2.434-1.39-2.678-1.39zm-2.908 7.593c-1.747 0-3.48-.53-4.942-1.49L7.793 24.41l1.132-3.337a8.955 8.955 0 0 1-1.72-5.272c0-4.955 4.04-8.995 8.997-8.995S25.2 10.845 25.2 15.8c0 4.958-4.04 8.998-8.998 8.998zm0-19.798c-5.96 0-10.8 4.842-10.8 10.8 0 1.964.53 3.898 1.546 5.574L5 27.176l5.974-1.92a10.807 10.807 0 0 0 16.03-9.455c0-5.958-4.842-10.8-10.802-10.8z"/></svg>
          </span>
          <span>WhatsApp</span>
        </button>

        <button type="button" class="share-item" @click="shareTelegram()" aria-label="Compartir en Telegram">
          <span class="share-item__icon share-item__icon--telegram">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z"/></svg>
          </span>
          <span>Telegram</span>
        </button>

        <button type="button" class="share-item" @click="shareTwitter()" aria-label="Compartir en X">
          <span class="share-item__icon share-item__icon--x">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
          </span>
          <span>X</span>
        </button>

        <button type="button" class="share-item" @click="shareFacebook()" aria-label="Compartir en Facebook">
          <span class="share-item__icon share-item__icon--facebook">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M13 22v-9h3l.5-3H13V8c0-.9.3-1.5 1.5-1.5H17V4h-2.8C11.8 4 10 5.8 10 8v2H7v3h3v9h3z"/></svg>
          </span>
          <span>Facebook</span>
        </button>

        <button type="button" class="share-item" @click="shareLinkedIn()" aria-label="Compartir en LinkedIn">
          <span class="share-item__icon share-item__icon--linkedin">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.94 5a2 2 0 1 1-4-.002 2 2 0 0 1 4 .002zM7 8.48H3V21h4V8.48zm6.32 0H9.34V21h3.94v-6.57c0-3.66 4.77-4 4.77 0V21H22v-7.93c0-6.17-7.06-5.94-8.72-2.91l.04-1.68z"/></svg>
          </span>
          <span>LinkedIn</span>
        </button>

        <button type="button" class="share-item" @click="shareEmail()" aria-label="Compartir por correo">
          <span class="share-item__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
          </span>
          <span>Correo</span>
        </button>

        <button type="button" class="share-item" @click="shareNative()" x-show="navigator.share" aria-label="Compartir nativo">
          <span class="share-item__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
          </span>
          <span>Más</span>
        </button>

        <button type="button" class="share-item" @click="downloadQr()" aria-label="Descargar código QR">
          <span class="share-item__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="5" height="5"></rect><rect x="16" y="3" width="5" height="5"></rect><rect x="3" y="16" width="5" height="5"></rect><path d="M21 16h-3a2 2 0 0 0-2 2v3"></path><path d="M21 21v.01"></path><path d="M12 7v3a2 2 0 0 1-2 2H7"></path><path d="M3 12h.01"></path><path d="M12 3h.01"></path><path d="M12 16v.01"></path><path d="M16 12h1"></path><path d="M21 12v.01"></path><path d="M12 21v-1"></path></svg>
          </span>
          <span>QR</span>
        </button>
      </div>
    </div>
  </div>
</div>
`
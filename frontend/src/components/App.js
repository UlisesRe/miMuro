// ========================================
// miMuro - App Shell (header, navigation,
// routing outlet and global overlays)
// ========================================

import AppTemplate from './AppTemplate.html?raw'

// Pages that own the whole viewport and should
// not carry the app navigation.
const AUTH_PAGES = ['LoginPage', 'RegisterPage']

// The dashboard has its own "Nuevo muro" button and
// the wall pages need the canvas, so the FAB only
// shows on the landing page.
const FAB_PAGES = ['HomePage']

export function AppComponent() {
  return {
    currentPage: 'HomePage',
    appTemplate: AppTemplate,

    scrolled: false,

    init() {
      window.addEventListener('route-change', (event) => {
        this.currentPage = event.detail.component
      })
      this.currentPage = this.$store.app.currentPage || 'HomePage'

      this.$watch('currentPage', () => this.handleRouteChange())
      this.onScroll = () => {
        this.scrolled = window.scrollY > 8
      }
      window.addEventListener('scroll', this.onScroll, { passive: true })
    },

    destroy() {
      window.removeEventListener('scroll', this.onScroll)
    },

    handleRouteChange() {
      const authed = this.$store.auth.isAuthenticated

      // Someone who is already signed in has no
      // business on the login or register screens.
      if (authed && AUTH_PAGES.includes(this.currentPage)) {
        this.$router.replace('/dashboard')
        return
      }

      // A new page starts at the top. 'instant'
      // avoids the smooth-scroll animation fighting
      // the route change.
      window.scrollTo({ top: 0, behavior: 'instant' })
    },

    // ------------------------------------
    // Navigation state
    // ------------------------------------

    get isAuthPage() {
      return AUTH_PAGES.includes(this.currentPage)
    },

    get showAppNav() {
      return !this.isAuthPage && this.currentPage !== 'NotFoundPage'
    },

    get showFab() {
      return FAB_PAGES.includes(this.currentPage)
    },

    get showFooter() {
      return !this.isAuthPage
    },

    get initials() {
      const name = this.$store.auth.user?.name?.trim()
      if (!name) return '?'
      const parts = name.split(/\s+/)
      if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
      return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
    },

    isActive(page) {
      if (page === 'HomePage') return this.currentPage === 'HomePage'
      return this.currentPage === page
    },

    // ------------------------------------
    // Actions
    // ------------------------------------

    onFabClick() {
      if (!this.$store.auth.isAuthenticated) {
        this.$router.navigate('/register')
        return
      }
      this.$store.app.openCreateWall()
    },

    logout() {
      this.$store.auth.logout()
      this.$router.navigate('/')
    }
  }
}

export function registerAppComponent(Alpine) {
  Alpine.data('appComponent', AppComponent)
}
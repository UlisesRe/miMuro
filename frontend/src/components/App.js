// ========================================
// miMuro - App Shell (header, navigation,
// routing outlet and footer)
// ========================================

import AppTemplate from './AppTemplate.html?raw'

// Pages that own the whole viewport and should
// not carry the app navigation.
const AUTH_PAGES = ['LoginPage', 'RegisterPage']

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
      // Focus the routed content so screen readers and
      // the keyboard land in the right place.
      this.$nextTick(() => {
        const main = document.getElementById('main-content')
        if (main) main.focus({ preventScroll: true })
      })
    },

    get isAuthPage() {
      return AUTH_PAGES.includes(this.currentPage)
    },

    get showAppNav() {
      return !this.isAuthPage
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
      return this.currentPage === page
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

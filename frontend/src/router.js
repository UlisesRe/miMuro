// ========================================
// miMuro - Client-side Router
// ========================================

const routes = {
  '/': 'HomePage',
  '/login': 'LoginPage',
  '/register': 'RegisterPage',
  '/dashboard': 'DashboardPage',
  '/w/:slug': 'PublicWallPage',
  '/privacy': 'LegalPage',
  '/terms': 'LegalPage',
  '/contact': 'LegalPage'
}

const routeParams = new Map()

export function initRouter(Alpine) {
  let currentRoute = null
  let currentComponent = null

  function parsePath(path) {
    const [pathname, search] = path.split('?')
    const params = {}
    let matchedRoute = null
    let matchedPattern = null

    for (const [pattern, component] of Object.entries(routes)) {
      const regexPattern = pattern
        .replace(/:[^/]+/g, '([^/]+)')
        .replace(/\//g, '\\/')
      const regex = new RegExp(`^${regexPattern}$`)
      const match = pathname.match(regex)
      if (match) {
        matchedRoute = component
        matchedPattern = pattern
        const paramNames = pattern.match(/:([^/]+)/g) || []
        paramNames.forEach((name, index) => {
          params[name.slice(1)] = match[index + 1]
        })
        break
      }
    }

    return {
      component: matchedRoute || 'NotFoundPage',
      params,
      query: new URLSearchParams(search || ''),
      pathname
    }
  }

  function navigate(path) {
    console.log('[Router] navigate to:', path)
    window.history.pushState({}, '', path)
    handleRouteChange(path)
  }

  function replace(path) {
    console.log('[Router] replace to:', path)
    window.history.replaceState({}, '', path)
    handleRouteChange(path)
  }

  function handleRouteChange(path) {
    const route = parsePath(path)
    currentRoute = route

    // Update app store
    Alpine.store('app').currentPage = route.component

    // Dispatch event for components to listen
    window.dispatchEvent(new CustomEvent('route-change', {
      detail: route
    }))
  }

  // Handle browser back/forward
  window.addEventListener('popstate', () => {
    handleRouteChange(window.location.pathname + window.location.search)
  })

  // Handle initial load
  handleRouteChange(window.location.pathname + window.location.search)

  // Make router globally accessible
  const router = {
    navigate,
    replace,
    getCurrentRoute: () => currentRoute,
    getParams: () => currentRoute?.params || {},
    getQuery: () => currentRoute?.query || {}
  }

  // Alpine magic for router
  Alpine.magic('router', () => router)

  return router
}

// Helper to generate URLs
export function urlFor(routeName, params = {}) {
  let pattern = Object.entries(routes).find(([, v]) => v === routeName)?.[0] || '/'
  for (const [key, value] of Object.entries(params)) {
    pattern = pattern.replace(`:${key}`, value)
  }
  return pattern
}
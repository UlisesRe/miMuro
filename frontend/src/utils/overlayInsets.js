// ========================================
// miMuro - Overlay insets
//
// A fixed layer (wall overlay, name prompt)
// must live in the space between the app
// header and the footer: the chrome never
// disappears, in any instance of the site.
// The footer height is unknown (it wraps),
// so it is measured and published as the
// --overlay-bottom custom property.
// ========================================

export function trackOverlayInsets(el) {
  if (!el) return () => {}

  const apply = () => {
    const footer = document.querySelector('.footer')
    const visible = footer && getComputedStyle(footer).display !== 'none'
    const height = visible ? Math.round(footer.getBoundingClientRect().height) : 0
    el.style.setProperty('--overlay-bottom', `${height}px`)
  }

  apply()

  const footer = document.querySelector('.footer')
  const observer =
    footer && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(apply) : null
  observer?.observe(footer)
  window.addEventListener('resize', apply)

  return () => {
    observer?.disconnect()
    window.removeEventListener('resize', apply)
  }
}

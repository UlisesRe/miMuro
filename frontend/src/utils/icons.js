// ========================================
// miMuro - Iconos SVG
//
// Un único lugar para los íconos que usan las páginas. Todos son
// "inline" (sin dependencias), decorativos por defecto (`aria-hidden`)
// y heredan el color con `currentColor`, así el mismo ícono sirve en un
// botón claro u oscuro. Si un ícono necesita un nombre accesible, el
// texto va en el `aria-label` del botón que lo envuelve.
// ========================================

// Base común: trazo redondeado y tamaño heredado del CSS.
const svg = (body, { fill = false, width = 2 } = {}) =>
  fill
    ? `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${body}</svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`

export const ICONS = {
  // Navegación
  back: svg('<line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline>'),
  close: svg('<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>'),
  plus: svg('<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>'),
  minus: svg('<line x1="5" y1="12" x2="19" y2="12"></line>'),
  more: svg('<circle cx="12" cy="5" r="1.9"></circle><circle cx="12" cy="12" r="1.9"></circle><circle cx="12" cy="19" r="1.9"></circle>', { fill: true }),
  download: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line>'),
  link: svg('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>'),

  // Herramientas del lienzo
  pen: svg('<path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="M2 2l7.586 7.586"></path><circle cx="11" cy="11" r="2"></circle>', { width: 1.9 }),
  eraser: svg('<path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l9.6-9.6a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L13 21"></path><path d="M22 21H7"></path><path d="m5 11 9 9"></path>', { width: 1.9 }),
  brush: svg('<path d="M9.06 11.9 3.6 6.44A2 2 0 0 1 6.44 3.6l5.46 5.46"></path><path d="m14.5 9.5 5 5a2 2 0 0 1 0 2.83l-1.17 1.17a2 2 0 0 1-2.83 0l-5-5"></path><path d="m9 15-3 3-3 3 4-1 3-3"></path>', { width: 1.75 }),

  // Estados
  alert: svg('<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>'),
  check: svg('<polyline points="20 6 9 17 4 12"></polyline>', { width: 3 }),
  warning: svg('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>', { width: 2.5 }),
  info: svg('<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>'),

  // Redes (compartir)
  instagram: svg('<rect x="2" y="2" width="20" height="20" rx="5"></rect><circle cx="12" cy="12" r="4"></circle><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>'),
  facebook: svg('<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path>'),
  whatsapp: svg('<path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.2-5.4A8.4 8.4 0 1 1 21 11.5z"></path><path d="M8.5 9.5c0 3 2.5 5.5 5.5 5.5"></path>'),
  twitter: svg('<path d="M4 4l7 9.5M20 20l-7-9.5M4 20 20 4"></path>'),
  telegram: svg('<path d="M21 4 3 11l5 2 1.5 5.5L13 15l4 3.5z"></path><path d="m8 13 9-6"></path>')
}

// Alias legible para el ícono de "cerrar" dentro de los toasts.
export const TOAST_ICONS = {
  success: ICONS.check,
  error: ICONS.close,
  warning: ICONS.warning,
  info: ICONS.info
}

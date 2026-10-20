// ========================================
// miMuro - Título del documento
//
// SPA sin recarga: el título no cambia solo. Cada página lo actualiza
// al cargar para que la pestaña y los enlaces compartidos tengan
// contexto.
// ========================================

const BASE_TITLE = 'miMuro — Tu muro para compartir y firmar'

export function setDocumentTitle(title) {
  document.title = title ? `${title} · miMuro` : BASE_TITLE
}

export { BASE_TITLE }

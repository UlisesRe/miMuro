// ========================================
// miMuro - Wall canvas helpers
//
// El lienzo tiene un tamaño lógico fijo (WALL_SIZE) y los trazos se
// guardan en ese espacio. El canvas se muestra a cualquier tamaño con
// CSS, así que el mismo dibujo sirve para editar, ver con zoom y
// descargar sin guardar píxeles.
// ========================================

export const WALL_SIZE = 1000

// Aplica el estilo del trazo y dibuja los puntos recibidos.
function strokePath(ctx, stroke, from, to) {
  const points = stroke.points || []
  if (points.length < 2) return

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = stroke.width || 4
  ctx.strokeStyle = stroke.color || '#111111'
  ctx.fillStyle = stroke.color || '#111111'
  // La goma solo borra la capa de trazos: el color de fondo vive en el
  // CSS del canvas, así que destination-out lo deja ver.
  ctx.globalCompositeOperation =
    stroke.tool === 'eraser' ? 'destination-out' : 'source-over'

  if (points.length === 2) {
    // Un toque suelto: un punto redondo del grosor del pincel.
    ctx.beginPath()
    ctx.arc(points[0], points[1], (stroke.width || 4) / 2, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.beginPath()
    ctx.moveTo(points[from], points[from + 1])
    for (let i = from + 2; i <= to; i += 2) {
      ctx.lineTo(points[i], points[i + 1])
    }
    ctx.stroke()
  }
  ctx.restore()
}

// Redibuja el lienzo completo desde los datos.
export function renderStrokes(ctx, strokes) {
  ctx.clearRect(0, 0, WALL_SIZE, WALL_SIZE)
  for (const stroke of strokes || []) {
    strokePath(ctx, stroke, 0, (stroke.points || []).length - 2)
  }
}

// Dibuja solo el último tramo: lo que se llama mientras se arrastra el
// dedo, para no repintar cientos de trazos en cada movimiento.
export function drawSegment(ctx, stroke) {
  const points = stroke.points || []
  const last = points.length - 2
  if (last < 2) return
  strokePath(ctx, stroke, last - 2, last)
}

// Convierte un evento de puntero a coordenadas del lienzo lógico.
export function pointFromEvent(canvas, event) {
  const rect = canvas.getBoundingClientRect()
  return {
    x: ((event.clientX - rect.left) / rect.width) * WALL_SIZE,
    y: ((event.clientY - rect.top) / rect.height) * WALL_SIZE
  }
}

// Compone el fondo + los trazos en un JPEG chico (la preview de "Mis muros").
// Misma composición que la descarga: los trazos se dibujan en una capa
// transparente (así la goma deja pasar el fondo) y encima va el color.
export function renderWallThumbnail(strokes, background, quality = 0.82) {
  const layer = document.createElement('canvas')
  layer.width = WALL_SIZE
  layer.height = WALL_SIZE
  renderStrokes(layer.getContext('2d'), strokes)

  const out = document.createElement('canvas')
  out.width = WALL_SIZE
  out.height = WALL_SIZE
  const ctx = out.getContext('2d')
  ctx.fillStyle = background || '#ffffff'
  ctx.fillRect(0, 0, WALL_SIZE, WALL_SIZE)
  ctx.drawImage(layer, 0, 0)
  return out.toDataURL('image/jpeg', quality)
}

// Compone el fondo + los trazos en un PNG y lo descarga.
export function downloadWallPng(sourceCanvas, background, filename) {
  const out = document.createElement('canvas')
  out.width = WALL_SIZE
  out.height = WALL_SIZE
  const ctx = out.getContext('2d')
  ctx.fillStyle = background || '#ffffff'
  ctx.fillRect(0, 0, WALL_SIZE, WALL_SIZE)
  ctx.drawImage(sourceCanvas, 0, 0)

  return new Promise((resolve) => {
    out.toBlob((blob) => {
      if (!blob) {
        resolve(false)
        return
      }
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename || 'mimuro.png'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      resolve(true)
    }, 'image/png')
  })
}

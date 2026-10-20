// ========================================
// miMuro - Wall canvas helpers
//
// El lienzo tiene un tamaño lógico fijo (WALL_SIZE) y los trazos se
// guardan en ese espacio. El canvas se muestra a cualquier tamaño con
// CSS, así que el mismo dibujo sirve para editar, ver con zoom y
// descargar sin guardar píxeles.
// ========================================

export const WALL_SIZE = 1000

// Zoom del lienzo: se comparte entre el editor del dueño y la página
// pública para que los dedos (pinch) y los botones usen el mismo rango.
export const MIN_ZOOM = 1
export const MAX_ZOOM = 4

export function clampZoom(value) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 100) / 100))
}

// Distancia y punto medio entre dos posiciones (coordenadas de pantalla),
// usados por el gesto de dos dedos.
export function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

export function midPoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

// Borra puntos de `strokes` que caigan dentro del radio de (x, y). Cuando el
// borrado parte un trazo por la mitad, devuelve las dos mitades como trazos
// aparte. Es una operación sobre datos: se aplica solo al borrador del
// invitado, así la goma nunca toca las firmas de otras sesiones.
export function erasePoints(strokes, x, y, radius) {
  const r2 = radius * radius
  const result = []
  let changed = false

  for (const stroke of strokes || []) {
    const points = stroke.points || []
    const runs = []
    let run = []
    let removed = false

    const flush = () => {
      if (run.length >= 2) runs.push(run)
      run = []
    }

    for (let i = 0; i < points.length; i += 2) {
      const dx = points[i] - x
      const dy = points[i + 1] - y
      if (dx * dx + dy * dy <= r2) {
        removed = true
        changed = true
        flush()
      } else {
        run.push(points[i], points[i + 1])
      }
    }
    flush()

    // Los trazos que la goma no tocó se reutilizan tal cual: importa para
    // que un arrastre largo no recree la firma entera en cada movimiento.
    if (!removed) {
      result.push(stroke)
      continue
    }
    for (const runPoints of runs) result.push({ ...stroke, points: runPoints })
  }

  // Si la goma no borró nada, devolvemos la misma lista: quien la use puede
  // evitar un repintado completo.
  return changed ? result : strokes
}

// Aplica la goma a lo largo del tramo `from -> to` muestreando puntos, para
// que un arrastre rápido no deje huecos sin borrar.
export function eraseAlong(strokes, from, to, radius) {
  const steps = Math.max(1, Math.ceil(distance(from, to) / Math.max(1, radius / 2)))
  let current = strokes
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps
    const x = from.x + (to.x - from.x) * t
    const y = from.y + (to.y - from.y) * t
    current = erasePoints(current, x, y, radius)
  }
  return current
}

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

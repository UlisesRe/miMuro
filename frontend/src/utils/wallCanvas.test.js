import { describe, it, expect, vi } from 'vitest'

import {
  WALL_SIZE,
  renderStrokes,
  renderWallThumbnail,
  pointFromEvent,
  erasePoints,
  eraseAlong,
  clampZoom,
  distance,
  midPoint
} from './wallCanvas.js'

// jsdom no implementa canvas 2d, así que se usa un doble
// que registra las llamadas: alcanza para probar la lógica
// de estilos y composición.
function fakeCtx() {
  return {
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    arc: vi.fn(),
    globalCompositeOperation: 'source-over'
  }
}

describe('renderStrokes', () => {
  it('limpia el lienzo y dibuja cada trazo', () => {
    const ctx = fakeCtx()
    renderStrokes(ctx, [
      { tool: 'pen', color: '#111111', width: 4, points: [0, 0, 10, 10] },
      { tool: 'pen', color: '#111111', width: 4, points: [10, 10, 20, 20] }
    ])

    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, WALL_SIZE, WALL_SIZE)
    expect(ctx.stroke).toHaveBeenCalledTimes(2)
    expect(ctx.moveTo).toHaveBeenNthCalledWith(1, 0, 0)
    expect(ctx.lineTo).toHaveBeenNthCalledWith(1, 10, 10)
  })

  it('dibuja un punto cuando el trazo es un toque suelto', () => {
    const ctx = fakeCtx()
    renderStrokes(ctx, [{ tool: 'pen', color: '#e03131', width: 8, points: [5, 5] }])

    expect(ctx.arc).toHaveBeenCalledWith(5, 5, 4, 0, Math.PI * 2)
    expect(ctx.fill).toHaveBeenCalledTimes(1)
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  it('usa destination-out para la goma', () => {
    const ctx = fakeCtx()
    renderStrokes(ctx, [
      { tool: 'eraser', color: '#111111', width: 10, points: [0, 0, 5, 5] }
    ])

    expect(ctx.globalCompositeOperation).toBe('destination-out')
  })

  it('aplica el color y el grosor del trazo', () => {
    const ctx = fakeCtx()
    renderStrokes(ctx, [{ tool: 'pen', color: '#1971c2', width: 12, points: [0, 0, 1, 1] }])

    expect(ctx.strokeStyle).toBe('#1971c2')
    expect(ctx.lineWidth).toBe(12)
    expect(ctx.lineCap).toBe('round')
  })

  it('no dibuja nada sin trazos', () => {
    const ctx = fakeCtx()
    renderStrokes(ctx, [])

    expect(ctx.clearRect).toHaveBeenCalledTimes(1)
    expect(ctx.stroke).not.toHaveBeenCalled()
  })
})

describe('renderWallThumbnail', () => {
  it('compone el fondo con los trazos y devuelve un JPEG', () => {
    const ctx = { ...fakeCtx(), fillRect: vi.fn(), drawImage: vi.fn() }
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(ctx)
    const toDataURL = vi
      .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockReturnValue('data:image/jpeg;base64,abc')

    try {
      const url = renderWallThumbnail(
        [{ tool: 'pen', color: '#111111', width: 4, points: [0, 0, 10, 10] }],
        '#fff3bf'
      )

      expect(url).toBe('data:image/jpeg;base64,abc')
      expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, WALL_SIZE, WALL_SIZE)
      expect(ctx.drawImage).toHaveBeenCalledTimes(1)
      expect(ctx.stroke).toHaveBeenCalledTimes(1)
      expect(toDataURL).toHaveBeenCalledWith('image/jpeg', 0.82)
    } finally {
      getContext.mockRestore()
      toDataURL.mockRestore()
    }
  })
})

describe('pointFromEvent', () => {
  it('convierte la posición del puntero al espacio lógico', () => {
    const canvas = {
      getBoundingClientRect: () => ({ left: 100, top: 50, width: 500, height: 500 })
    }

    const point = pointFromEvent(canvas, { clientX: 350, clientY: 300 })

    expect(point.x).toBeCloseTo(500)
    expect(point.y).toBeCloseTo(500)
  })
})

describe('erasePoints', () => {
  it('borra los puntos que caen dentro del radio y parte el trazo', () => {
    const strokes = [
      { tool: 'pen', color: '#111111', width: 4, points: [0, 0, 10, 0, 200, 0] }
    ]

    const result = erasePoints(strokes, 10, 0, 5)

    expect(result).toEqual([
      { tool: 'pen', color: '#111111', width: 4, points: [0, 0] },
      { tool: 'pen', color: '#111111', width: 4, points: [200, 0] }
    ])
  })

  it('no muta la lista original', () => {
    const strokes = [
      { tool: 'pen', color: '#111111', width: 4, points: [0, 0, 10, 0, 20, 0] }
    ]

    erasePoints(strokes, 10, 0, 5)

    expect(strokes[0].points).toEqual([0, 0, 10, 0, 20, 0])
  })

  it('deja intacto lo que está lejos de la goma', () => {
    const strokes = [{ tool: 'pen', color: '#111111', width: 4, points: [0, 0, 1, 1] }]

    expect(erasePoints(strokes, 500, 500, 10)).toEqual(strokes)
  })
})

describe('eraseAlong', () => {
  it('borra también los puntos que quedan entre muestras', () => {
    const strokes = [
      { tool: 'pen', color: '#111111', width: 4, points: [0, 0, 25, 0, 50, 0, 75, 0, 100, 0] }
    ]

    const result = eraseAlong(strokes, { x: 25, y: 0 }, { x: 75, y: 0 }, 5)

    expect(result.map((stroke) => stroke.points)).toEqual([[0, 0], [100, 0]])
  })
})

describe('zoom y gesto', () => {
  it('clampZoom acota entre 1 y 4', () => {
    expect(clampZoom(0.4)).toBe(1)
    expect(clampZoom(9)).toBe(4)
    expect(clampZoom(2.004)).toBe(2)
  })

  it('distance y midPoint miden el gesto de dos dedos', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
    expect(midPoint({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({ x: 5, y: 10 })
  })
})

import { describe, it, expect, vi } from 'vitest'

import { WALL_SIZE, renderStrokes, pointFromEvent } from './wallCanvas.js'

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

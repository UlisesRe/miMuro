import { describe, it, expect } from 'vitest'

import { wallCanvasState, mixWallInteraction } from './wallInteraction.js'
import { clampZoom } from './wallCanvas.js'
import { PEN_COLORS, WALL_BACKGROUNDS, DEFAULT_INK, DEFAULT_BACKGROUND } from './constants.js'
import { ICONS } from './icons.js'

describe('wallCanvasState', () => {
  it('entrega un estado inicial limpio (zoom 1, sin punteros)', () => {
    const state = wallCanvasState()
    expect(state.zoom).toBe(1)
    expect(state.panX).toBe(0)
    expect(state.panY).toBe(0)
    expect(state.tool).toBe('pen')
    expect(state.pointers).toEqual({})
    expect(state.drawing).toBe(false)
  })

  it('crea un objeto nuevo en cada llamada (sin estado compartido)', () => {
    const a = wallCanvasState()
    const b = wallCanvasState()
    a.pointers[1] = { x: 0, y: 0 }
    expect(b.pointers).toEqual({})
  })
})

// Doble mínimo de contexto: el factory solo usa las props que le pasan
// los getters y los métodos de vista. Se mezcla igual que en las páginas.
function buildComponent(overrides = {}) {
  return mixWallInteraction(
    Object.assign(
      {
        wall: { background_color: '#d3f9d8' },
        strokes: [],
        zoom: 1,
        panX: 0,
        panY: 0,
        width: 6,
        tool: 'pen',
        color: '#16181d',
        $refs: {}
      },
      wallCanvasState(),
      overrides
    )
  )
}

describe('createWallInteraction', () => {
  it('mantiene los getters vivos (backgroundColor lee del muro)', () => {
    const component = buildComponent()
    expect(component.backgroundColor).toBe('#d3f9d8')

    // Un spread habría congelado el primer valor; el getter debe seguirlo.
    component.wall.background_color = '#16181d'
    expect(component.backgroundColor).toBe('#16181d')
  })

  it('usa blanco cuando el muro todavía no cargó', () => {
    const component = buildComponent()
    component.wall = null
    expect(component.backgroundColor).toBe('#ffffff')
  })

  it('compone la transformación de vista con zoom y desplazamiento', () => {
    const component = buildComponent({ zoom: 2, panX: 10, panY: -5 })
    expect(component.canvasTransform).toBe('transform: translate(10px, -5px) scale(2);')
  })

  it('limita el zoom al rango permitido', () => {
    const component = buildComponent()
    component.setZoom(99)
    expect(component.zoom).toBe(clampZoom(99))
    component.setZoom(-5)
    expect(component.zoom).toBe(clampZoom(-5))
  })

  it('cuenta los nombres únicos de quienes firmaron', () => {
    const component = buildComponent({
      strokes: [
        { signer_name: 'Ana' },
        { signer_name: 'Ana' },
        { signer_name: '' },
        { signer_name: 'Leo' }
      ]
    })
    expect(component.signerNames).toEqual(['Ana', 'Leo'])
  })

  it('restablece la vista a zoom 1 y sin desplazamiento', () => {
    const component = buildComponent({ zoom: 3, panX: 40, panY: -20 })
    component.resetView()
    expect(component.zoom).toBe(1)
    expect(component.panX).toBe(0)
    expect(component.panY).toBe(0)
  })
})

describe('constantes de color', () => {
  it('los valores por defecto pertenecen a sus paletas', () => {
    expect(PEN_COLORS).toContain(DEFAULT_INK)
    expect(WALL_BACKGROUNDS).toContain(DEFAULT_BACKGROUND)
  })
})

describe('iconos', () => {
  it('todos son SVG decorativos con aria-hidden', () => {
    for (const [name, markup] of Object.entries(ICONS)) {
      expect(markup, name).toContain('<svg')
      expect(markup, name).toContain('aria-hidden="true"')
    }
  })
})

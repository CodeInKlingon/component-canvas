import { describe, expect, it } from 'vitest'
import { clampZoom, fitZoom, viewportPresets, zoomAroundPoint } from './canvas'

describe('canvas viewport helpers', () => {
  it('defines stable logical device dimensions', () => {
    expect(viewportPresets.desktop).toEqual({ width: 1440, height: 900 })
    expect(viewportPresets.tablet).toEqual({ width: 768, height: 1024 })
    expect(viewportPresets.mobile).toEqual({ width: 390, height: 844 })
  })

  it('fits a frame without enlarging it', () => {
    expect(fitZoom({ width: 1000, height: 700 }, { width: 1440, height: 900 })).toBeCloseTo(904 / 1440)
    expect(fitZoom({ width: 2000, height: 1200 }, { width: 390, height: 844 })).toBe(1)
  })

  it('clamps zoom and keeps the cursor point stationary', () => {
    expect(clampZoom(0.01)).toBe(0.1)
    expect(clampZoom(8)).toBe(4)
    expect(zoomAroundPoint({ x: 0, y: 0 }, { x: 100, y: 50 }, 1, 2)).toEqual({ x: -100, y: -50 })
  })
})

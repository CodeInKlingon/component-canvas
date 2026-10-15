import { describe, expect, it } from 'vitest'
import { clampMenuPosition } from './menu-position'

describe('clampMenuPosition', () => {
  const viewport = { width: 1000, height: 800 }
  const menu = { width: 176, height: 280 }

  it('keeps a menu that fits at the pointer', () => {
    expect(clampMenuPosition({ x: 100, y: 120 }, menu, viewport)).toEqual({ x: 100, y: 120 })
  })

  it('moves a menu back inside the right and bottom edges', () => {
    expect(clampMenuPosition({ x: 990, y: 790 }, menu, viewport)).toEqual({ x: 816, y: 512 })
  })

  it('never places a menu before the top-left margin', () => {
    expect(clampMenuPosition({ x: 50, y: 50 }, menu, { width: 100, height: 100 })).toEqual({ x: 8, y: 8 })
  })
})

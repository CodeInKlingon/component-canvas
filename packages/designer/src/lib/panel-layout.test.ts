import { describe, expect, it } from 'vitest'
import {
  clampPanelSize,
  collapsedBottomSize,
  collapsedPanelSize,
  keyboardResizeAmount,
  keyboardResizeLargeStep,
  keyboardResizeStep,
  layoutBreakpoints,
  panelBounds,
  panelMinSizes,
  panelResizeBehavior,
  resolveBreakpoint,
  resolvePanelSize,
} from './panel-layout'

describe('panel layout geometry', () => {
  it('resolves the viewport tier for each breakpoint', () => {
    expect(resolveBreakpoint(1600)).toEqual(layoutBreakpoints[2])
    expect(resolveBreakpoint(1120).maxViewportWidth).toBe(1120)
    expect(resolveBreakpoint(1000).rightHidden).toBe(false)
    expect(resolveBreakpoint(900)).toMatchObject({ leftMax: 220, rightHidden: true })
  })

  it('clamps sizes to their bounds and tolerates non-finite values', () => {
    expect(clampPanelSize(100, { min: 180, max: 480 })).toBe(180)
    expect(clampPanelSize(600, { min: 180, max: 480 })).toBe(480)
    expect(clampPanelSize(270, { min: 180, max: 480 })).toBe(270)
    expect(clampPanelSize(Number.NaN, { min: 180, max: 480 })).toBe(180)
  })

  it('caps a panel so the canvas keeps its minimum width', () => {
    expect(panelBounds({ containerSize: 1000, reservedSize: 0, minSize: 180, absoluteMaxSize: 480, minContentSize: 420 }))
      .toEqual({ min: 180, max: 480 })
    // 900 - 320 (other panel) - 420 (canvas) = 160, floored to the minimum.
    expect(panelBounds({ containerSize: 900, reservedSize: 320, minSize: 180, absoluteMaxSize: 480, minContentSize: 420 }))
      .toEqual({ min: 180, max: 180 })
  })

  it('uses the absolute cap before the container is measured', () => {
    expect(panelBounds({ containerSize: 0, reservedSize: 0, minSize: 120, absoluteMaxSize: 720, minContentSize: 260 }))
      .toEqual({ min: 120, max: 720 })
  })

  it('applies pointer deltas with the panel direction', () => {
    expect(resolvePanelSize(270, 40, false)).toBe(310)
    expect(resolvePanelSize(270, 40, true)).toBe(230)
    expect(resolvePanelSize(300, -50, true)).toBe(350)
  })

  it('scales keyboard steps and keeps the axis/invert behavior aligned', () => {
    expect(keyboardResizeAmount(1, false)).toBe(keyboardResizeStep)
    expect(keyboardResizeAmount(-1, false)).toBe(-keyboardResizeStep)
    expect(keyboardResizeAmount(1, true)).toBe(keyboardResizeLargeStep)
    expect(panelResizeBehavior('left')).toEqual({ axis: 'x', invert: false })
    expect(panelResizeBehavior('right')).toEqual({ axis: 'x', invert: true })
    expect(panelResizeBehavior('bottom')).toEqual({ axis: 'y', invert: true })
  })

  it('exposes sensible collapse sizes', () => {
    expect(collapsedPanelSize).toBe(38)
    expect(collapsedBottomSize).toBe(39)
    expect(panelMinSizes.bottom).toBeLessThan(panelMinSizes.left)
  })
})

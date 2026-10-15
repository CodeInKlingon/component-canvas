/**
 * Pure geometry for the resizable editor panels. The designer lays the workspace
 * out as a CSS grid via named areas (`left | center | right` over `left | bottom
 * | right`), so every panel size is a single pixel length on one axis.
 *
 * This module holds no Vue or DOM references: container sizes and breakpoints are
 * passed in, and `composables/useWorkspaceLayout.ts` supplies the measured values.
 * That keeps clamping and drag math unit-testable.
 */

export type DockZone = 'left' | 'right' | 'bottom'

/** Panel ids are the dock zones; the canvas is always the fixed center region. */
export type PanelId = DockZone

/** Pointer axis a panel responds to: `x` for side panels, `y` for the bottom panel. */
export type ResizeAxis = 'x' | 'y'

/** Payload emitted by a resize handle for a keyboard resize. */
export interface ResizeStepEvent {
  axis: ResizeAxis
  direction: -1 | 1
  large: boolean
}

export interface PanelSizeBounds {
  min: number
  max: number
}

/** Width a side panel collapses to, matching the original header rail. */
export const collapsedPanelSize = 38
/** Height the bottom panel collapses to, matching the source header. */
export const collapsedBottomSize = 39
/** Canvas must keep at least this height so the preview stays usable. */
export const minCanvasHeight = 260
/** Default bottom panel share of the workspace height before the user resizes it. */
export const bottomDefaultFraction = 0.3
export const keyboardResizeStep = 8
export const keyboardResizeLargeStep = 32

export const panelMinSizes: Record<PanelId, number> = { left: 180, right: 240, bottom: 120 }
/** Upper bound for the bottom panel so the canvas cannot be reduced to nothing on tall windows. */
export const bottomMax = 720

export interface LayoutBreakpoint {
  maxViewportWidth: number
  minCanvasWidth: number
  leftMax: number
  rightMax: number
  rightHidden: boolean
}

/**
 * Viewport-width tiers mirroring the stylesheet's media queries. The composable
 * clamps preferred sizes against these so a narrowed window stays usable without
 * discarding the user's preferred widths, and so the JS-computed positions match
 * the rendered grid (handles must stay aligned with the panel edges).
 */
export const layoutBreakpoints: readonly LayoutBreakpoint[] = [
  { maxViewportWidth: 960, minCanvasWidth: 460, leftMax: 220, rightMax: 240, rightHidden: true },
  { maxViewportWidth: 1120, minCanvasWidth: 400, leftMax: 230, rightMax: 290, rightHidden: false },
  { maxViewportWidth: Number.POSITIVE_INFINITY, minCanvasWidth: 420, leftMax: 480, rightMax: 640, rightHidden: false },
]

export function resolveBreakpoint(viewportWidth: number): LayoutBreakpoint {
  return layoutBreakpoints.find((breakpoint) => viewportWidth <= breakpoint.maxViewportWidth)
    ?? layoutBreakpoints[layoutBreakpoints.length - 1]!
}

export function clampPanelSize(value: number, bounds: PanelSizeBounds): number {
  if (!Number.isFinite(value)) return bounds.min
  return Math.min(bounds.max, Math.max(bounds.min, value))
}

/**
 * Max size a panel may take given the container, the other panels on the same
 * axis, and the minimum size the canvas must retain. Before the container is
 * measured (size 0) the absolute cap applies so the first render is not clamped
 * to the minimum.
 */
export function panelBounds(options: {
  containerSize: number
  reservedSize: number
  minSize: number
  absoluteMaxSize: number
  minContentSize: number
}): PanelSizeBounds {
  if (!(options.containerSize > 0)) {
    return { min: options.minSize, max: Math.max(options.minSize, options.absoluteMaxSize) }
  }
  const available = options.containerSize - options.reservedSize - options.minContentSize
  const max = Math.max(options.minSize, Math.min(options.absoluteMaxSize, available))
  return { min: options.minSize, max }
}

/** Applies a pointer delta to a starting size, honoring panels that grow toward the low coordinates. */
export function resolvePanelSize(startSize: number, delta: number, invert: boolean): number {
  return invert ? startSize - delta : startSize + delta
}

/** Pixel delta for one arrow-key press, negative for the decreasing direction. */
export function keyboardResizeAmount(direction: -1 | 1, large: boolean): number {
  return (large ? keyboardResizeLargeStep : keyboardResizeStep) * direction
}

/** The panel's pointer axis and invert flag, shared by drag and keyboard paths. */
export function panelResizeBehavior(id: PanelId): { axis: ResizeAxis; invert: boolean } {
  return id === 'bottom'
    ? { axis: 'y', invert: true }
    : { axis: 'x', invert: id === 'right' }
}

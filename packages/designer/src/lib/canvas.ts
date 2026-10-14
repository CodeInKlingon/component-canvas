export type ViewportMode = 'responsive' | 'desktop' | 'tablet' | 'mobile'

export interface ViewportSize {
  width: number
  height: number
}

export const viewportPresets: Record<Exclude<ViewportMode, 'responsive'>, ViewportSize> = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844 },
}

export const minZoom = 0.1
export const maxZoom = 4

export function clampZoom(zoom: number): number {
  return Math.min(maxZoom, Math.max(minZoom, zoom))
}

export function fitZoom(viewport: ViewportSize, frame: ViewportSize, padding = 48): number {
  if (!viewport.width || !viewport.height || !frame.width || !frame.height) return 1
  return clampZoom(Math.min(
    (viewport.width - padding * 2) / frame.width,
    (viewport.height - padding * 2) / frame.height,
    1,
  ))
}

export function zoomAroundPoint(
  pan: { x: number; y: number },
  point: { x: number; y: number },
  currentZoom: number,
  nextZoom: number,
): { x: number; y: number } {
  const ratio = nextZoom / currentZoom
  return {
    x: point.x - (point.x - pan.x) * ratio,
    y: point.y - (point.y - pan.y) * ratio,
  }
}

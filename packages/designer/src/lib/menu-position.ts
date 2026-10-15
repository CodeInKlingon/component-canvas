export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export function clampMenuPosition(point: Point, menu: Size, viewport: Size, margin = 8): Point {
  return {
    x: Math.max(margin, Math.min(point.x, viewport.width - menu.width - margin)),
    y: Math.max(margin, Math.min(point.y, viewport.height - menu.height - margin)),
  }
}

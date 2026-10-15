/**
 * Dock model for the editor's tools. The five tools (Layers, Components, Props,
 * Style, Source) are data-driven units that can live in any of the three dock
 * zones; a future tool is just another registered id, so nothing here enumerates
 * specific tools beyond seeded defaults.
 *
 * Pure state + operations only, so the move/hide/normalize logic is unit-testable
 * and `composables/useWorkspaceLayout.ts` can own the reactive copy.
 */

export type DockZone = 'left' | 'right' | 'bottom'

/** Tool ids are open strings; the registry in `components/tools/registry.ts` owns their metadata. */
export type ToolId = string

export const dockZones: readonly DockZone[] = ['left', 'bottom', 'right']

/** dataTransfer type used when dragging a tool tab between panels. */
export const toolDragMime = 'application/x-vue-designer-tool'

export interface DockLayout {
  /** Ordered tools per zone. A tool appears in at most one zone. */
  zones: Record<DockZone, ToolId[]>
  /** Active tool per zone, or null when the zone has no tools. */
  active: Record<DockZone, ToolId | null>
  /** User collapse state per zone. */
  collapsed: Record<DockZone, boolean>
}

export const defaultDockLayout: DockLayout = {
  zones: { left: ['layers', 'components'], right: ['props', 'style'], bottom: ['source'] },
  active: { left: 'layers', right: 'props', bottom: 'source' },
  collapsed: { left: false, right: false, bottom: false },
}

export function cloneDockLayout(layout: DockLayout): DockLayout {
  return {
    zones: { left: [...layout.zones.left], right: [...layout.zones.right], bottom: [...layout.zones.bottom] },
    active: { ...layout.active },
    collapsed: { ...layout.collapsed },
  }
}

export function defaultDock(): DockLayout {
  return cloneDockLayout(defaultDockLayout)
}

function without(list: ToolId[], toolId: ToolId): ToolId[] {
  return list.filter((tool) => tool !== toolId)
}

export function zoneContaining(layout: DockLayout, toolId: ToolId): DockZone | null {
  return dockZones.find((zone) => layout.zones[zone].includes(toolId)) ?? null
}

/** Keeps the first occurrence of each tool in zone order so a tool is never in two zones. */
export function dedupeZones(zones: Record<DockZone, ToolId[]>): Record<DockZone, ToolId[]> {
  const seen = new Set<ToolId>()
  const next: Record<DockZone, ToolId[]> = { left: [], right: [], bottom: [] }
  for (const zone of dockZones) {
    for (const tool of zones[zone]) {
      if (seen.has(tool)) continue
      seen.add(tool)
      next[zone].push(tool)
    }
  }
  return next
}

/** Repairs a layout after tools move or availability changes: dedupes and fixes active tools. */
export function normalizeDockLayout(layout: DockLayout): DockLayout {
  const zones = dedupeZones(layout.zones)
  const active: Record<DockZone, ToolId | null> = { left: null, right: null, bottom: null }
  for (const zone of dockZones) {
    const current = layout.active[zone]
    active[zone] = current && zones[zone].includes(current) ? current : zones[zone][0] ?? null
  }
  return { zones, active, collapsed: { ...layout.collapsed } }
}

/** Moves a tool (from any zone, or hidden) into a zone and activates it there. */
export function moveTool(layout: DockLayout, toolId: ToolId, target: DockZone): DockLayout {
  return moveToolBefore(layout, toolId, target, null)
}

/**
 * Moves a tool into a zone immediately before `beforeToolId` (or to the end when
 * null). Used by tab drag-reordering and cross-panel drops; referencing a tool id
 * instead of an index keeps ordering correct regardless of hidden/available tools.
 */
export function moveToolBefore(layout: DockLayout, toolId: ToolId, target: DockZone, beforeToolId: ToolId | null): DockLayout {
  if (beforeToolId === toolId) return layout
  const zones: Record<DockZone, ToolId[]> = {
    left: without(layout.zones.left, toolId),
    right: without(layout.zones.right, toolId),
    bottom: without(layout.zones.bottom, toolId),
  }
  const list = [...zones[target]]
  const at = beforeToolId ? list.indexOf(beforeToolId) : -1
  if (at === -1) list.push(toolId)
  else list.splice(at, 0, toolId)
  zones[target] = list
  return normalizeDockLayout({
    zones,
    active: { ...layout.active, [target]: toolId },
    collapsed: { ...layout.collapsed, [target]: false },
  })
}

/** Removes a tool from every zone; it becomes hidden and can be added back later. */
export function hideTool(layout: DockLayout, toolId: ToolId): DockLayout {
  return normalizeDockLayout({
    zones: {
      left: without(layout.zones.left, toolId),
      right: without(layout.zones.right, toolId),
      bottom: without(layout.zones.bottom, toolId),
    },
    active: { ...layout.active },
    collapsed: { ...layout.collapsed },
  })
}

export function activateTool(layout: DockLayout, zone: DockZone, toolId: ToolId): DockLayout {
  if (!layout.zones[zone].includes(toolId)) return layout
  return { ...layout, active: { ...layout.active, [zone]: toolId } }
}

export function setZoneCollapsed(layout: DockLayout, zone: DockZone, collapsed: boolean): DockLayout {
  return { ...layout, collapsed: { ...layout.collapsed, [zone]: collapsed } }
}

/** Tools in a zone that the current framework/read-only state allows showing. */
export function visibleTools(layout: DockLayout, zone: DockZone, available: ReadonlySet<ToolId>): ToolId[] {
  return layout.zones[zone].filter((tool) => available.has(tool))
}

export function visibleActiveTool(layout: DockLayout, zone: DockZone, available: ReadonlySet<ToolId>): ToolId | null {
  const list = visibleTools(layout, zone, available)
  const active = layout.active[zone]
  if (active && list.includes(active)) return active
  return list[0] ?? null
}

export function placedTools(layout: DockLayout): Set<ToolId> {
  return new Set(dockZones.flatMap((zone) => layout.zones[zone]))
}

/** Available tools that are not currently shown in any zone. */
export function hiddenTools(layout: DockLayout, allTools: readonly ToolId[], available: ReadonlySet<ToolId>): ToolId[] {
  const placed = placedTools(layout)
  return allTools.filter((tool) => available.has(tool) && !placed.has(tool))
}

/** Available tools that could be added to a zone (anything not already in it). */
export function zoneAddOptions(layout: DockLayout, zone: DockZone, allTools: readonly ToolId[], available: ReadonlySet<ToolId>): ToolId[] {
  return allTools.filter((tool) => available.has(tool) && !layout.zones[zone].includes(tool))
}

/** Roving-tabindex neighbour for arrow-key tab navigation. */
export function adjacentTabIndex(current: number, count: number, direction: -1 | 1): number {
  if (count <= 0) return -1
  return (current + direction + count) % count
}

import { describe, expect, it } from 'vitest'
import {
  activateTool,
  adjacentTabIndex,
  defaultDockLayout,
  defaultDock,
  hideTool,
  hiddenTools,
  moveTool,
  moveToolBefore,
  normalizeDockLayout,
  setZoneCollapsed,
  visibleActiveTool,
  visibleTools,
  zoneContaining,
  zoneAddOptions,
  type DockLayout,
} from './dock-layout'

const available = new Set(['layers', 'components', 'props', 'style', 'source'])

describe('dock layout', () => {
  it('seeds sensible defaults', () => {
    expect(defaultDockLayout.zones).toEqual({ left: ['layers', 'components'], right: ['props', 'style'], bottom: ['source'] })
    expect(defaultDockLayout.active).toEqual({ left: 'layers', right: 'props', bottom: 'source' })
    // defaultDock returns a fresh clone so callers can mutate safely.
    const dock = defaultDock()
    dock.zones.left.push('extra')
    expect(defaultDockLayout.zones.left).toEqual(['layers', 'components'])
  })

  it('moves a tool between zones and activates it there', () => {
    const moved = moveTool(defaultDock(), 'layers', 'bottom')
    expect(moved.zones.left).toEqual(['components'])
    expect(moved.zones.bottom).toEqual(['source', 'layers'])
    expect(moved.active.bottom).toBe('layers')
    expect(moved.collapsed.bottom).toBe(false)
  })

  it('never leaves a tool in two zones', () => {
    let dock: DockLayout = defaultDock()
    dock = moveTool(dock, 'props', 'left')
    dock = moveTool(dock, 'props', 'bottom')
    expect(zoneContaining(dock, 'props')).toBe('bottom')
    expect(dock.zones.left).not.toContain('props')
    expect(dock.zones.right).not.toContain('props')
  })

  it('reorders a tool before another tool in the same zone', () => {
    const dock = moveToolBefore(defaultDock(), 'source', 'left', 'layers')
    expect(dock.zones.left).toEqual(['source', 'layers', 'components'])
    expect(dock.zones.bottom).toEqual([])
    // Dropping a tool immediately before itself is a no-op.
    expect(moveToolBefore(dock, 'source', 'left', 'source')).toBe(dock)
    // A null anchor appends.
    expect(moveToolBefore(dock, 'source', 'left', null).zones.left).toEqual(['layers', 'components', 'source'])
  })

  it('hides a tool and re-points the active tool', () => {
    const hidden = hideTool(defaultDock(), 'layers')
    expect(hidden.zones.left).toEqual(['components'])
    expect(hidden.active.left).toBe('components')
    expect(hiddenTools(hidden, ['layers', 'components', 'props', 'style', 'source'], available)).toEqual(['layers'])
  })

  it('normalizes duplicates and invalid active tools', () => {
    const normalized = normalizeDockLayout({
      zones: { left: ['layers', 'layers'], right: ['layers', 'style'], bottom: [] },
      active: { left: 'ghost', right: 'layers', bottom: 'source' },
      collapsed: { left: false, right: false, bottom: false },
    })
    expect(normalized.zones.left).toEqual(['layers'])
    expect(normalized.zones.right).toEqual(['style'])
    expect(normalized.active.left).toBe('layers')
    expect(normalized.active.right).toBe('style')
    expect(normalized.active.bottom).toBeNull()
  })

  it('filters tools by availability for rendering and add options', () => {
    const dock = defaultDock()
    const limited = new Set(['layers', 'props', 'source'])
    expect(visibleTools(dock, 'left', limited)).toEqual(['layers'])
    expect(visibleActiveTool(dock, 'right', limited)).toBe('props')
    expect(zoneAddOptions(dock, 'left', ['layers', 'components', 'props', 'style', 'source'], limited)).toEqual(['props', 'source'])
  })

  it('activates only tools already in a zone and toggles collapse', () => {
    const dock = defaultDock()
    expect(activateTool(dock, 'left', 'style')).toBe(dock)
    expect(activateTool(dock, 'left', 'components').active.left).toBe('components')
    expect(setZoneCollapsed(dock, 'right', true).collapsed.right).toBe(true)
  })

  it('wraps tab indices for arrow navigation', () => {
    expect(adjacentTabIndex(0, 3, 1)).toBe(1)
    expect(adjacentTabIndex(2, 3, 1)).toBe(0)
    expect(adjacentTabIndex(0, 3, -1)).toBe(2)
    expect(adjacentTabIndex(0, 0, 1)).toBe(-1)
  })
})

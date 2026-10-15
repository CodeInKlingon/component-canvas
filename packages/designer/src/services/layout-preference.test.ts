import { describe, expect, it } from 'vitest'
import {
  defaultPanelLayout,
  panelLayoutStorageKey,
  readPanelLayoutPreference,
  writePanelLayoutPreference,
} from './layout-preference'

function memoryStorage(initial?: string) {
  const values = new Map<string, string>(initial === undefined ? [] : [[panelLayoutStorageKey, initial]])
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  }
}

describe('panel layout preference', () => {
  it('round-trips a versioned layout with dock state', () => {
    const storage = memoryStorage()
    writePanelLayoutPreference(defaultPanelLayout, storage)
    expect(storage.getItem(panelLayoutStorageKey)).toContain('"version":2')
    const loaded = readPanelLayoutPreference(storage)
    expect(loaded?.leftWidth).toBe(270)
    expect(loaded?.dock.zones.bottom).toEqual(['source'])
  })

  it('migrates a version 1 record, keeping widths and mapping collapsed flags', () => {
    const v1 = JSON.stringify({
      version: 1,
      sidebarWidth: 300,
      inspectorWidth: 360,
      sourceHeight: 420,
      sidebarCollapsed: true,
      inspectorCollapsed: false,
      sourceCollapsed: true,
    })
    const loaded = readPanelLayoutPreference(memoryStorage(v1))
    expect(loaded?.leftWidth).toBe(300)
    expect(loaded?.rightWidth).toBe(360)
    expect(loaded?.bottomHeight).toBe(420)
    expect(loaded?.dock.collapsed).toEqual({ left: true, right: false, bottom: true })
    expect(loaded?.dock.zones.right).toEqual(['props', 'style'])
  })

  it('treats missing, malformed, or wrong-version values as absent', () => {
    expect(readPanelLayoutPreference(memoryStorage())).toBeNull()
    expect(readPanelLayoutPreference(memoryStorage('{not json'))).toBeNull()
    expect(readPanelLayoutPreference(memoryStorage('"a string"'))).toBeNull()
    expect(readPanelLayoutPreference(memoryStorage('{"version":9,"leftWidth":300}'))).toBeNull()
  })

  it('merges valid fields over defaults and repairs dock duplicates', () => {
    const loaded = readPanelLayoutPreference(memoryStorage(JSON.stringify({
      version: 2,
      leftWidth: -5,
      rightWidth: 300,
      dock: {
        zones: { left: ['layers', 'source'], right: ['source'], bottom: [] },
        active: { left: 'ghost', right: null, bottom: null },
        collapsed: { left: true, right: 'yes', bottom: false },
      },
    })))
    expect(loaded?.leftWidth).toBe(defaultPanelLayout.leftWidth)
    expect(loaded?.rightWidth).toBe(300)
    // `source` appears once (left wins), active falls back to the first real tool.
    expect(loaded?.dock.zones).toEqual({ left: ['layers', 'source'], right: [], bottom: [] })
    expect(loaded?.dock.active.left).toBe('layers')
    expect(loaded?.dock.collapsed).toEqual({ left: true, right: false, bottom: false })
  })

  it('keeps a zero bottom height so the default stays derived', () => {
    const storage = memoryStorage()
    writePanelLayoutPreference({ ...defaultPanelLayout, bottomHeight: 0 }, storage)
    expect(readPanelLayoutPreference(storage)?.bottomHeight).toBe(0)
  })

  it('tolerates storage that throws', () => {
    const broken = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } }
    expect(readPanelLayoutPreference(broken)).toBeNull()
    expect(() => writePanelLayoutPreference(defaultPanelLayout, broken)).not.toThrow()
  })
})

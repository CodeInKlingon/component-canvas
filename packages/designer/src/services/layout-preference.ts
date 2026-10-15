/**
 * Persisted workspace layout (panel sizes, docking, visibility) for the designer
 * editor. Mirrors `ai-model-preference.ts`: a versioned local-storage key,
 * defensive parsing, and an injectable storage object so it can be unit tested.
 *
 * Version 2 adds the dock model. Version 1 records are migrated by keeping the
 * saved widths and mapping the old per-panel collapsed flags onto the dock zones.
 *
 * A `sourceHeight` of `0` means "not chosen yet", so the composable derives the
 * default from the current workspace height instead of persisting a pixel value
 * that would be wrong for a different window size on first load.
 */

import { defaultDock, normalizeDockLayout, type DockLayout, type DockZone, type ToolId } from '../lib/dock-layout'

export interface PanelLayoutPreference {
  leftWidth: number
  rightWidth: number
  bottomHeight: number
  dock: DockLayout
}

const storageKey = 'vue-designer:panel-layout'
const version = 2

export const defaultPanelLayout: PanelLayoutPreference = {
  leftWidth: 270,
  rightWidth: 320,
  // 0 means "derive from the workspace height" until the user resizes it.
  bottomHeight: 0,
  dock: defaultDock(),
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function toolIds(value: unknown): ToolId[] {
  return Array.isArray(value) ? value.filter((tool): tool is ToolId => typeof tool === 'string') : []
}

function toolIdOrNull(value: unknown): ToolId | null {
  return typeof value === 'string' ? value : null
}

function parseDock(value: unknown): DockLayout | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const zones = raw.zones as Record<string, unknown> | undefined
  if (!zones || typeof zones !== 'object') return null
  const active = raw.active as Record<string, unknown> | undefined
  const collapsed = raw.collapsed as Record<string, unknown> | undefined
  return normalizeDockLayout({
    zones: { left: toolIds(zones.left), right: toolIds(zones.right), bottom: toolIds(zones.bottom) },
    active: {
      left: toolIdOrNull(active?.left),
      right: toolIdOrNull(active?.right),
      bottom: toolIdOrNull(active?.bottom),
    },
    collapsed: {
      left: booleanOr(collapsed?.left, false),
      right: booleanOr(collapsed?.right, false),
      bottom: booleanOr(collapsed?.bottom, false),
    },
  })
}

/**
 * Reads the stored layout, merging valid fields over the defaults so a partial or
 * partially-stale object still yields a usable layout. Returns `null` when there
 * is nothing usable (missing/malformed JSON or an unknown version).
 */
export function readPanelLayoutPreference(
  storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage,
): PanelLayoutPreference | null {
  try {
    const raw: unknown = JSON.parse(storage?.getItem(storageKey) ?? 'null')
    if (!raw || typeof raw !== 'object') return null
    const value = raw as Record<string, unknown>

    if (value.version === 1) {
      // Migrate: keep widths, map the old per-panel collapse flags onto the dock.
      const dock = defaultDock()
      dock.collapsed = {
        left: booleanOr(value.sidebarCollapsed, false),
        right: booleanOr(value.inspectorCollapsed, false),
        bottom: booleanOr(value.sourceCollapsed, false),
      }
      return {
        leftWidth: numberOr(value.sidebarWidth, defaultPanelLayout.leftWidth),
        rightWidth: numberOr(value.inspectorWidth, defaultPanelLayout.rightWidth),
        bottomHeight: numberOr(value.sourceHeight, defaultPanelLayout.bottomHeight),
        dock,
      }
    }

    if (value.version !== version) return null

    return {
      leftWidth: numberOr(value.leftWidth, defaultPanelLayout.leftWidth),
      rightWidth: numberOr(value.rightWidth, defaultPanelLayout.rightWidth),
      bottomHeight: numberOr(value.bottomHeight, defaultPanelLayout.bottomHeight),
      dock: parseDock(value.dock) ?? defaultDock(),
    }
  } catch {
    return null
  }
}

export function writePanelLayoutPreference(
  preference: PanelLayoutPreference,
  storage: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage,
): void {
  try {
    storage?.setItem(storageKey, JSON.stringify({ version, ...preference }))
  } catch {
    // Storage can be unavailable or full; the layout still works for this session.
  }
}

export const panelLayoutStorageKey = storageKey

export type { DockZone }

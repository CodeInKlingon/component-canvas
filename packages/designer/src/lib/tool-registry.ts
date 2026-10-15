import type { Component } from 'vue'
import { Component as ComponentIcon, Code2, Layers3, Paintbrush, SlidersHorizontal } from '@lucide/vue'
import type { DesignerFrameworkClientMetadata } from '@vue-designer/shared'
import type { DockZone, ToolId } from './dock-layout'

export interface ToolAvailabilityContext {
  capabilities: DesignerFrameworkClientMetadata['capabilities'] | null
  readOnly: boolean
}

/**
 * Metadata for a docked tool, kept free of component imports so availability can
 * be unit tested without a DOM. The matching component lives in
 * `components/tools/registry.ts`, which maps ids to their Vue components.
 *
 * Adding a tool means: create the component, add it to that map, and add one entry
 * here. The dock, tab strips, move/hide/add menus, default layout, and persistence
 * all derive from this list.
 */
export interface ToolDefinition {
  id: ToolId
  label: string
  icon: Component
  defaultZone: DockZone
  isAvailable(ctx: ToolAvailabilityContext): boolean
}

export const toolDefinitions: ToolDefinition[] = [
  { id: 'layers', label: 'Layers', icon: Layers3, defaultZone: 'left', isAvailable: () => true },
  {
    id: 'components',
    label: 'Components',
    icon: ComponentIcon,
    defaultZone: 'left',
    isAvailable: (ctx) => !!ctx.capabilities?.components && !ctx.readOnly,
  },
  { id: 'props', label: 'Props', icon: SlidersHorizontal, defaultZone: 'right', isAvailable: () => true },
  { id: 'style', label: 'Style', icon: Paintbrush, defaultZone: 'right', isAvailable: (ctx) => !!ctx.capabilities?.styles },
  { id: 'source', label: 'Source', icon: Code2, defaultZone: 'bottom', isAvailable: () => true },
]

export const toolIds: ToolId[] = toolDefinitions.map((tool) => tool.id)

const definitionsById = new Map(toolDefinitions.map((tool) => [tool.id, tool]))

export function toolDefinition(id: ToolId): ToolDefinition | undefined {
  return definitionsById.get(id)
}

export function availableToolIds(ctx: ToolAvailabilityContext): Set<ToolId> {
  return new Set(toolDefinitions.filter((tool) => tool.isAvailable(ctx)).map((tool) => tool.id))
}

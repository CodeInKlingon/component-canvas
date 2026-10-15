import type { Component } from 'vue'
import { Component as ComponentIcon, Code2, Layers3, Paintbrush, SlidersHorizontal } from '@lucide/vue'
import type { DesignerFrameworkClientMetadata } from '@vue-designer/shared'
import type { DockZone, ToolId } from '../../lib/dock-layout'
import LayersTool from './LayersTool.vue'
import ComponentsTool from './ComponentsTool.vue'
import PropsTool from './PropsTool.vue'
import StyleTool from './StyleTool.vue'
import SourceTool from './SourceTool.vue'

export interface ToolAvailabilityContext {
  capabilities: DesignerFrameworkClientMetadata['capabilities'] | null
  readOnly: boolean
}

/**
 * A docked tool. Adding a new tool means creating a component and appending one
 * entry here: the dock, tab strips, move/hide/add menus, default layout, and
 * persistence all derive from this list.
 */
export interface ToolDefinition {
  id: ToolId
  label: string
  icon: Component
  component: Component
  defaultZone: DockZone
  isAvailable(ctx: ToolAvailabilityContext): boolean
}

export const toolDefinitions: ToolDefinition[] = [
  { id: 'layers', label: 'Layers', icon: Layers3, component: LayersTool, defaultZone: 'left', isAvailable: () => true },
  {
    id: 'components',
    label: 'Components',
    icon: ComponentIcon,
    component: ComponentsTool,
    defaultZone: 'left',
    isAvailable: (ctx) => !!ctx.capabilities?.components && !ctx.readOnly,
  },
  { id: 'props', label: 'Props', icon: SlidersHorizontal, component: PropsTool, defaultZone: 'right', isAvailable: () => true },
  { id: 'style', label: 'Style', icon: Paintbrush, component: StyleTool, defaultZone: 'right', isAvailable: (ctx) => !!ctx.capabilities?.styles },
  { id: 'source', label: 'Source', icon: Code2, component: SourceTool, defaultZone: 'bottom', isAvailable: () => true },
]

export const toolIds: ToolId[] = toolDefinitions.map((tool) => tool.id)

const definitionsById = new Map(toolDefinitions.map((tool) => [tool.id, tool]))

export function toolDefinition(id: ToolId): ToolDefinition | undefined {
  return definitionsById.get(id)
}

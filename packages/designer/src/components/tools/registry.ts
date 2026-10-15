import type { Component } from 'vue'
import type { ToolId } from '../../lib/dock-layout'
import LayersTool from './LayersTool.vue'
import ComponentsTool from './ComponentsTool.vue'
import PropsTool from './PropsTool.vue'
import StyleTool from './StyleTool.vue'
import SourceTool from './SourceTool.vue'

/** Maps each tool id to the component rendered in a panel body. */
export const toolComponents: Record<ToolId, Component> = {
  layers: LayersTool,
  components: ComponentsTool,
  props: PropsTool,
  style: StyleTool,
  source: SourceTool,
}

export { availableToolIds, toolDefinition, toolDefinitions, toolIds } from '../../lib/tool-registry'
export type { ToolAvailabilityContext, ToolDefinition } from '../../lib/tool-registry'

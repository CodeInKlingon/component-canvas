<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import type { DesignerNode } from '@component-canvas/shared'
import { readOnlyKey } from '../services/host'
import NodeKindIcon from './NodeKindIcon.vue'
import UiBadge from './ui/UiBadge.vue'
import UiDisclosureIcon from './ui/UiDisclosureIcon.vue'

const props = defineProps<{
  node: DesignerNode
  selectedId: string | null
  collapsedIds: ReadonlySet<string>
  depth?: number
  dragKind?: 'component' | 'node' | null
  draggedNode?: DesignerNode | null
}>()

const emit = defineEmits<{
  select: [node: DesignerNode]
  toggleCollapse: [node: DesignerNode]
  dragNode: [node: DesignerNode]
  dragEnd: []
  dropNode: [target: DesignerNode, position: 'before' | 'inside' | 'after']
  contextMenu: [event: MouseEvent, node: DesignerNode]
}>()

const readOnly = inject(readOnlyKey, false)
const collapsed = computed(() => props.collapsedIds.has(props.node.id))

type DropIntent = 'before' | 'inside' | 'append' | 'after'

const dropIntent = ref<DropIntent | null>(null)

function canDrop(intent: DropIntent): boolean {
  if (readOnly || !props.node.editable || !props.dragKind) return false
  if (props.dragKind === 'node' && props.draggedNode) {
    const isSelf = props.node.id === props.draggedNode.id
    const isDescendant = props.node.range.start >= props.draggedNode.range.start
      && props.node.range.end <= props.draggedNode.range.end
    if (isSelf || isDescendant) return false
    const isAlreadyLastChild = (intent === 'inside' || intent === 'append')
      && props.node.children.at(-1)?.id === props.draggedNode.id
    if (isAlreadyLastChild) return false
  }
  if ((intent === 'inside' || intent === 'append') && !props.node.capabilities.canContainChildren) return false
  if ((intent === 'before' || intent === 'after') && props.dragKind === 'component') return false
  return true
}

function handleDragOver(event: DragEvent, intent: DropIntent): void {
  if (!canDrop(intent)) return
  event.preventDefault()
  event.stopPropagation()
  if (event.dataTransfer) event.dataTransfer.dropEffect = props.dragKind === 'component' ? 'copy' : 'move'
  dropIntent.value = intent
}

function handleDragLeave(event: DragEvent, intent: DropIntent): void {
  event.stopPropagation()
  if (dropIntent.value === intent) dropIntent.value = null
}

function handleDrop(event: DragEvent, intent: DropIntent): void {
  if (!canDrop(intent)) return
  event.preventDefault()
  event.stopPropagation()
  dropIntent.value = null
  emit('dropNode', props.node, intent === 'append' ? 'inside' : intent)
}

function handleDragStart(event: DragEvent): void {
  if (readOnly || !props.node.editable) return
  event.stopPropagation()
  event.dataTransfer?.setData('application/x-vue-designer-node', props.node.id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
  emit('dragNode', props.node)
}

function handleChildDrop(target: DesignerNode, position: 'before' | 'inside' | 'after'): void {
  emit('dropNode', target, position)
}

function handleChildContextMenu(event: MouseEvent, node: DesignerNode): void {
  emit('contextMenu', event, node)
}
</script>

<template>
  <li class="tree-item">
    <div
      class="tree-drop-line tree-drop-line--before"
      :class="{ active: dropIntent === 'before', available: dragKind === 'node' }"
      :style="{ marginLeft: `${30 + (depth ?? 0) * 15}px` }"
      @dragover="handleDragOver($event, 'before')"
      @dragleave="handleDragLeave($event, 'before')"
      @drop="handleDrop($event, 'before')"
    />
    <div class="tree-line" :style="{ paddingLeft: `${10 + (depth ?? 0) * 15}px` }">
      <button
        v-if="node.children.length"
        class="tree-disclosure"
        :aria-expanded="!collapsed"
        :aria-label="collapsed ? `Expand ${node.label}` : `Collapse ${node.label}`"
        @click="emit('toggleCollapse', node)"
      >
        <UiDisclosureIcon :expanded="!collapsed" :size="13" />
      </button>
      <span v-else class="tree-disclosure tree-disclosure--spacer" aria-hidden="true"></span>
      <button
        class="tree-row"
        :class="{ selected: selectedId === node.id, locked: !node.editable, 'drop-target': dropIntent === 'inside' || dropIntent === 'append' }"
        :title="node.lockedReason"
        :draggable="!readOnly && node.editable"
        @click="emit('select', node)"
        @contextmenu.prevent.stop="emit('contextMenu', $event, node)"
        @dragstart="handleDragStart"
        @dragend="emit('dragEnd')"
        @dragover="handleDragOver($event, 'inside')"
        @dragleave="handleDragLeave($event, 'inside')"
        @drop="handleDrop($event, 'inside')"
      >
        <NodeKindIcon :kind="node.kind" :selected="selectedId === node.id" />
        <span class="tree-label">{{ node.kind === 'text' ? `“${node.label}”` : node.label }}</span>
        <UiBadge v-if="!node.editable" class="lock-mark" tone="warning">Locked</UiBadge>
      </button>
    </div>
    <ul v-if="node.children.length && !collapsed">
      <TreeNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :selected-id="selectedId"
        :collapsed-ids="collapsedIds"
        :depth="(depth ?? 0) + 1"
        :drag-kind="dragKind"
        :dragged-node="draggedNode"
        @select="emit('select', $event)"
        @toggle-collapse="emit('toggleCollapse', $event)"
        @drag-node="emit('dragNode', $event)"
        @drag-end="emit('dragEnd')"
        @drop-node="handleChildDrop"
        @context-menu="handleChildContextMenu"
      />
    </ul>
    <div
      class="tree-drop-line tree-drop-line--append"
      :class="{ active: dropIntent === 'append', available: node.capabilities.canContainChildren && !!dragKind }"
      :style="{ marginLeft: `${45 + (depth ?? 0) * 15}px` }"
      @dragover="handleDragOver($event, 'append')"
      @dragleave="handleDragLeave($event, 'append')"
      @drop="handleDrop($event, 'append')"
    />
    <div
      class="tree-drop-line tree-drop-line--after"
      :class="{ active: dropIntent === 'after', available: dragKind === 'node' }"
      :style="{ marginLeft: `${30 + (depth ?? 0) * 15}px` }"
      @dragover="handleDragOver($event, 'after')"
      @dragleave="handleDragLeave($event, 'after')"
      @drop="handleDrop($event, 'after')"
    />
  </li>
</template>

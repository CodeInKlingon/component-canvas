<script setup lang="ts">
import { ref } from 'vue'
import type { DesignerNode } from '@vue-designer/shared'

const props = defineProps<{
  node: DesignerNode
  selectedId: string | null
  depth?: number
  dragKind?: 'component' | 'node' | null
}>()

const emit = defineEmits<{
  select: [node: DesignerNode]
  dragNode: [node: DesignerNode]
  dragEnd: []
  dropNode: [target: DesignerNode, position: 'before' | 'inside' | 'after']
}>()

const dropPosition = ref<'before' | 'inside' | 'after' | null>(null)

function handleDragOver(event: DragEvent): void {
  if (!props.node.editable || !props.dragKind) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  if (props.dragKind === 'component') {
    dropPosition.value = props.node.kind === 'text' ? null : 'inside'
    return
  }
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const ratio = (event.clientY - rect.top) / rect.height
  dropPosition.value = ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : props.node.kind === 'text' ? 'after' : 'inside'
}

function handleDragLeave(event: DragEvent): void {
  const currentTarget = event.currentTarget as HTMLElement
  if (event.relatedTarget instanceof Node && currentTarget.contains(event.relatedTarget)) return
  dropPosition.value = null
}

function handleDrop(): void {
  if (!dropPosition.value) return
  const position = dropPosition.value
  dropPosition.value = null
  emit('dropNode', props.node, position)
}

function handleChildDrop(target: DesignerNode, position: 'before' | 'inside' | 'after'): void {
  emit('dropNode', target, position)
}
</script>

<template>
  <li>
    <button
      class="tree-row"
      :class="{ selected: selectedId === node.id, locked: !node.editable, 'drop-target': dropPosition === 'inside' }"
      :style="{ paddingLeft: `${10 + (depth ?? 0) * 15}px` }"
      :title="node.lockedReason"
      :draggable="node.editable"
      @click="emit('select', node)"
      @dragstart.stop="emit('dragNode', node)"
      @dragend="emit('dragEnd')"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop.stop.prevent="handleDrop"
    >
      <span class="tree-kind">{{ node.kind === 'component' ? 'C' : node.kind === 'text' ? 'T' : 'E' }}</span>
      <span class="tree-label">{{ node.kind === 'text' ? `“${node.label}”` : node.label }}</span>
      <span v-if="!node.editable" class="lock-mark">Locked</span>
    </button>
    <div v-if="dropPosition" class="tree-drop-indicator" :class="`tree-drop-indicator--${dropPosition}`" :style="{ marginLeft: `${10 + (depth ?? 0) * 15}px` }">
      <span />{{ dragKind === 'component' ? 'Insert' : 'Move' }} {{ dropPosition }} {{ node.label }}
    </div>
    <ul v-if="node.children.length">
      <TreeNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :selected-id="selectedId"
        :depth="(depth ?? 0) + 1"
        :drag-kind="dragKind"
        @select="emit('select', $event)"
        @drag-node="emit('dragNode', $event)"
        @drag-end="emit('dragEnd')"
        @drop-node="handleChildDrop"
      />
    </ul>
  </li>
</template>

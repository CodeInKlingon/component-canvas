<script setup lang="ts">
import { ref } from 'vue'
import type { DesignerNode } from '@vue-designer/shared'

const props = defineProps<{
  node: DesignerNode
  selectedId: string | null
  depth?: number
}>()

const emit = defineEmits<{
  select: [node: DesignerNode]
  insert: [node: DesignerNode]
}>()

const isDropTarget = ref(false)

function handleDragOver(event: DragEvent): void {
  if (props.node.kind === 'text' || !props.node.editable) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  isDropTarget.value = true
}

function handleDragLeave(event: DragEvent): void {
  const currentTarget = event.currentTarget as HTMLElement
  if (event.relatedTarget instanceof Node && currentTarget.contains(event.relatedTarget)) return
  isDropTarget.value = false
}

function handleDrop(): void {
  if (props.node.kind === 'text' || !props.node.editable) return
  isDropTarget.value = false
  emit('insert', props.node)
}
</script>

<template>
  <li>
    <button
      class="tree-row"
      :class="{ selected: selectedId === node.id, locked: !node.editable, 'drop-target': isDropTarget }"
      :style="{ paddingLeft: `${10 + (depth ?? 0) * 15}px` }"
      :title="node.lockedReason"
      @click="emit('select', node)"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop.stop.prevent="handleDrop"
    >
      <span class="tree-kind">{{ node.kind === 'component' ? 'C' : node.kind === 'text' ? 'T' : 'E' }}</span>
      <span class="tree-label">{{ node.kind === 'text' ? `“${node.label}”` : node.label }}</span>
      <span v-if="!node.editable" class="lock-mark">Locked</span>
    </button>
    <div v-if="isDropTarget" class="tree-drop-indicator" :style="{ marginLeft: `${10 + (depth ?? 0) * 15}px` }">
      <span />Insert inside {{ node.label }}
    </div>
    <ul v-if="node.children.length">
      <TreeNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :selected-id="selectedId"
        :depth="(depth ?? 0) + 1"
        @select="emit('select', $event)"
        @insert="emit('insert', $event)"
      />
    </ul>
  </li>
</template>

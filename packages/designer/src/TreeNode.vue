<script setup lang="ts">
import type { DesignerNode } from '@vue-designer/shared'

defineProps<{
  node: DesignerNode
  selectedId: string | null
  depth?: number
}>()

const emit = defineEmits<{
  select: [node: DesignerNode]
}>()
</script>

<template>
  <li>
    <button
      class="tree-row"
      :class="{ selected: selectedId === node.id, locked: !node.editable }"
      :style="{ paddingLeft: `${10 + (depth ?? 0) * 15}px` }"
      :title="node.lockedReason"
      @click="emit('select', node)"
    >
      <span class="tree-kind">{{ node.kind === 'component' ? 'C' : node.kind === 'text' ? 'T' : 'E' }}</span>
      <span class="tree-label">{{ node.kind === 'text' ? `“${node.label}”` : node.label }}</span>
      <span v-if="!node.editable" class="lock-mark">Locked</span>
    </button>
    <ul v-if="node.children.length">
      <TreeNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :selected-id="selectedId"
        :depth="(depth ?? 0) + 1"
        @select="emit('select', $event)"
      />
    </ul>
  </li>
</template>

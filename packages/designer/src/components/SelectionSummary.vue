<script setup lang="ts">
import type { DesignerNode } from '@vue-designer/shared'
import NodeKindIcon from './NodeKindIcon.vue'

defineProps<{
  node: DesignerNode
  subtitle: string
}>()
</script>

<template>
  <div class="selection-summary">
    <NodeKindIcon :kind="node.kind" selected />
    <div class="selection-summary__text"><strong>{{ node.label }}</strong><small>{{ subtitle }}</small></div>
    <div v-if="$slots.actions" class="selection-summary__actions"><slot name="actions" /></div>
  </div>
</template>

<style scoped>
.selection-summary { display: flex; align-items: center; gap: 9px; padding: 12px 14px; border-bottom: 1px solid var(--border); }
.selection-summary__text { display: grid; min-width: 0; }
.selection-summary strong { overflow: hidden; font: 14px var(--mono); text-overflow: ellipsis; white-space: nowrap; }
.selection-summary small { margin-top: 3px; color: var(--faint); font-size: var(--font-caption); text-transform: uppercase; }
.selection-summary__actions { display: flex; gap: 3px; margin-left: auto; }
</style>

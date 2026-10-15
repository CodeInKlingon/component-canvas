<script setup lang="ts">
import { CodeXml, Component, Type } from '@lucide/vue'
import type { DesignerNode } from '@vue-designer/shared'
import UiIconTile from './ui/UiIconTile.vue'

defineProps<{
  kind: DesignerNode['kind']
  selected?: boolean
}>()
</script>

<template>
  <UiIconTile size="sm" :tone="selected ? 'accent' : 'neutral'">
    <Component v-if="kind === 'component'" :size="14" />
    <Type v-else-if="kind === 'text'" :size="14" />
    <CodeXml v-else :size="14" />
  </UiIconTile>
</template>

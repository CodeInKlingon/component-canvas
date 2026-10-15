<script setup lang="ts">
import { ChevronRight } from '@lucide/vue'

withDefaults(defineProps<{
  expanded: boolean
  size?: number
}>(), { size: 14 })
</script>

<template>
  <ChevronRight class="ui-disclosure-icon" :class="{ expanded }" :size="size" aria-hidden="true" />
</template>

<style scoped>
@layer ui {
  .ui-disclosure-icon { flex: none; transition: transform .12s ease; }
  .ui-disclosure-icon.expanded { transform: rotate(90deg); }
}
</style>

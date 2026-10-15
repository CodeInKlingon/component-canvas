<script setup lang="ts">
import { Braces, Component, Plus } from '@lucide/vue'
import UiIconTile from './ui/UiIconTile.vue'

defineProps<{
  label: string
  category: string
  kind: 'component' | 'native'
}>()
</script>

<template>
  <button class="palette-item" type="button">
    <UiIconTile tone="accent"><Component v-if="kind === 'component'" :size="14" /><Braces v-else :size="14" /></UiIconTile>
    <span class="palette-item__text"><strong>{{ label }}</strong><small>{{ category }}</small></span>
    <Plus :size="13" />
  </button>
</template>

<style scoped>
.palette-item { min-width: 0; display: grid; grid-template-columns: var(--control-xs) 1fr 14px; align-items: center; gap: 8px; border: 1px solid transparent; border-radius: var(--radius); background: transparent; padding: 7px; text-align: left; }
.palette-item:hover:not(:disabled) { border-color: var(--border); background: var(--surface); }
.palette-item:disabled { opacity: .45; cursor: default; }
.palette-item__text { display: grid; min-width: 0; }
.palette-item strong { overflow: hidden; font-size: 14px; font-weight: 550; text-overflow: ellipsis; white-space: nowrap; }
.palette-item small { margin-top: 2px; color: var(--faint); font-size: var(--font-caption); }
.palette-item > svg { color: var(--faint); }
</style>

<script setup lang="ts">
import type { DockZone } from '../lib/dock-layout'
import UiMenu from './ui/UiMenu.vue'
import UiMenuItem from './ui/UiMenuItem.vue'
import UiMenuSeparator from './ui/UiMenuSeparator.vue'

defineProps<{
  x: number
  y: number
  toolLabel: string
  currentZone: DockZone | null
  zones: { id: DockZone; label: string }[]
}>()

const emit = defineEmits<{
  move: [zone: DockZone]
  hide: []
  close: []
}>()
</script>

<template>
  <UiMenu :x="x" :y="y" @close="emit('close')">
    <UiMenuItem v-for="zone in zones" :key="zone.id" :disabled="zone.id === currentZone" @click="emit('move', zone.id)">
      Move to {{ zone.label }} panel
    </UiMenuItem>
    <UiMenuSeparator />
    <UiMenuItem @click="emit('hide')">Hide {{ toolLabel }}</UiMenuItem>
  </UiMenu>
</template>

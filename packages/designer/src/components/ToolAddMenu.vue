<script setup lang="ts">
import UiMenu from './ui/UiMenu.vue'
import UiMenuItem from './ui/UiMenuItem.vue'

defineProps<{
  x: number
  y: number
  options: { id: string; label: string }[]
}>()

const emit = defineEmits<{
  add: [id: string]
  close: []
}>()
</script>

<template>
  <UiMenu :x="x" :y="y" @close="emit('close')">
    <UiMenuItem v-for="option in options" :key="option.id" @click="emit('add', option.id)">{{ option.label }}</UiMenuItem>
    <UiMenuItem v-if="!options.length" disabled>No tools to add</UiMenuItem>
  </UiMenu>
</template>

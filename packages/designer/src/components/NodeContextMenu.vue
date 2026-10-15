<script setup lang="ts">
import UiMenu from './ui/UiMenu.vue'
import UiMenuItem from './ui/UiMenuItem.vue'
import UiMenuSeparator from './ui/UiMenuSeparator.vue'

defineProps<{
  x: number
  y: number
  readOnly: boolean
  canInsertInside: boolean
}>()

const emit = defineEmits<{
  close: []
  insert: [position: 'inside' | 'after']
  copy: []
  duplicate: []
  paste: [position: 'inside' | 'after']
  remove: []
}>()
</script>

<template>
  <UiMenu :x="x" :y="y" @close="emit('close')">
    <UiMenuItem v-if="readOnly" @click="emit('copy')">Copy</UiMenuItem>
    <template v-else>
      <UiMenuItem :disabled="!canInsertInside" @click="emit('insert', 'inside')">Insert inside...</UiMenuItem>
      <UiMenuItem @click="emit('insert', 'after')">Insert after...</UiMenuItem>
      <UiMenuSeparator />
      <UiMenuItem @click="emit('copy')">Copy</UiMenuItem>
      <UiMenuItem @click="emit('duplicate')">Duplicate</UiMenuItem>
      <UiMenuSeparator />
      <UiMenuItem :disabled="!canInsertInside" @click="emit('paste', 'inside')">Paste inside</UiMenuItem>
      <UiMenuItem @click="emit('paste', 'after')">Paste after</UiMenuItem>
      <UiMenuSeparator />
      <UiMenuItem danger @click="emit('remove')">Delete</UiMenuItem>
    </template>
  </UiMenu>
</template>

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { clampMenuPosition } from '../../lib/menu-position'

const props = defineProps<{
  x: number
  y: number
}>()

const emit = defineEmits<{ close: [] }>()

const menu = ref<HTMLElement | null>(null)
const position = ref({ x: props.x, y: props.y })

async function place(): Promise<void> {
  position.value = { x: props.x, y: props.y }
  await nextTick()
  const element = menu.value
  if (!element) return
  position.value = clampMenuPosition(
    { x: props.x, y: props.y },
    { width: element.offsetWidth, height: element.offsetHeight },
    { width: window.innerWidth, height: window.innerHeight },
  )
}

function close(): void {
  emit('close')
}

watch(() => [props.x, props.y], () => void place())

onMounted(() => {
  void place()
  window.addEventListener('pointerdown', close)
  window.addEventListener('blur', close)
})

onUnmounted(() => {
  window.removeEventListener('pointerdown', close)
  window.removeEventListener('blur', close)
})
</script>

<template>
  <div
    ref="menu"
    class="ui-menu"
    role="menu"
    :style="{ left: `${position.x}px`, top: `${position.y}px` }"
    @pointerdown.stop
  >
    <slot />
  </div>
</template>

<style scoped>
@layer ui {
  .ui-menu { position: fixed; z-index: 20; width: 176px; display: grid; padding: 5px; border: 1px solid var(--border-strong); border-radius: 8px; background: var(--background); box-shadow: var(--shadow-menu); }
}
</style>

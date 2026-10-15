<script setup lang="ts">
import { onMounted, onUnmounted, ref, useId } from 'vue'
import { X } from '@lucide/vue'
import UiButton from './UiButton.vue'

const props = withDefaults(defineProps<{
  title: string
  subtitle?: string
  /** Maximum width; the dialog never exceeds the viewport. */
  width?: string
  /** Disables every way of closing, for example while a request runs. */
  busy?: boolean
  as?: 'section' | 'form'
  closeLabel?: string
  /** Removes the body padding so content can manage its own layout. */
  flush?: boolean
}>(), { subtitle: undefined, width: '560px', as: 'section', closeLabel: 'Close' })

const emit = defineEmits<{
  close: []
  submit: []
}>()

const titleId = useId()
const panel = ref<HTMLElement | null>(null)

function close(): void {
  if (!props.busy) emit('close')
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  // Keep Escape from reaching window-level editor shortcuts while a dialog is open.
  event.stopPropagation()
  close()
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  const element = panel.value
  const target = element?.querySelector<HTMLElement>('[autofocus]')
    ?? element?.querySelector<HTMLElement>('.ui-dialog__body :is(input, select, textarea, button):not(:disabled)')
    ?? element
  target?.focus()
})

onUnmounted(() => document.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <div class="ui-dialog-backdrop" @pointerdown.self="close">
    <component
      :is="as"
      ref="panel"
      class="ui-dialog"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      tabindex="-1"
      :style="{ width: `min(${width}, 100%)` }"
      @submit.prevent="emit('submit')"
    >
      <header class="ui-dialog__header">
        <div>
          <strong :id="titleId"><slot name="title-icon" />{{ title }}</strong>
          <small v-if="subtitle">{{ subtitle }}</small>
        </div>
        <UiButton variant="ghost" size="sm" icon-only :label="closeLabel" :disabled="busy" @click="close"><X :size="16" /></UiButton>
      </header>
      <div class="ui-dialog__body" :class="{ flush }"><slot /></div>
      <footer v-if="$slots.footer" class="ui-dialog__footer"><slot name="footer" /></footer>
    </component>
  </div>
</template>

<style scoped>
@layer ui {
  .ui-dialog-backdrop { position: fixed; z-index: 30; inset: 0; display: grid; place-items: center; padding: 24px; background: var(--backdrop); backdrop-filter: blur(2px); }
  .ui-dialog { display: flex; flex-direction: column; max-height: min(680px, calc(100vh - 48px)); overflow: hidden; margin: 0; border: 1px solid var(--border-strong); border-radius: var(--radius-lg); background: var(--background); box-shadow: var(--shadow-dialog); }
  .ui-dialog:focus { outline: 0; }
  .ui-dialog__header { display: flex; flex: none; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--border); padding: 14px 16px; }
  .ui-dialog__header > div { display: grid; gap: 3px; min-width: 0; }
  .ui-dialog__header strong { display: flex; align-items: center; gap: 7px; color: var(--text); }
  .ui-dialog__header strong :slotted(svg) { flex: none; color: var(--selection); }
  .ui-dialog__header small { color: var(--muted); }
  .ui-dialog__body { display: grid; flex: 1 1 auto; align-content: start; gap: 12px; min-height: 0; overflow: auto; padding: 16px; }
  .ui-dialog__body.flush { display: block; padding: 0; }
  .ui-dialog__footer { display: flex; flex: none; flex-wrap: wrap; align-items: flex-end; justify-content: flex-end; gap: 8px 12px; border-top: 1px solid var(--border); padding: 12px 16px; }
}
</style>

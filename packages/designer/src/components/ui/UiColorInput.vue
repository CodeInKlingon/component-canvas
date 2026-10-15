<script setup lang="ts">
import UiInput from './UiInput.vue'

/** Color swatch paired with a free-text value; both emit native `change` events. */
defineProps<{
  value: string
  disabled?: boolean
  readonly?: boolean
  placeholder?: string
  label?: string
}>()

const emit = defineEmits<{ change: [event: Event] }>()
</script>

<template>
  <div class="ui-color-input">
    <input
      class="ui-color-input__swatch"
      type="color"
      :value="/^#[\da-f]{6}$/i.test(value) ? value : '#000000'"
      :disabled="disabled || readonly"
      :aria-label="label ? `${label} swatch` : undefined"
      @change="emit('change', $event)"
    />
    <UiInput :value="value" :disabled="disabled" :readonly="readonly" :placeholder="placeholder" mono @change="emit('change', $event)" />
  </div>
</template>

<style scoped>
@layer ui {
  .ui-color-input { display: grid; grid-template-columns: var(--control-lg) minmax(0, 1fr); gap: 5px; }
  .ui-color-input__swatch { width: 100%; height: var(--control-lg); border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--background); padding: 3px; cursor: pointer; }
  .ui-color-input__swatch:disabled { cursor: default; opacity: .6; }
}
</style>

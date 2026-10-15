<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import { ChevronDown } from '@lucide/vue'
import { splitControlAttrs } from './control-attrs'

defineOptions({ inheritAttrs: false })

export type UiSelectOption = string | { value: string; label: string }

const props = defineProps<{
  modelValue?: string
  options?: readonly UiSelectOption[]
  /** Label for a leading empty-value option, such as "Default" or "Unset". */
  emptyOption?: string
  mono?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const attrs = useAttrs()
const split = computed(() => splitControlAttrs(attrs))
const value = computed(() => props.modelValue ?? split.value.control.value)
const normalizedOptions = computed(() => (props.options ?? []).map((option) =>
  typeof option === 'string' ? { value: option, label: option } : option))
</script>

<template>
  <span class="ui-control ui-control--affix ui-control--select" :class="split.root.class" :style="split.root.style">
    <slot name="leading" />
    <select
      v-bind="split.control"
      class="ui-control__select"
      :class="{ mono }"
      :value="value"
      @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <option v-if="emptyOption !== undefined" value="">{{ emptyOption }}</option>
      <option v-for="option in normalizedOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
      <slot />
    </select>
    <ChevronDown class="ui-control__chevron" :size="14" aria-hidden="true" />
  </span>
</template>

<style src="./control.css" scoped></style>

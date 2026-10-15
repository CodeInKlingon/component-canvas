<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import { splitControlAttrs } from './control-attrs'

defineOptions({ inheritAttrs: false })

const props = defineProps<{
  modelValue?: string | number
  mono?: boolean
  invalid?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const attrs = useAttrs()
const split = computed(() => splitControlAttrs(attrs))
const value = computed(() => props.modelValue ?? split.value.control.value)
</script>

<template>
  <span v-if="$slots.leading" class="ui-control ui-control--affix" :class="split.root.class" :style="split.root.style">
    <slot name="leading" />
    <input
      v-bind="split.control"
      class="ui-control__input"
      :class="{ mono }"
      :value="value"
      :aria-invalid="invalid || undefined"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
  </span>
  <input
    v-else
    v-bind="split.control"
    class="ui-control ui-control__input"
    :class="[split.root.class, { mono }]"
    :style="split.root.style"
    :value="value"
    :aria-invalid="invalid || undefined"
    @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  />
</template>

<style src="./control.css" scoped></style>

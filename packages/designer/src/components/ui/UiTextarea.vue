<script setup lang="ts">
defineProps<{
  modelValue?: string
  mono?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <textarea
    class="ui-control"
    :class="{ mono }"
    :value="modelValue"
    @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
  />
</template>

<style src="./control.css" scoped></style>

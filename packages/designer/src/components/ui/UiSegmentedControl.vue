<script setup lang="ts" generic="T extends string">
import type { Component } from 'vue'
import UiButton from './UiButton.vue'
import UiButtonGroup from './UiButtonGroup.vue'

export interface UiSegmentOption<V extends string = string> {
  value: V
  label: string
  icon?: Component
  title?: string
}

withDefaults(defineProps<{
  options: UiSegmentOption<T>[]
  /** `group` draws joined, bordered segments; `pills` spreads borderless segments across the width. */
  appearance?: 'group' | 'pills'
  size?: 'xs' | 'sm' | 'md'
}>(), { appearance: 'group', size: 'md' })

const model = defineModel<T>({ required: true })
</script>

<template>
  <component :is="appearance === 'group' ? UiButtonGroup : 'div'" class="ui-segmented" :class="`ui-segmented--${appearance}`">
    <UiButton
      v-for="option in options"
      :key="option.value"
      variant="ghost"
      :size="size"
      :class="{ 'ui-segmented__button--icon': option.icon }"
      :active="model === option.value"
      :aria-pressed="model === option.value"
      :title="option.title"
      @click="model = option.value"
    >
      <template v-if="option.icon" #icon><component :is="option.icon" :size="size === 'xs' ? 13 : 15" /></template>
      {{ option.label }}
    </UiButton>
  </component>
</template>

<style scoped>
@layer ui {
  .ui-segmented--pills { display: grid; grid-auto-columns: 1fr; grid-auto-flow: column; gap: 4px; }
  .ui-segmented--pills > .ui-button--active { font-weight: 600; }
  /* Segments with an icon show their label only while selected; the rest are icon-only. */
  .ui-segmented__button--icon:not(.ui-button--active) { gap: 0; }
  .ui-segmented__button--icon:not(.ui-button--active) :deep(.ui-button__label) { display: none; }
}
</style>

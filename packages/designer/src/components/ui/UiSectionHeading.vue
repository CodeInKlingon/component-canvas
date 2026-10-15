<script setup lang="ts">
withDefaults(defineProps<{
  /** `caption` is a small uppercase group label; `title` is a section title. */
  variant?: 'caption' | 'title'
  as?: string
}>(), { variant: 'caption', as: 'div' })
</script>

<template>
  <component :is="as" class="ui-section-heading" :class="`ui-section-heading--${variant}`"><slot /></component>
</template>

<style scoped>
@layer ui {
  .ui-section-heading { margin: 0; }
  .ui-section-heading--caption { color: var(--muted); font-size: var(--font-caption); font-weight: 650; letter-spacing: .04em; text-transform: uppercase; }
  .ui-section-heading--title { color: var(--text); font-size: 14px; font-weight: 650; }
}
</style>

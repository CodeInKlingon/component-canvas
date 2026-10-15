<script setup lang="ts">
withDefaults(defineProps<{
  tone?: 'neutral' | 'warning'
  size?: 'sm' | 'md'
}>(), { tone: 'neutral', size: 'sm' })
</script>

<template>
  <span class="ui-badge" :class="[`ui-badge--${tone}`, `ui-badge--${size}`]"><slot /></span>
</template>

<style scoped>
@layer ui {
  .ui-badge { display: inline-flex; flex: none; align-items: center; gap: 5px; border: 1px solid transparent; border-radius: 999px; font-weight: 600; line-height: 1.4; white-space: nowrap; }
  .ui-badge--sm { padding: 0 7px; font-size: var(--font-caption); }
  .ui-badge--md { height: var(--control-xs); padding: 0 10px; font-size: 13px; }
  .ui-badge--neutral { background: var(--surface-subtle); color: var(--muted); }
  .ui-badge--warning { border-color: var(--warning-border); background: var(--warning-surface); color: var(--warning-text); }
}
</style>

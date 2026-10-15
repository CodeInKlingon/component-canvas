<script setup lang="ts">
withDefaults(defineProps<{
  size?: 'sm' | 'md' | 'lg'
  /** `neutral` is outlined and muted, `accent` is outlined in the selection color, `soft` is filled. */
  tone?: 'neutral' | 'accent' | 'soft'
}>(), { size: 'md', tone: 'neutral' })
</script>

<template>
  <span class="ui-icon-tile" :class="[`ui-icon-tile--${size}`, `ui-icon-tile--${tone}`]" aria-hidden="true"><slot /></span>
</template>

<style scoped>
@layer ui {
  .ui-icon-tile { display: grid; flex: none; place-items: center; border: 1px solid transparent; font: 14px var(--mono); }
  .ui-icon-tile--sm { width: 22px; height: 22px; border-radius: 4px; }
  .ui-icon-tile--md { width: var(--control-xs); height: var(--control-xs); border-radius: var(--radius-sm); }
  .ui-icon-tile--lg { width: var(--control-lg); height: var(--control-lg); border-radius: 8px; }
  .ui-icon-tile--neutral { border-color: var(--border-strong); background: var(--background); color: var(--muted); }
  .ui-icon-tile--accent { border-color: var(--selection-border); background: var(--background); color: var(--selection); }
  .ui-icon-tile--soft { background: var(--selection-soft); color: var(--selection); }
}
</style>

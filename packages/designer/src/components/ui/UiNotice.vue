<script setup lang="ts">
withDefaults(defineProps<{
  tone?: 'neutral' | 'warning' | 'danger'
  title?: string
  /** Lays the message and actions out on one row. */
  inline?: boolean
}>(), { tone: 'neutral', title: undefined })
</script>

<template>
  <div class="ui-notice" :class="[`ui-notice--${tone}`, { 'ui-notice--inline': inline }]" :role="tone === 'danger' ? 'alert' : undefined">
    <div class="ui-notice__content">
      <strong v-if="title">{{ title }}</strong>
      <div class="ui-notice__body"><slot /></div>
    </div>
    <div v-if="$slots.actions" class="ui-notice__actions"><slot name="actions" /></div>
  </div>
</template>

<style scoped>
@layer ui {
  .ui-notice { display: grid; justify-items: start; gap: 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); color: var(--muted); padding: 10px; font-size: 14px; line-height: 1.5; }
  .ui-notice__content { display: grid; gap: 4px; min-width: 0; }
  .ui-notice__content strong { color: inherit; font-weight: 650; }
  .ui-notice__actions { display: flex; flex-wrap: wrap; gap: 6px; }
  .ui-notice--inline { display: flex; align-items: center; }
  .ui-notice--inline > .ui-notice__content { flex: 1; }
  .ui-notice--warning { border-color: var(--warning-border); background: var(--warning-surface); color: var(--warning-text); }
  .ui-notice--danger { border-color: var(--danger-border); background: var(--danger-surface); color: var(--danger-text); }
}
</style>

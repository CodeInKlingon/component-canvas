<script setup lang="ts">
withDefaults(defineProps<{
  title?: string
  /** `boxed` draws a dashed card; `centered` fills its container and centers the message. */
  variant?: 'plain' | 'boxed' | 'centered'
  compact?: boolean
}>(), { title: undefined, variant: 'plain' })
</script>

<template>
  <div class="ui-empty-state" :class="[`ui-empty-state--${variant}`, { 'ui-empty-state--compact': compact }]">
    <strong v-if="title">{{ title }}</strong>
    <span v-if="$slots.default"><slot /></span>
    <div v-if="$slots.actions" class="ui-empty-state__actions"><slot name="actions" /></div>
  </div>
</template>

<style scoped>
@layer ui {
  .ui-empty-state { display: grid; justify-items: start; gap: 7px; color: var(--muted); padding: 24px 16px; font-size: 14px; line-height: 1.5; }
  .ui-empty-state > strong { color: var(--text); font-size: 14px; }
  .ui-empty-state__actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 3px; }
  .ui-empty-state--compact { padding: 18px 16px; }
  .ui-empty-state--boxed { max-width: 560px; gap: 10px; border: 1px dashed var(--border-strong); border-radius: 10px; background: var(--background); padding: 24px; line-height: 1.6; }
  .ui-empty-state--boxed > strong { font-size: 15px; }
  .ui-empty-state--centered { height: 100%; place-content: center; justify-items: center; text-align: center; }
}
</style>

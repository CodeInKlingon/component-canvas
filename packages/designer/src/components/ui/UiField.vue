<script setup lang="ts">
withDefaults(defineProps<{
  label: string
  /** Secondary text shown opposite the label, such as a type or "Required". */
  hint?: string
  /** `inline` puts the label in a fixed column beside the control. */
  layout?: 'stacked' | 'inline'
  /** Uppercase caption label for compact settings rows. */
  caption?: boolean
  /** Renders a plain container for controls that manage their own labels. */
  as?: 'label' | 'div'
}>(), { hint: undefined, layout: 'stacked', as: 'label' })
</script>

<template>
  <component :is="as" class="ui-field" :class="[`ui-field--${layout}`, { 'ui-field--caption': caption }]">
    <span class="ui-field__label">
      <span>{{ label }}</span>
      <small v-if="hint">{{ hint }}</small>
    </span>
    <slot />
    <slot name="note" />
  </component>
</template>

<style scoped>
@layer ui {
  .ui-field { display: grid; gap: 6px; min-width: 0; color: var(--text-secondary); font-size: 14px; font-weight: 500; }
  .ui-field__label { display: flex; justify-content: space-between; gap: 8px; min-width: 0; }
  .ui-field__label > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ui-field__label small { flex: none; color: var(--faint); font-size: 14px; font-weight: 400; }
  .ui-field--inline { grid-template-columns: 88px minmax(0, 1fr); align-items: center; }
  .ui-field--caption { gap: 4px; }
  .ui-field--caption .ui-field__label { color: var(--muted); font-size: var(--font-caption); font-weight: 650; letter-spacing: .04em; text-transform: uppercase; }
}
</style>

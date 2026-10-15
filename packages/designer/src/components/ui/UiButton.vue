<script setup lang="ts">
/**
 * Text goes in the default slot and a leading icon in `#icon`. Icon-only buttons
 * put the icon in the default slot. Text is wrapped so it can be trimmed to cap
 * height and optically centered.
 */
const props = withDefaults(defineProps<{
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'xs' | 'sm' | 'md' | 'lg'
  type?: 'button' | 'submit'
  /** Accessible name and tooltip; required when the button only shows an icon. */
  label?: string
  iconOnly?: boolean
  active?: boolean
  danger?: boolean
  mono?: boolean
}>(), {
  variant: 'secondary',
  size: 'md',
  type: 'button',
  label: undefined,
})
</script>

<template>
  <button
    class="ui-button"
    :class="[`ui-button--${props.variant}`, `ui-button--${props.size}`, { 'ui-button--icon': iconOnly, 'ui-button--active': active, 'ui-button--danger': danger, 'ui-button--mono': mono }]"
    :type="type"
    :title="label"
    :aria-label="iconOnly ? label : undefined"
  >
    <slot name="icon" />
    <slot v-if="iconOnly" />
    <span v-else-if="$slots.default" class="ui-button__label"><slot /></span>
  </button>
</template>

<style scoped>
@layer ui {
  .ui-button {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: var(--control-md);
    border: 1px solid transparent;
    border-radius: var(--radius);
    background: transparent;
    padding: 0 10px;
    font-size: 14px;
    font-weight: 400;
    line-height: 1;
    letter-spacing: normal;
    text-transform: none;
    white-space: nowrap;
    transition: background .1s ease, color .1s ease, border-color .1s ease;
  }
  .ui-button:disabled { cursor: default; }
  /* Trim the font's ascent and descent so the capitals, not the font box, are centered. */
  .ui-button__label { display: block; text-box: trim-both cap alphabetic; }

  .ui-button--xs { height: var(--control-xs); border-radius: var(--radius-sm); padding: 0 7px; }
  .ui-button--sm { height: var(--control-sm); border-radius: var(--radius-sm); padding: 0 8px; }
  .ui-button--lg { height: var(--control-lg); padding: 0 14px; }
  .ui-button--icon { width: var(--control-md); padding: 0; }
  .ui-button--icon.ui-button--xs { width: var(--control-xs); }
  .ui-button--icon.ui-button--sm { width: var(--control-sm); }
  .ui-button--icon.ui-button--lg { width: var(--control-lg); }
  .ui-button--mono { font-family: var(--mono); }

  .ui-button--primary { border-color: var(--primary-hover); background: var(--primary); color: #fff; font-weight: 600; box-shadow: var(--shadow-sm); }
  .ui-button--primary:hover:not(:disabled) { background: var(--primary-hover); }
  .ui-button--primary:disabled { border-color: var(--border); background: var(--surface-subtle); color: var(--faint); box-shadow: none; }

  .ui-button--secondary { border-color: var(--border); background: var(--background); color: var(--text-secondary); }
  .ui-button--secondary:hover:not(:disabled) { background: var(--surface); color: var(--text); }
  .ui-button--secondary:disabled { color: var(--faint); }

  .ui-button--ghost { color: var(--muted); }
  .ui-button--ghost:hover:not(:disabled) { background: var(--surface-subtle); color: var(--text); }
  .ui-button--ghost:disabled { color: var(--faint); opacity: .6; }

  .ui-button--danger:hover:not(:disabled) { color: var(--danger); }

  .ui-button--active,
  .ui-button--active:hover:not(:disabled) { background: var(--selection-soft); color: var(--selection); }
  .ui-button--secondary.ui-button--active { border-color: var(--selection); }
}
</style>

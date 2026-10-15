<script setup lang="ts">
withDefaults(defineProps<{
  title?: string
  /** `caption` uses the small uppercase style over a translucent bar. */
  variant?: 'default' | 'caption'
}>(), { title: undefined, variant: 'default' })
</script>

<template>
  <header class="ui-panel-header" :class="`ui-panel-header--${variant}`">
    <span v-if="title || $slots.title" class="ui-panel-header__title"><slot name="title">{{ title }}</slot></span>
    <slot />
    <div v-if="$slots.actions" class="ui-panel-header__actions"><slot name="actions" /></div>
  </header>
</template>

<style scoped>
@layer ui {
  .ui-panel-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-width: 0; min-height: 0; border-bottom: 1px solid var(--border); padding: 0 8px 0 12px; color: var(--text); font-size: 14px; font-weight: 650; }
  .ui-panel-header__title { display: flex; align-items: center; gap: 7px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ui-panel-header__actions { display: flex; flex: none; align-items: center; gap: 2px; margin-left: auto; }
  .ui-panel-header--caption { z-index: 2; border-bottom-color: #cbd5e180; background: #f8fafcdd; color: var(--muted); font-size: var(--font-caption); letter-spacing: .04em; text-transform: uppercase; backdrop-filter: blur(8px); }
}
</style>

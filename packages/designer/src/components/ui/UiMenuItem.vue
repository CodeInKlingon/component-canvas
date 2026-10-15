<script setup lang="ts">
defineProps<{ danger?: boolean }>()
</script>

<template>
  <button class="ui-menu-item" :class="{ danger }" type="button" role="menuitem"><span class="ui-menu-item__label"><slot /></span></button>
</template>

<style scoped>
@layer ui {
  .ui-menu-item { display: flex; align-items: center; height: 32px; line-height: 1; border: 0; border-radius: 5px; background: transparent; padding: 0 9px; text-align: left; }
  .ui-menu-item__label { text-box: trim-both cap alphabetic; }
  .ui-menu-item:hover:not(:disabled) { background: var(--selection-soft); color: var(--selection); }
  .ui-menu-item.danger { color: var(--danger); }
  .ui-menu-item.danger:hover:not(:disabled) { background: var(--danger-surface); color: var(--danger); }
  .ui-menu-item:disabled { color: var(--faint); cursor: default; }
}
</style>

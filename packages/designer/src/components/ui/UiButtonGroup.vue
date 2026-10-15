<template>
  <div class="ui-button-group" role="group">
    <slot />
  </div>
</template>

<style scoped>
@layer ui {
  .ui-button-group {
    display: flex;
    flex: none;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--background);
  }
  .ui-button-group :slotted(.ui-button) { border: 0; border-right: 1px solid var(--border); border-radius: 0; box-shadow: none; }
  .ui-button-group :slotted(.ui-button:last-child) { border-right: 0; }
  /* Round the end segments to the group's inner radius so the active ring is not clipped at the corners. */
  .ui-button-group :slotted(.ui-button:first-child) { border-top-left-radius: calc(var(--radius) - 1px); border-bottom-left-radius: calc(var(--radius) - 1px); }
  .ui-button-group :slotted(.ui-button:last-child) { border-top-right-radius: calc(var(--radius) - 1px); border-bottom-right-radius: calc(var(--radius) - 1px); }
  .ui-button-group :slotted(.ui-button--active) { box-shadow: inset 0 0 0 1px var(--selection); }
}
</style>

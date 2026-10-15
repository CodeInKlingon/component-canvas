<script setup lang="ts" generic="T extends string">
defineProps<{
  tabs: { value: T; label: string }[]
}>()

const model = defineModel<T>({ required: true })
</script>

<template>
  <div class="ui-tabs">
    <div v-if="tabs.length" class="ui-tabs__list" role="tablist">
      <button
        v-for="tab in tabs"
        :key="tab.value"
        class="ui-tabs__tab"
        :class="{ active: model === tab.value }"
        type="button"
        role="tab"
        :aria-selected="model === tab.value"
        @click="model = tab.value"
      >
        <span class="ui-tabs__label">{{ tab.label }}</span>
      </button>
    </div>
    <slot name="trailing" />
  </div>
</template>

<style scoped>
@layer ui {
  .ui-tabs { display: flex; align-items: stretch; gap: 4px; border-bottom: 1px solid var(--border); padding: 0 8px 0 10px; }
  .ui-tabs > :slotted(*) { align-self: center; }
  .ui-tabs__list { display: flex; flex: 1; min-width: 0; }
  .ui-tabs__tab { position: relative; flex: 1; border: 0; background: none; color: var(--muted); font-size: 14px; font-weight: 550; line-height: 1; }
  .ui-tabs__label { display: block; text-box: trim-both cap alphabetic; }
  .ui-tabs__tab:hover { color: var(--text); }
  .ui-tabs__tab.active { color: var(--selection); }
  .ui-tabs__tab.active::after { content: ''; position: absolute; right: 8px; bottom: -1px; left: 8px; height: 2px; background: var(--selection); }
}
</style>

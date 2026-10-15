<script setup lang="ts">
import { ref, type Component } from 'vue'
import { Plus } from '@lucide/vue'
import { adjacentTabIndex, toolDragMime } from '../../lib/dock-layout'
import UiButton from './UiButton.vue'

/** A tab strip for a dock zone. Presentational: the parent owns dock state. */
const props = defineProps<{
  tabs: { id: string; label: string; icon: Component }[]
  active: string | null
}>()

const emit = defineEmits<{
  activate: [id: string]
  menu: [payload: { id: string; x: number; y: number }]
  dragStart: [id: string]
  reorder: [payload: { id: string; before: string | null }]
  add: [payload: { x: number; y: number }]
}>()

const list = ref<HTMLElement | null>(null)
const dropIndex = ref<number | null>(null)

function focusTab(index: number): void {
  const button = list.value?.querySelectorAll<HTMLButtonElement>('.ui-dock-tabs__tab')[index]
  button?.focus()
}

function onKeydown(event: KeyboardEvent, id: string): void {
  const count = props.tabs.length
  const index = props.tabs.findIndex((tab) => tab.id === id)
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    event.preventDefault()
    focusTab(adjacentTabIndex(index, count, 1))
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    event.preventDefault()
    focusTab(adjacentTabIndex(index, count, -1))
  } else if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
    event.preventDefault()
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    emit('menu', { id, x: rect.left, y: rect.bottom })
  }
}

function onDragStart(event: DragEvent, id: string): void {
  event.dataTransfer?.setData(toolDragMime, id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
  emit('dragStart', id)
}

function onTabDragOver(event: DragEvent, index: number): void {
  if (!event.dataTransfer?.types.includes(toolDragMime)) return
  event.preventDefault()
  event.stopPropagation()
  event.dataTransfer.dropEffect = 'move'
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  dropIndex.value = event.clientX > rect.left + rect.width / 2 ? index + 1 : index
}

function onTabDrop(event: DragEvent): void {
  const id = event.dataTransfer?.getData(toolDragMime)
  const index = dropIndex.value
  event.preventDefault()
  event.stopPropagation()
  dropIndex.value = null
  if (!id || index === null) return
  emit('reorder', { id, before: props.tabs[index]?.id ?? null })
}

function onListDragLeave(event: DragEvent): void {
  if (event.currentTarget instanceof Node && event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return
  dropIndex.value = null
}

/** Translate vertical wheel input into horizontal scrolling when the strip overflows. */
function onWheel(event: WheelEvent): void {
  const element = list.value
  if (!element || element.scrollWidth <= element.clientWidth) return
  const delta = event.deltaY || event.deltaX
  if (!delta) return
  event.preventDefault()
  element.scrollLeft += delta
}
</script>

<template>
  <div class="ui-dock-tabs">
    <div ref="list" class="ui-dock-tabs__list" role="tablist" @dragleave="onListDragLeave" @wheel="onWheel">
      <button
        v-for="(tab, index) in tabs"
        :key="tab.id"
        class="ui-dock-tabs__tab"
        :class="{ active: active === tab.id, 'drop-before': dropIndex === index, 'drop-after': dropIndex === tabs.length && index === tabs.length - 1 }"
        type="button"
        role="tab"
        draggable="true"
        :tabindex="active === tab.id ? 0 : -1"
        :aria-selected="active === tab.id"
        @click="emit('activate', tab.id)"
        @keydown="onKeydown($event, tab.id)"
        @contextmenu.prevent="emit('menu', { id: tab.id, x: $event.clientX, y: $event.clientY })"
        @dragstart="onDragStart($event, tab.id)"
        @dragover="onTabDragOver($event, index)"
        @drop="onTabDrop"
      >
        <component :is="tab.icon" :size="13" />
        <span class="ui-dock-tabs__label">{{ tab.label }}</span>
      </button>
    </div>
    <UiButton
      class="ui-dock-tabs__add"
      variant="ghost"
      size="xs"
      icon-only
      label="Add tool"
      @click="emit('add', { x: $event.clientX, y: $event.clientY })"
    >
      <Plus :size="13" />
    </UiButton>
  </div>
</template>

<style scoped>
@layer ui {
  .ui-dock-tabs { display: flex; flex: 1; min-width: 0; align-items: center; gap: 2px; }
  /* Tabs keep their natural width and the strip scrolls horizontally instead of truncating.
     The scrollbar is hidden so it neither shows nor steals height and bumps the tabs;
     wheel, trackpad, and keyboard focus still scroll the strip. */
  .ui-dock-tabs__list { display: flex; flex: 1; min-width: 0; align-items: center; gap: 2px; overflow-x: auto; overflow-y: hidden; overscroll-behavior-x: contain; scrollbar-width: none; }
  .ui-dock-tabs__list::-webkit-scrollbar { display: none; }
  .ui-dock-tabs__tab { position: relative; display: flex; flex: none; align-items: center; gap: 6px; height: 28px; border: 0; border-radius: var(--radius-sm); background: none; color: var(--muted); padding: 0 9px; font-size: 13px; font-weight: 550; }
  .ui-dock-tabs__tab:hover { background: var(--surface-subtle); color: var(--text); }
  .ui-dock-tabs__tab.active { background: var(--selection-soft); color: var(--selection); }
  .ui-dock-tabs__label { white-space: nowrap; }
  .ui-dock-tabs__add { flex: none; }
  .ui-dock-tabs__tab.drop-before::before,
  .ui-dock-tabs__tab.drop-after::after { content: ''; position: absolute; top: 3px; bottom: 3px; width: 2px; border-radius: 1px; background: var(--selection); }
  .ui-dock-tabs__tab.drop-before::before { left: -1px; }
  .ui-dock-tabs__tab.drop-after::after { right: -1px; }
}
</style>

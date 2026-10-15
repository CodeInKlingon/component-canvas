<script setup lang="ts">
import { computed, ref, type Component } from 'vue'
import { MoreHorizontal, Plus } from '@lucide/vue'
import { toolDragMime, type DockZone } from '../lib/dock-layout'
import UiButton from './ui/UiButton.vue'
import UiDockTabs from './ui/UiDockTabs.vue'

/**
 * One dock zone: header plus a body slot the parent fills with the active tool.
 * Expanded, the tab strip appears only with two or more tools and a single tool
 * shows a compact header. Collapsed, the tools stack as icon buttons along the
 * rail so every tool stays one click away. Presentational — the parent owns all
 * dock state and responds to the events.
 */
const props = defineProps<{
  zone: DockZone
  tabs: { id: string; label: string; icon: Component }[]
  active: string | null
  collapsed: boolean
}>()

const emit = defineEmits<{
  activate: [id: string]
  select: [id: string]
  menu: [payload: { id: string; x: number; y: number }]
  dragStart: [id: string]
  reorder: [payload: { id: string; before: string | null }]
  add: [payload: { x: number; y: number }]
  drop: [zone: DockZone, toolId: string]
}>()

const dragOver = ref(false)
const activeTab = computed(() => props.tabs.find((tab) => tab.id === props.active) ?? props.tabs[0])

function menuPoint(event: MouseEvent): { x: number; y: number } {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  return { x: rect.left, y: rect.bottom }
}

function onDragOver(event: DragEvent): void {
  if (!event.dataTransfer?.types.includes(toolDragMime)) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
  dragOver.value = true
}

function onDragLeave(event: DragEvent): void {
  if (event.currentTarget instanceof Node && event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return
  dragOver.value = false
}

function onDrop(event: DragEvent): void {
  const toolId = event.dataTransfer?.getData(toolDragMime)
  dragOver.value = false
  if (!toolId) return
  event.preventDefault()
  emit('drop', props.zone, toolId)
}
</script>

<template>
  <section
    class="dock"
    :class="[`dock--${zone}`, { 'dock--collapsed': collapsed, 'dock--drop': dragOver }]"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <header class="dock__header">
      <template v-if="collapsed">
        <div v-if="tabs.length" class="dock__rail">
          <UiButton
            v-for="tab in tabs"
            :key="tab.id"
            variant="ghost"
            size="xs"
            icon-only
            :label="tab.label"
            :active="tab.id === active"
            :aria-pressed="tab.id === active"
            @click="emit('select', tab.id)"
          >
            <component :is="tab.icon" :size="15" />
          </UiButton>
        </div>
        <UiButton v-else variant="ghost" size="sm" icon-only label="Add tool" @click="emit('add', menuPoint($event))">
          <Plus :size="14" />
        </UiButton>
      </template>

      <UiDockTabs
        v-else-if="tabs.length > 1"
        :tabs="tabs"
        :active="active"
        @activate="emit('activate', $event)"
        @menu="emit('menu', $event)"
        @drag-start="emit('dragStart', $event)"
        @reorder="emit('reorder', $event)"
        @add="emit('add', $event)"
      />

      <template v-else-if="activeTab">
        <div
          class="dock__single"
          title="Right-click for options, or drag onto another panel to move"
          @contextmenu.prevent="emit('menu', { id: activeTab.id, x: $event.clientX, y: $event.clientY })"
        >
          <component :is="activeTab.icon" :size="13" />
          <span class="dock__single-label">{{ activeTab.label }}</span>
        </div>
        <UiButton variant="ghost" size="xs" icon-only label="Tool options" @click="emit('menu', { id: activeTab.id, x: menuPoint($event).x, y: menuPoint($event).y })">
          <MoreHorizontal :size="13" />
        </UiButton>
        <UiButton variant="ghost" size="xs" icon-only label="Add tool" @click="emit('add', menuPoint($event))"><Plus :size="13" /></UiButton>
      </template>

      <UiButton v-else variant="ghost" size="sm" icon-only label="Add tool" @click="emit('add', menuPoint($event))">
        <Plus :size="14" />
      </UiButton>
    </header>
    <div v-show="!collapsed" class="dock__body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
@layer ui {
  .dock { position: relative; display: grid; grid-template-rows: auto 1fr; min-width: 0; min-height: 0; background: var(--background); }
  .dock--left { border-right: 1px solid var(--border); }
  .dock--right { border-left: 1px solid var(--border); }
  .dock--bottom { border-top: 1px solid var(--border); }
  .dock__header { display: flex; align-items: center; gap: 3px; min-width: 0; min-height: 38px; border-bottom: 1px solid var(--border); padding: 0 6px 0 8px; }
  .dock--collapsed { grid-template-rows: 1fr; }
  .dock--collapsed .dock__header { border-bottom: 0; padding: 0; }
  .dock--left.dock--collapsed .dock__header,
  .dock--right.dock--collapsed .dock__header { justify-content: center; height: 100%; }
  .dock__body { min-width: 0; min-height: 0; overflow: auto; }
  .dock--drop { box-shadow: inset 0 0 0 2px var(--selection); }
  .dock__single { display: flex; flex: 1; min-width: 0; align-items: center; gap: 6px; margin-right: auto; color: var(--text-secondary); font-size: 13px; font-weight: 600; }
  .dock__single-label { overflow: hidden; line-height: 1.5; text-overflow: ellipsis; white-space: nowrap; }

  /* Collapsed rails: every tool shown as an icon button stacked along the rail. */
  .dock__rail { display: flex; gap: 2px; padding: 5px; min-width: 0; min-height: 0; overflow: auto; }
  .dock--left .dock__rail,
  .dock--right .dock__rail { flex-direction: column; align-items: center; width: 100%; height: 100%; }
  .dock--bottom .dock__rail { flex-direction: row; align-items: center; }
}
</style>

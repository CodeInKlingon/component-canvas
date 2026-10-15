<script setup lang="ts">
import { type Component } from 'vue'
import { PanelBottomClose, PanelBottomOpen, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, RotateCcw } from '@lucide/vue'
import type { DockZone } from '../lib/dock-layout'
import type { PanelToggleState } from '../composables/useWorkspaceLayout'
import UiButton from './ui/UiButton.vue'
import UiButtonGroup from './ui/UiButtonGroup.vue'

/** Global header group that shows/hides each panel and resets the layout. */
defineProps<{ panels: PanelToggleState[] }>()

const emit = defineEmits<{
  toggle: [id: DockZone]
  reset: []
}>()

const icons: Record<DockZone, { open: Component; closed: Component }> = {
  left: { open: PanelLeftClose, closed: PanelLeftOpen },
  bottom: { open: PanelBottomClose, closed: PanelBottomOpen },
  right: { open: PanelRightClose, closed: PanelRightOpen },
}
</script>

<template>
  <div class="panel-toggles">
    <UiButtonGroup aria-label="Panel visibility">
      <UiButton
        v-for="panel in panels"
        :key="panel.id"
        variant="ghost"
        icon-only
        :disabled="panel.disabled"
        :title="`${panel.collapsed ? 'Show' : 'Hide'} ${panel.label} panel`"
        :aria-label="`${panel.collapsed ? 'Show' : 'Hide'} ${panel.label} panel`"
        :aria-pressed="!panel.collapsed"
        @click="emit('toggle', panel.id)"
      >
        <component :is="panel.collapsed ? icons[panel.id].closed : icons[panel.id].open" :size="15" />
      </UiButton>
    </UiButtonGroup>
    <UiButton variant="ghost" size="sm" icon-only label="Reset layout" @click="emit('reset')"><RotateCcw :size="14" /></UiButton>
  </div>
</template>

<style scoped>
@layer ui {
  .panel-toggles { display: flex; align-items: center; gap: 4px; }
}
</style>

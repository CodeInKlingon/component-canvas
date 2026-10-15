<script setup lang="ts">
import type { DesignerComponentMetadata } from '@vue-designer/shared'
import type { ComponentGroup } from '../lib/component-palette'
import type { NativeElementMetadata } from '../lib/native-elements'
import PaletteItem from './PaletteItem.vue'
import UiDialog from './ui/UiDialog.vue'
import UiInput from './ui/UiInput.vue'
import UiSectionHeading from './ui/UiSectionHeading.vue'

defineProps<{
  position: 'inside' | 'after'
  searchable: boolean
  groups: ComponentGroup[]
  natives: NativeElementMetadata[]
}>()

const emit = defineEmits<{
  close: []
  pickComponent: [component: DesignerComponentMetadata]
  pickNative: [element: NativeElementMetadata]
}>()

const query = defineModel<string>('query', { required: true })
</script>

<template>
  <UiDialog
    :title="`Insert ${position}`"
    subtitle="Choose a project component or native element"
    width="720px"
    close-label="Close insert picker"
    flush
    @close="emit('close')"
  >
    <div class="insert-picker-content">
      <section>
        <UiInput v-if="searchable" v-model="query" class="palette-search" type="search" placeholder="Search components" aria-label="Search components" />
        <template v-for="group in groups" :key="group.id">
          <UiSectionHeading as="h3" class="palette-heading">{{ group.label }}</UiSectionHeading>
          <div class="palette-list">
            <PaletteItem v-for="component in group.components" :key="component.id" :label="component.label" :category="component.category" kind="component" @click="emit('pickComponent', component)" />
          </div>
        </template>
      </section>
      <section>
        <UiSectionHeading as="h3" class="palette-heading">Native elements</UiSectionHeading>
        <div class="palette-list">
          <PaletteItem v-for="element in natives" :key="element.tag" :label="element.label" :category="element.category" kind="native" @click="emit('pickNative', element)" />
        </div>
      </section>
    </div>
  </UiDialog>
</template>

<style scoped>
.insert-picker-content { display: grid; grid-template-columns: 1fr 1fr; }
.insert-picker-content > section { min-width: 0; padding: 8px 6px 14px; }
.insert-picker-content > section + section { border-left: 1px solid var(--border); }
</style>

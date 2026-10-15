<script setup lang="ts">
import { inject } from 'vue'
import { editorContextKey } from '../../composables/editor-context'
import PaletteItem from '../PaletteItem.vue'
import UiEmptyState from '../ui/UiEmptyState.vue'
import UiInput from '../ui/UiInput.vue'
import UiNotice from '../ui/UiNotice.vue'
import UiSectionHeading from '../ui/UiSectionHeading.vue'

const {
  selectedNode,
  components,
  componentQuery,
  componentGroups,
  canContainChildren,
  startComponentDrag,
  startNativeDrag,
  endTreeDrag,
  insertComponent,
  insertNative,
  nativeElements,
} = inject(editorContextKey)!
</script>

<template>
  <div class="tool tool--components">
    <UiNotice class="panel-notice">Insert into <strong>{{ selectedNode?.label ?? 'a selected container' }}</strong></UiNotice>
    <UiInput v-if="components.length" v-model="componentQuery" class="palette-search" type="search" placeholder="Search components" aria-label="Search components" />
    <template v-for="group in componentGroups" :key="group.id">
      <UiSectionHeading class="palette-heading">{{ group.label }}</UiSectionHeading>
      <div class="palette-list">
        <PaletteItem
          v-for="component in group.components"
          :key="component.id"
          :label="component.label"
          :category="component.category"
          kind="component"
          :disabled="!canContainChildren(selectedNode)"
          :title="selectedNode ? `Insert <${component.tag}> into ${selectedNode.label}` : 'Select a container first'"
          draggable="true"
          @dragstart="startComponentDrag($event, component)"
          @dragend="endTreeDrag"
          @click="insertComponent(component)"
        />
      </div>
    </template>
    <UiEmptyState v-if="components.length && !componentGroups.length">No components match “{{ componentQuery }}”.</UiEmptyState>
    <UiSectionHeading class="palette-heading">Native elements</UiSectionHeading>
    <div class="palette-list">
      <PaletteItem
        v-for="element in nativeElements"
        :key="element.tag"
        :label="element.label"
        :category="element.category"
        kind="native"
        :disabled="!canContainChildren(selectedNode)"
        :title="selectedNode ? `Insert into ${selectedNode.label}` : 'Select a container first'"
        draggable="true"
        @dragstart="startNativeDrag($event, element)"
        @dragend="endTreeDrag"
        @click="insertNative(element)"
      />
    </div>
  </div>
</template>

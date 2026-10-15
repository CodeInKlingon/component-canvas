<script setup lang="ts">
import { inject } from 'vue'
import { ArrowLeft, FileCode2, RefreshCw } from '@lucide/vue'
import { editorContextKey } from '../../composables/editor-context'
import TreeNode from '../TreeNode.vue'
import UiButton from '../ui/UiButton.vue'
import UiEmptyState from '../ui/UiEmptyState.vue'
import UiNotice from '../ui/UiNotice.vue'
import UiSelect from '../ui/UiSelect.vue'

const {
  path,
  documentOptions,
  switchDocument,
  showDesigns,
  loadDocuments,
  loading,
  documentMissing,
  activeDocument,
  collapsedIds,
  selectedNodeId,
  dragKind,
  draggedNode,
  selectNode,
  toggleCollapse,
  startNodeDrag,
  endTreeDrag,
  handleTreeDrop,
  openContextMenu,
} = inject(editorContextKey)!
</script>

<template>
  <div class="tool tool--layers">
    <div class="tool__bar">
      <UiSelect class="document-picker" :value="path" :options="documentOptions" aria-label="Active document" @change="switchDocument(($event.target as HTMLSelectElement).value)">
        <template #leading><FileCode2 :size="15" /></template>
      </UiSelect>
      <UiButton variant="ghost" size="sm" icon-only label="Refresh project" @click="loadDocuments()"><RefreshCw :size="14" /></UiButton>
    </div>
    <UiEmptyState v-if="loading">Scanning project...</UiEmptyState>
    <ul v-else-if="activeDocument" class="tree-list">
      <TreeNode
        v-for="node in activeDocument.tree"
        :key="node.id"
        :node="node"
        :selected-id="selectedNodeId"
        :collapsed-ids="collapsedIds"
        :drag-kind="dragKind"
        :dragged-node="draggedNode"
        @select="selectNode"
        @toggle-collapse="toggleCollapse"
        @drag-node="startNodeDrag"
        @drag-end="endTreeDrag"
        @drop-node="handleTreeDrop"
        @context-menu="openContextMenu"
      />
    </ul>
    <UiEmptyState v-else-if="documentMissing">
      <code>{{ path }}</code> is not a design in this project.
      <template #actions><UiButton variant="ghost" class="back-link" @click="showDesigns()"><template #icon><ArrowLeft :size="14" /></template>All designs</UiButton></template>
    </UiEmptyState>
    <UiEmptyState v-else>Loading design...</UiEmptyState>
    <UiNotice v-if="activeDocument?.diagnostics.length" class="panel-notice" tone="danger">{{ activeDocument.diagnostics[0]?.message }}</UiNotice>
  </div>
</template>

<script setup lang="ts">
import { inject, type ComponentPublicInstance } from 'vue'
import { editorContextKey } from '../../composables/editor-context'
import SourceEditor from '../SourceEditor.vue'

const { framework, activeDocument, source, readOnly, updateSource, commitSourceEdit, syncSelectionFromSource, sourceEditor } = inject(editorContextKey)!

function setSourceEditor(element: Element | ComponentPublicInstance | null): void {
  sourceEditor.value = (element as InstanceType<typeof SourceEditor> | null)
}
</script>

<template>
  <div class="tool tool--source">
    <code class="source-panel-name">{{ activeDocument?.name ?? 'No document' }}</code>
    <SourceEditor
      v-if="framework"
      :key="`${framework.sourceLanguage}:${activeDocument?.path ?? ''}`"
      :ref="setSourceEditor"
      :source="source"
      :file-name="activeDocument?.path.split('/').at(-1) ?? `document${framework.fileExtension}`"
      :language="framework.sourceLanguage"
      :document-label="framework.documentLabel"
      :disabled="readOnly || !activeDocument"
      @input="updateSource"
      @blur="commitSourceEdit"
      @cursor="syncSelectionFromSource"
    />
  </div>
</template>

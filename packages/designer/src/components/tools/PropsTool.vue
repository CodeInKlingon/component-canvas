<script setup lang="ts">
import { inject } from 'vue'
import { Plus, Trash2 } from '@lucide/vue'
import { editorContextKey } from '../../composables/editor-context'
import SelectionSummary from '../SelectionSummary.vue'
import UiButton from '../ui/UiButton.vue'
import UiColorInput from '../ui/UiColorInput.vue'
import UiEmptyState from '../ui/UiEmptyState.vue'
import UiField from '../ui/UiField.vue'
import UiInput from '../ui/UiInput.vue'
import UiNotice from '../ui/UiNotice.vue'
import UiSectionHeading from '../ui/UiSectionHeading.vue'
import UiSelect from '../ui/UiSelect.vue'
import UiTextarea from '../ui/UiTextarea.vue'

const {
  readOnly,
  selectedNode,
  inspectorLocked,
  duplicateSelectedNode,
  removeSelectedNode,
  updateSelectedText,
  selectedMetadataProps,
  selectedComponent,
  selectedAttribute,
  propValue,
  propChecked,
  propIsExpression,
  updateComponentProp,
  clearComponentProp,
  isMetadataProp,
  updateSelectedAttribute,
} = inject(editorContextKey)!
</script>

<template>
  <div class="tool tool--props">
    <UiEmptyState v-if="!selectedNode" title="Select a layer">Text and attributes for the selected element will appear here.</UiEmptyState>
    <template v-else>
      <SelectionSummary :node="selectedNode" :subtitle="selectedNode.kind">
        <template v-if="!readOnly" #actions>
          <UiButton variant="ghost" size="sm" icon-only :disabled="!selectedNode.editable" label="Duplicate layer" @click="duplicateSelectedNode()"><Plus :size="14" /></UiButton>
          <UiButton variant="ghost" size="sm" icon-only danger :disabled="!selectedNode.editable" label="Delete layer" @click="removeSelectedNode()"><Trash2 :size="14" /></UiButton>
        </template>
      </SelectionSummary>
      <section v-if="selectedNode.kind === 'text'" class="inspector-section">
        <UiField label="Text content">
          <UiTextarea :value="selectedNode.value" mono :readonly="inspectorLocked" @input="updateSelectedText" />
        </UiField>
      </section>
      <section v-if="selectedMetadataProps.length" class="inspector-section">
        <UiSectionHeading variant="title">{{ selectedComponent ? 'Props' : 'Attributes' }}</UiSectionHeading>
        <UiField
          v-for="prop in selectedMetadataProps"
          :key="prop.name"
          :label="prop.name"
          :hint="prop.required ? 'Required' : prop.type"
          :title="prop.description || prop.type"
        >
          <div class="prop-control">
            <input
              v-if="prop.control === 'checkbox'"
              type="checkbox"
              :checked="propChecked(prop)"
              :disabled="inspectorLocked || propIsExpression(prop)"
              @change="updateComponentProp(prop, $event)"
            />
            <UiSelect
              v-else-if="prop.control === 'select'"
              :value="propValue(prop)"
              :options="prop.options ?? []"
              :empty-option="prop.required ? undefined : 'Default'"
              mono
              :disabled="inspectorLocked || propIsExpression(prop)"
              @change="updateComponentProp(prop, $event)"
            />
            <UiColorInput
              v-else-if="prop.control === 'color'"
              :value="propValue(prop)"
              :label="prop.name"
              :readonly="inspectorLocked"
              :disabled="propIsExpression(prop)"
              @change="updateComponentProp(prop, $event)"
            />
            <UiInput
              v-else
              :type="prop.control === 'number' ? 'number' : 'text'"
              :value="propValue(prop)"
              mono
              :readonly="inspectorLocked"
              :disabled="propIsExpression(prop)"
              @change="updateComponentProp(prop, $event)"
            />
            <UiButton v-if="selectedAttribute(prop.name) && !prop.required && !inspectorLocked" variant="ghost" size="sm" title="Use default value" @click="clearComponentProp(prop)">Reset</UiButton>
          </div>
          <template v-if="propIsExpression(prop)" #note><small class="expression-note">Expression props are source-only.</small></template>
        </UiField>
      </section>
      <section v-if="selectedNode.attributes.some((attribute) => !isMetadataProp(attribute.name))" class="inspector-section">
        <UiSectionHeading variant="title">Attributes</UiSectionHeading>
        <UiField
          v-for="attribute in selectedNode.attributes.filter((item) => !isMetadataProp(item.name))"
          :key="attribute.name"
          :label="attribute.name"
          :hint="attribute.editable ? undefined : 'Expression'"
        >
          <UiInput
            :value="attribute.value"
            mono
            :readonly="inspectorLocked"
            :disabled="!attribute.editable"
            @change="updateSelectedAttribute(attribute.name, $event)"
          />
        </UiField>
      </section>
      <UiEmptyState v-if="selectedNode.kind !== 'text' && !selectedNode.attributes.length && !selectedMetadataProps.length" compact>No attributes on this layer.</UiEmptyState>
      <UiNotice v-if="!selectedNode.editable" class="panel-notice" tone="warning">{{ selectedNode.lockedReason }}</UiNotice>
      <UiNotice v-else-if="readOnly" class="panel-notice">Read-only build. Run the dev server to edit this design.</UiNotice>
    </template>
  </div>
</template>

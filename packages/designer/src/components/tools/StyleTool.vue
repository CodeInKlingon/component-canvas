<script setup lang="ts">
import { inject } from 'vue'
import { editorContextKey } from '../../composables/editor-context'
import SelectionSummary from '../SelectionSummary.vue'
import UiColorInput from '../ui/UiColorInput.vue'
import UiEmptyState from '../ui/UiEmptyState.vue'
import UiField from '../ui/UiField.vue'
import UiInput from '../ui/UiInput.vue'
import UiSectionHeading from '../ui/UiSectionHeading.vue'
import UiSelect from '../ui/UiSelect.vue'

const {
  selectedNode,
  inspectorLocked,
  styleRules,
  activeStyleRule,
  activeStyleSelector,
  styleValue,
  styleSelector,
  updateStyle,
  styleControls,
  styleOptions,
  computedStyles,
} = inject(editorContextKey)!
</script>

<template>
  <div class="tool tool--style">
    <UiEmptyState v-if="!selectedNode || selectedNode.kind === 'text'" title="Select an element">Editable local CSS rules will appear here.</UiEmptyState>
    <template v-else>
      <SelectionSummary :node="selectedNode" subtitle="Styles" />
      <section class="inspector-section">
        <UiField v-if="styleRules.length" label="Local rule">
          <UiSelect
            :value="activeStyleRule?.selector"
            :options="styleRules.map((rule) => rule.selector)"
            mono
            @change="activeStyleSelector = ($event.target as HTMLSelectElement).value"
          />
        </UiField>
        <UiField v-else as="div" label="Local rule">
          <code class="style-rule-new">{{ styleSelector() }} (new)</code>
        </UiField>
      </section>
      <section v-for="group in styleControls" :key="group.group" class="inspector-section style-section">
        <UiSectionHeading variant="title">{{ group.group }}</UiSectionHeading>
        <UiField v-for="property in group.properties" :key="property" :label="property" layout="inline">
          <UiSelect
            v-if="styleOptions[property]"
            :value="styleValue(property)"
            :options="styleOptions[property]"
            empty-option="Unset"
            mono
            :disabled="inspectorLocked"
            @change="updateStyle(property, $event)"
          />
          <UiColorInput
            v-else-if="property === 'color' || property === 'background-color'"
            :value="styleValue(property)"
            :label="property"
            :readonly="inspectorLocked"
            placeholder="Unset"
            @change="updateStyle(property, $event)"
          />
          <UiInput v-else :value="styleValue(property)" mono :readonly="inspectorLocked" placeholder="Unset" @change="updateStyle(property, $event)" />
        </UiField>
      </section>
      <section v-if="Object.keys(computedStyles).length" class="inspector-section computed-section">
        <UiSectionHeading variant="title">Computed</UiSectionHeading>
        <div v-for="(value, property) in computedStyles" :key="property" class="computed-row">
          <span>{{ property }}</span><code>{{ value || 'initial' }}</code>
        </div>
      </section>
    </template>
  </div>
</template>

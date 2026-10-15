<script setup lang="ts">
import { computed } from 'vue'
import { Sparkles } from '@lucide/vue'
import type { DesignerAiModel } from '@vue-designer/shared'
import UiButton from './ui/UiButton.vue'
import UiDialog from './ui/UiDialog.vue'
import UiField from './ui/UiField.vue'
import UiSelect from './ui/UiSelect.vue'
import UiTextarea from './ui/UiTextarea.vue'

const props = defineProps<{
  nodeLabel: string
  running: boolean
  models: DesignerAiModel[]
  modelsState: 'idle' | 'loading' | 'ready' | 'error'
  modelsError: string
}>()

const emit = defineEmits<{
  close: []
  submit: []
}>()

const prompt = defineModel<string>('prompt', { required: true })
const model = defineModel<string>('model', { required: true })
const params = defineModel<Record<string, string>>('params', { required: true })

const selectedModel = computed(() => props.models.find((item) => item.id === model.value))
const modelOptions = computed(() => props.models.map((item) => ({ value: item.id, label: item.displayName })))

function submitShortcut(event: KeyboardEvent): void {
  if (!event.ctrlKey && !event.metaKey) return
  event.preventDefault()
  emit('submit')
}
</script>

<template>
  <UiDialog
    as="form"
    :title="`Edit ${nodeLabel} with AI`"
    subtitle="Cursor proposes a source change you can preview, undo, or save"
    width="800px"
    close-label="Close AI prompt"
    :busy="running"
    @close="emit('close')"
    @submit="emit('submit')"
  >
    <template #title-icon><Sparkles :size="15" /></template>
    <UiTextarea
      v-model="prompt"
      class="ai-prompt-input"
      autofocus
      :disabled="running"
      placeholder="Describe the change..."
      @keydown.enter="submitShortcut"
    />
    <template #footer>
      <div class="ai-prompt-settings">
        <UiField label="Model" caption>
          <UiSelect
            v-model="model"
            :options="modelOptions"
            :title="modelsState === 'error' ? modelsError : selectedModel?.description ?? 'Cursor model'"
            :disabled="running || modelsState !== 'ready'"
          >
            <option v-if="modelsState === 'loading'" :value="model">Loading models...</option>
            <option v-else-if="modelsState === 'error'" :value="model">Models unavailable</option>
          </UiSelect>
        </UiField>
        <UiField v-for="parameter in selectedModel?.parameters ?? []" :key="parameter.id" :label="parameter.displayName ?? parameter.id" caption>
          <UiSelect
            :model-value="params[parameter.id] ?? ''"
            :options="parameter.values.map((option) => ({ value: option.value, label: option.displayName ?? option.value }))"
            empty-option="Default"
            :disabled="running"
            @update:model-value="params = { ...params, [parameter.id]: $event }"
          />
        </UiField>
      </div>
      <div class="ai-prompt-actions">
        <UiButton :disabled="running" @click="emit('close')">Cancel</UiButton>
        <UiButton variant="primary" type="submit" :disabled="!prompt.trim() || running"><template #icon><Sparkles :size="13" /></template>{{ running ? 'Working...' : 'Apply' }}</UiButton>
      </div>
    </template>
  </UiDialog>
</template>

<style scoped>
textarea.ai-prompt-input { min-height: 240px; padding: 12px 14px; font-size: 15px; line-height: 1.5; }
.ai-prompt-settings { display: flex; flex-wrap: wrap; gap: 10px; min-width: 0; margin-right: auto; }
.ai-prompt-settings :deep(.ui-control) { min-width: 120px; max-width: 240px; }
.ai-prompt-actions { display: flex; gap: 7px; }
</style>

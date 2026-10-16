<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import type { DesignerDocumentSummary } from '@component-canvas/shared'
import { hostKey } from '../services/host'
import { documentNamePattern } from '../lib/landing'
import UiButton from './ui/UiButton.vue'
import UiDialog from './ui/UiDialog.vue'
import UiField from './ui/UiField.vue'
import UiInput from './ui/UiInput.vue'
import UiNotice from './ui/UiNotice.vue'
import UiSelect from './ui/UiSelect.vue'

const props = defineProps<{
  folders: string[]
  defaultFolder: string
  extension: string
  documentLabel: string
}>()
const emit = defineEmits<{
  close: []
  created: [document: DesignerDocumentSummary]
}>()

const host = inject(hostKey)!
const folder = ref(props.defaultFolder)
const name = ref('')
const error = ref('')
const creating = ref(false)

const trimmedName = computed(() => name.value.trim())
const nameError = computed(() => trimmedName.value && !documentNamePattern.test(trimmedName.value)
  ? 'Use letters, numbers, hyphens, or underscores, starting with a letter or number.'
  : '')
const folderOptions = computed(() => props.folders.map((item) => ({ value: item, label: item || '(project root)' })))
const targetPath = computed(() => `${folder.value ? `${folder.value}/` : ''}${trimmedName.value || 'Name'}${props.extension}`)

async function create(): Promise<void> {
  if (!host.createDocument || !trimmedName.value || nameError.value || creating.value) return
  creating.value = true
  error.value = ''
  try {
    emit('created', await host.createDocument({ directory: folder.value, name: trimmedName.value }))
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to create the design'
  } finally {
    creating.value = false
  }
}

</script>

<template>
  <UiDialog
    as="form"
    title="New design"
    :subtitle="`Creates a ${documentLabel} from a starter template`"
    width="460px"
    :busy="creating"
    @close="emit('close')"
    @submit="create"
  >
    <UiField label="Folder">
      <UiSelect v-model="folder" :options="folderOptions" :disabled="creating" />
    </UiField>
    <UiField label="Name">
      <UiInput v-model="name" autofocus :disabled="creating" placeholder="PricingPage" autocomplete="off" spellcheck="false" :invalid="!!nameError" />
    </UiField>
    <code class="new-design-path">{{ targetPath }}</code>
    <UiNotice v-if="nameError || error" tone="danger">{{ nameError || error }}</UiNotice>
    <template #footer>
      <UiButton :disabled="creating" @click="emit('close')">Cancel</UiButton>
      <UiButton variant="primary" type="submit" :disabled="!trimmedName || !!nameError || creating">{{ creating ? 'Creating...' : 'Create design' }}</UiButton>
    </template>
  </UiDialog>
</template>

<style scoped>
.new-design-path { overflow: hidden; border-radius: var(--radius-sm); background: var(--surface); color: var(--text-secondary); padding: 8px 10px; font: 13px var(--mono); text-overflow: ellipsis; white-space: nowrap; }
</style>

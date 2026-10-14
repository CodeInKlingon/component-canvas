<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue'
import type { DesignerDocumentSummary } from '@vue-designer/shared'
import { hostKey } from '../services/host'
import { documentNamePattern } from '../lib/landing'

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
const nameInput = ref<HTMLInputElement | null>(null)

const trimmedName = computed(() => name.value.trim())
const nameError = computed(() => trimmedName.value && !documentNamePattern.test(trimmedName.value)
  ? 'Use letters, numbers, hyphens, or underscores, starting with a letter or number.'
  : '')
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

function close(): void {
  if (!creating.value) emit('close')
}

onMounted(() => nameInput.value?.focus())
</script>

<template>
  <div class="insert-picker-backdrop" @pointerdown.self="close" @keydown.esc="close">
    <form class="new-design" role="dialog" aria-modal="true" aria-labelledby="new-design-title" @submit.prevent="create">
      <header>
        <div><strong id="new-design-title">New design</strong><small>Creates a {{ documentLabel }} from a starter template</small></div>
        <button type="button" aria-label="Close" :disabled="creating" @click="close">×</button>
      </header>
      <div class="new-design-body">
        <label>
          <span>Folder</span>
          <select v-model="folder" :disabled="creating">
            <option v-for="item in folders" :key="item" :value="item">{{ item || '(project root)' }}</option>
          </select>
        </label>
        <label>
          <span>Name</span>
          <input ref="nameInput" v-model="name" :disabled="creating" placeholder="PricingPage" autocomplete="off" spellcheck="false" :aria-invalid="!!nameError">
        </label>
        <code class="new-design-path">{{ targetPath }}</code>
        <p v-if="nameError || error" class="new-design-error" role="alert">{{ nameError || error }}</p>
      </div>
      <footer>
        <button type="button" :disabled="creating" @click="close">Cancel</button>
        <button type="submit" class="primary" :disabled="!trimmedName || !!nameError || creating">{{ creating ? 'Creating...' : 'Create design' }}</button>
      </footer>
    </form>
  </div>
</template>

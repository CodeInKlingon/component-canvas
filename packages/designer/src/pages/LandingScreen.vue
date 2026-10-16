<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref } from 'vue'
import { FileCode2, Folder, Plus, RefreshCw, Search } from '@lucide/vue'
import type { DesignerDocumentSummary, DesignerRuntimeConfig } from '@component-canvas/shared'
import NewDesignDialog from '../components/NewDesignDialog.vue'
import ReadOnlyBadge from '../components/ReadOnlyBadge.vue'
import UiBadge from '../components/ui/UiBadge.vue'
import UiButton from '../components/ui/UiButton.vue'
import UiDisclosureIcon from '../components/ui/UiDisclosureIcon.vue'
import UiEmptyState from '../components/ui/UiEmptyState.vue'
import UiIconTile from '../components/ui/UiIconTile.vue'
import UiInput from '../components/ui/UiInput.vue'
import UiNotice from '../components/ui/UiNotice.vue'
import { hostKey, readOnlyKey } from '../services/host'
import { creatableFolders, formatModified, groupDocuments } from '../lib/landing'
import { routeHash, type DesignerRoute } from '../services/router'

const emit = defineEmits<{ navigate: [route: DesignerRoute] }>()

const host = inject(hostKey)!
const readOnly = inject(readOnlyKey, false)
const config = ref<DesignerRuntimeConfig | null>(null)
const documents = ref<DesignerDocumentSummary[]>([])
const loading = ref(true)
const error = ref('')
const query = ref('')
const collapsedFolders = ref<ReadonlySet<string>>(new Set())
const creating = ref(false)
const now = ref(Date.now())
let clock: number | undefined

const roots = computed(() => config.value?.documentRoots ?? [])
const folders = computed(() => groupDocuments(documents.value, roots.value, query.value))
const canCreate = computed(() => !readOnly && !!host.createDocument && !!config.value)
const newFolders = computed(() => creatableFolders(documents.value, roots.value))

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const [loadedConfig, loadedDocuments] = await Promise.all([host.config(), host.listDocuments()])
    config.value = loadedConfig
    documents.value = loadedDocuments
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to load designs'
  } finally {
    loading.value = false
  }
}

function toggleFolder(path: string): void {
  const next = new Set(collapsedFolders.value)
  if (!next.delete(path)) next.add(path)
  collapsedFolders.value = next
}

function openCreated(document: DesignerDocumentSummary): void {
  creating.value = false
  emit('navigate', { name: 'editor', path: document.path })
}

onMounted(() => {
  void load()
  clock = window.setInterval(() => { now.value = Date.now() }, 60_000)
})
onUnmounted(() => window.clearInterval(clock))
</script>

<template>
  <div class="landing">
    <header class="landing-header">
      <div class="landing-title">
        <h1>Designs</h1>
        <p v-if="config">
          {{ documents.length }} {{ config.framework.documentLabel }} {{ documents.length === 1 ? 'file' : 'files' }}
          matching <code v-for="pattern in config.documentPatterns" :key="pattern">{{ pattern }}</code>
        </p>
      </div>
      <div class="landing-actions">
        <ReadOnlyBadge v-if="readOnly" />
        <UiInput v-model="query" class="landing-search" type="search" placeholder="Search designs" aria-label="Search designs">
          <template #leading><Search :size="15" /></template>
        </UiInput>
        <UiButton size="lg" icon-only label="Refresh designs" @click="load"><RefreshCw :size="15" /></UiButton>
        <UiButton v-if="canCreate" variant="primary" size="lg" @click="creating = true"><template #icon><Plus :size="15" /></template>New design</UiButton>
      </div>
    </header>

    <main class="landing-body">
      <UiEmptyState v-if="loading && !documents.length" variant="boxed">Scanning project...</UiEmptyState>
      <UiNotice v-else-if="error" class="landing-error" tone="danger" title="Unable to load designs">
        {{ error }}
        <template #actions><UiButton @click="load"><template #icon><RefreshCw :size="14" /></template>Try again</UiButton></template>
      </UiNotice>
      <UiEmptyState v-else-if="!documents.length" variant="boxed" title="No designs yet">
        No files match <code v-for="pattern in config?.documentPatterns" :key="pattern">{{ pattern }}</code>.
        Change the <code>documents</code> option of the designer plugin in your Vite config<template v-if="canCreate">, or create the first design</template>.
        <template v-if="canCreate" #actions>
          <UiButton variant="primary" size="lg" @click="creating = true"><template #icon><Plus :size="15" /></template>New design</UiButton>
        </template>
      </UiEmptyState>
      <UiEmptyState v-else-if="!folders.length" variant="boxed">No designs match “{{ query }}”.</UiEmptyState>
      <section v-for="folder in folders" v-else :key="folder.path" class="landing-folder">
        <button class="landing-folder-header" :aria-expanded="!collapsedFolders.has(folder.path)" @click="toggleFolder(folder.path)">
          <UiDisclosureIcon :expanded="!collapsedFolders.has(folder.path)" class="landing-chevron" />
          <Folder :size="15" />
          <span class="landing-folder-path">
            <span v-if="folder.root" class="landing-folder-root">{{ folder.root }}{{ folder.relative ? '/' : '' }}</span>{{ folder.relative || (folder.root ? '' : '(project root)') }}
          </span>
          <UiBadge class="landing-count">{{ folder.documents.length }}</UiBadge>
        </button>
        <div v-if="!collapsedFolders.has(folder.path)" class="landing-grid">
          <a v-for="document in folder.documents" :key="document.path" class="landing-card" :href="routeHash({ name: 'editor', path: document.path })">
            <UiIconTile size="lg" tone="soft"><FileCode2 :size="18" /></UiIconTile>
            <span class="landing-card-text">
              <strong>{{ document.name }}</strong>
              <code>{{ document.path }}</code>
              <small v-if="document.modified">Edited {{ formatModified(document.modified, now) }}</small>
            </span>
          </a>
        </div>
      </section>
    </main>

    <NewDesignDialog
      v-if="creating && config"
      :folders="newFolders"
      :default-folder="roots[0] ?? newFolders[0] ?? ''"
      :extension="config.framework.fileExtension"
      :document-label="config.framework.documentLabel"
      @close="creating = false"
      @created="openCreated"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref } from 'vue'
import { ChevronRight, Eye, FileCode2, Folder, Plus, RefreshCw, Search } from '@lucide/vue'
import type { DesignerDocumentSummary, DesignerRuntimeConfig } from '@vue-designer/shared'
import NewDesignDialog from './NewDesignDialog.vue'
import { hostKey, readOnlyKey } from './host'
import { creatableFolders, formatModified, groupDocuments } from './landing'
import { routeHash, type DesignerRoute } from './router'

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
        <span v-if="readOnly" class="read-only-badge" title="This build is read-only. Run the dev server to edit designs."><Eye :size="14" />Read-only</span>
        <label class="landing-search">
          <Search :size="15" />
          <input v-model="query" type="search" placeholder="Search designs" aria-label="Search designs">
        </label>
        <button class="icon-button" title="Refresh" aria-label="Refresh designs" @click="load"><RefreshCw :size="15" /></button>
        <button v-if="canCreate" class="primary-button" @click="creating = true"><Plus :size="15" />New design</button>
      </div>
    </header>

    <main class="landing-body">
      <div v-if="loading && !documents.length" class="landing-empty">Scanning project...</div>
      <div v-else-if="error" class="landing-empty error" role="alert">
        <strong>Unable to load designs</strong>
        <span>{{ error }}</span>
        <button class="icon-button wide" @click="load"><RefreshCw :size="14" />Try again</button>
      </div>
      <div v-else-if="!documents.length" class="landing-empty">
        <strong>No designs yet</strong>
        <span>
          No files match <code v-for="pattern in config?.documentPatterns" :key="pattern">{{ pattern }}</code>.
          Change the <code>documents</code> option of the designer plugin in your Vite config<template v-if="canCreate">, or create the first design</template>.
        </span>
        <button v-if="canCreate" class="primary-button" @click="creating = true"><Plus :size="15" />New design</button>
      </div>
      <div v-else-if="!folders.length" class="landing-empty">No designs match “{{ query }}”.</div>
      <section v-for="folder in folders" v-else :key="folder.path" class="landing-folder" :class="{ collapsed: collapsedFolders.has(folder.path) }">
        <button class="landing-folder-header" :aria-expanded="!collapsedFolders.has(folder.path)" @click="toggleFolder(folder.path)">
          <ChevronRight :size="14" class="landing-chevron" />
          <Folder :size="15" />
          <span class="landing-folder-path">
            <span v-if="folder.root" class="landing-folder-root">{{ folder.root }}{{ folder.relative ? '/' : '' }}</span>{{ folder.relative || (folder.root ? '' : '(project root)') }}
          </span>
          <span class="landing-count">{{ folder.documents.length }}</span>
        </button>
        <div v-if="!collapsedFolders.has(folder.path)" class="landing-grid">
          <a v-for="document in folder.documents" :key="document.path" class="landing-card" :href="routeHash({ name: 'editor', path: document.path })">
            <span class="landing-card-icon"><FileCode2 :size="18" /></span>
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

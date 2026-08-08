<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type {
  DesignerApiError,
  DesignerDocument,
  DesignerDocumentSummary,
  SaveDocumentResponse,
  DesignerNode,
} from '@vue-designer/shared'
import { isPreviewToEditorMessage } from '@vue-designer/shared'
import TreeNode from './TreeNode.vue'

type SaveState = 'clean' | 'dirty' | 'saving' | 'conflict'

const documents = ref<DesignerDocumentSummary[]>([])
const activeDocument = ref<DesignerDocument | null>(null)
const source = ref('')
const error = ref('')
const loading = ref(true)
const saveState = ref<SaveState>('clean')
const previewVersion = ref(0)
const viewportWidth = ref<'100%' | '768px' | '390px'>('100%')
const previewFrame = ref<HTMLIFrameElement | null>(null)
const selectedNodeId = ref<string | null>(null)

const previewUrl = computed(() => {
  if (!activeDocument.value) return ''
  const params = new URLSearchParams({
    path: activeDocument.value.path,
    version: String(previewVersion.value),
  })
  return `/__designer/preview?${params}`
})

const stateLabel = computed(() => ({
  clean: 'Saved',
  dirty: 'Unsaved changes',
  saving: 'Saving...',
  conflict: 'External change',
})[saveState.value])

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const body = await response.json() as T | DesignerApiError
  if (!response.ok) throw Object.assign(new Error((body as DesignerApiError).error), { status: response.status })
  return body as T
}

async function loadDocuments(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    documents.value = await api('/__designer/api/documents')
    if (documents.value[0]) await openDocument(documents.value[0])
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to load documents'
  } finally {
    loading.value = false
  }
}

async function openDocument(document: DesignerDocumentSummary): Promise<void> {
  if (saveState.value === 'dirty' && !window.confirm('Discard unsaved changes?')) return
  error.value = ''
  try {
    const loaded = await api<DesignerDocument>(`/__designer/api/document?path=${encodeURIComponent(document.path)}`)
    activeDocument.value = loaded
    source.value = loaded.source
    saveState.value = 'clean'
    selectedNodeId.value = null
    previewVersion.value += 1
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to open document'
  }
}

function updateSource(event: Event): void {
  source.value = (event.target as HTMLTextAreaElement).value
  saveState.value = source.value === activeDocument.value?.source ? 'clean' : 'dirty'
}

async function save(): Promise<void> {
  const document = activeDocument.value
  if (!document || saveState.value === 'saving' || saveState.value === 'clean') return

  saveState.value = 'saving'
  error.value = ''
  try {
    const result = await api<SaveDocumentResponse>(
      `/__designer/api/document?path=${encodeURIComponent(document.path)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: source.value, revision: document.revision }),
      },
    )
    activeDocument.value = { ...document, source: source.value, revision: result.revision }
    saveState.value = 'clean'
    previewVersion.value += 1
  } catch (cause) {
    const conflict = cause instanceof Error && 'status' in cause && cause.status === 409
    saveState.value = conflict ? 'conflict' : 'dirty'
    error.value = cause instanceof Error ? cause.message : 'Unable to save document'
  }
}

async function reload(): Promise<void> {
  if (activeDocument.value) {
    saveState.value = 'clean'
    await openDocument(activeDocument.value)
  }
}

function selectNode(node: DesignerNode): void {
  selectedNodeId.value = node.id
  if (node.kind !== 'text') {
    previewFrame.value?.contentWindow?.postMessage({
      channel: 'vue-designer',
      type: 'select',
      nodeId: node.id,
    }, '*')
  }
}

function handlePreviewMessage(event: MessageEvent): void {
  if (event.source !== previewFrame.value?.contentWindow || !isPreviewToEditorMessage(event.data)) return
  selectedNodeId.value = event.data.nodeId
}

function handleShortcut(event: KeyboardEvent): void {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    void save()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleShortcut)
  window.addEventListener('message', handlePreviewMessage)
  void loadDocuments()
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleShortcut)
  window.removeEventListener('message', handlePreviewMessage)
})
</script>

<template>
  <div class="studio">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark">VD</span>
        <div><strong>Vue Designer</strong><small>Live component studio</small></div>
      </div>
      <div class="document-title">
        <span class="status-dot" :class="saveState" />
        <span>{{ activeDocument?.path ?? 'No document selected' }}</span>
      </div>
      <div class="actions">
        <div class="viewport-switcher" aria-label="Preview viewport">
          <button :class="{ active: viewportWidth === '100%' }" @click="viewportWidth = '100%'">Desktop</button>
          <button :class="{ active: viewportWidth === '768px' }" @click="viewportWidth = '768px'">Tablet</button>
          <button :class="{ active: viewportWidth === '390px' }" @click="viewportWidth = '390px'">Mobile</button>
        </div>
        <span class="save-state">{{ stateLabel }}</span>
        <button class="save-button" :disabled="saveState === 'clean' || saveState === 'saving'" @click="save">Save</button>
      </div>
    </header>

    <main class="workspace">
      <aside class="sidebar">
        <div class="panel-heading"><span>Documents</span><button title="Refresh documents" @click="loadDocuments">Refresh</button></div>
        <div v-if="loading" class="empty-state">Scanning project...</div>
        <button
          v-for="document in documents"
          :key="document.path"
          class="document-row"
          :class="{ selected: document.path === activeDocument?.path }"
          @click="openDocument(document)"
        >
          <span class="vue-icon">V</span>
          <span><strong>{{ document.name }}</strong><small>{{ document.path }}</small></span>
        </button>
        <div v-if="!loading && documents.length === 0" class="empty-state">No Vue documents match the configured pattern.</div>
        <div v-if="activeDocument" class="layers-heading">Layers</div>
        <ul v-if="activeDocument" class="tree-list">
          <TreeNode
            v-for="node in activeDocument.tree"
            :key="node.id"
            :node="node"
            :selected-id="selectedNodeId"
            @select="selectNode"
          />
        </ul>
        <div v-if="activeDocument?.diagnostics.length" class="tree-diagnostic">
          {{ activeDocument.diagnostics[0]?.message }}
        </div>
      </aside>

      <section class="canvas-panel">
        <div class="canvas-label">Canvas <span>{{ viewportWidth }}</span></div>
        <div class="canvas-scroll">
          <div class="preview-frame" :style="{ width: viewportWidth }">
            <iframe
              v-if="previewUrl"
              ref="previewFrame"
              :key="previewUrl"
              :src="previewUrl"
              sandbox="allow-scripts"
              title="Vue document preview"
            />
            <div v-else class="preview-empty">Select a document to begin.</div>
          </div>
        </div>
      </section>

      <aside class="source-panel">
        <div class="panel-heading"><span>Source</span><span class="language">Vue SFC</span></div>
        <textarea
          :value="source"
          :disabled="!activeDocument"
          spellcheck="false"
          aria-label="Vue source"
          @input="updateSource"
        />
      </aside>
    </main>

    <div v-if="error" class="diagnostic">
      <span>{{ error }}</span>
      <button v-if="saveState === 'conflict'" @click="reload">Reload from disk</button>
      <button @click="error = ''">Dismiss</button>
    </div>
  </div>
</template>

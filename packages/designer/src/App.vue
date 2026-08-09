<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type {
  DesignerApiError,
  DesignerDocument,
  DesignerDocumentSummary,
  SaveDocumentResponse,
  DesignerNode,
  DesignerSourceOperation,
  DesignerComponentMetadata,
  PreviewCandidateResponse,
} from '@vue-designer/shared'
import { applySourceOperation, isPreviewToEditorMessage, parseDesignerDocument } from '@vue-designer/shared'
import TreeNode from './TreeNode.vue'

type SaveState = 'clean' | 'dirty' | 'saving' | 'conflict'

const documents = ref<DesignerDocumentSummary[]>([])
const components = ref<DesignerComponentMetadata[]>([])
const activeDocument = ref<DesignerDocument | null>(null)
const source = ref('')
const error = ref('')
const loading = ref(true)
const saveState = ref<SaveState>('clean')
const previewVersion = ref(0)
const viewportWidth = ref<'100%' | '768px' | '390px'>('100%')
const previewFrame = ref<HTMLIFrameElement | null>(null)
const selectedNodeId = ref<string | null>(null)
const candidateId = ref<string | null>(null)
const inspectorView = ref<'content' | 'source'>('content')
const draggedComponent = ref<DesignerComponentMetadata | null>(null)
const draggedNode = ref<DesignerNode | null>(null)
let sourcePreviewTimer: number | undefined
let candidateRequest = 0

function findNode(nodes: DesignerNode[], id: string | null): DesignerNode | null {
  if (!id) return null
  for (const node of nodes) {
    if (node.id === id) return node
    const child = findNode(node.children, id)
    if (child) return child
  }
  return null
}

const selectedNode = computed(() => findNode(activeDocument.value?.tree ?? [], selectedNodeId.value))
const dragKind = computed<'component' | 'node' | null>(() => draggedComponent.value ? 'component' : draggedNode.value ? 'node' : null)

const previewUrl = computed(() => {
  if (!activeDocument.value) return ''
  const params = new URLSearchParams({
    path: activeDocument.value.path,
    version: String(previewVersion.value),
  })
  if (candidateId.value) params.set('candidate', candidateId.value)
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
    const [loadedDocuments, loadedComponents] = await Promise.all([
      api<DesignerDocumentSummary[]>('/__designer/api/documents'),
      api<DesignerComponentMetadata[]>('/__designer/api/components'),
    ])
    documents.value = loadedDocuments
    components.value = loadedComponents
    if (documents.value[0]) await openDocument(documents.value[0])
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to load documents'
  } finally {
    loading.value = false
  }
}

function relativeImport(documentPath: string, componentPath: string): string {
  const from = documentPath.split('/').slice(0, -1)
  const to = componentPath.split('/')
  while (from[0] && from[0] === to[0]) {
    from.shift()
    to.shift()
  }
  const relative = `${from.map(() => '..').join('/')}${from.length && to.length ? '/' : ''}${to.join('/')}`
  return relative.startsWith('.') ? relative : `./${relative}`
}

function insertComponent(component: DesignerComponentMetadata, target = selectedNode.value): void {
  const document = activeDocument.value
  const parent = target
  if (!document || !parent || parent.kind === 'text' || !parent.editable) return
  void applyOperation({
    type: 'insert-component',
    parentId: parent.id,
    name: component.name,
    importSource: relativeImport(document.path, component.source),
    defaultContent: component.defaultContent,
  })
}

function startNodeDrag(node: DesignerNode): void {
  draggedComponent.value = null
  draggedNode.value = node
}

function endTreeDrag(): void {
  draggedComponent.value = null
  draggedNode.value = null
}

function handleTreeDrop(target: DesignerNode, position: 'before' | 'inside' | 'after'): void {
  if (draggedComponent.value) {
    insertComponent(draggedComponent.value, target)
  } else if (draggedNode.value) {
    const nodeId = draggedNode.value.id
    selectedNodeId.value = null
    void applyOperation({ type: 'move-node', nodeId, targetId: target.id, position })
  }
  endTreeDrag()
}

function duplicateSelectedNode(): void {
  const node = selectedNode.value
  if (node?.editable) void applyOperation({ type: 'duplicate-node', nodeId: node.id })
}

function removeSelectedNode(): void {
  const node = selectedNode.value
  if (!node?.editable || !window.confirm(`Delete ${node.label}?`)) return
  selectedNodeId.value = null
  void applyOperation({ type: 'remove-node', nodeId: node.id })
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
    candidateId.value = null
    previewVersion.value += 1
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to open document'
  }
}

function updateSource(event: Event): void {
  source.value = (event.target as HTMLTextAreaElement).value
  saveState.value = source.value === activeDocument.value?.source ? 'clean' : 'dirty'
  window.clearTimeout(sourcePreviewTimer)
  sourcePreviewTimer = window.setTimeout(() => void createCandidate(source.value), 350)
}

async function createCandidate(candidateSource: string): Promise<void> {
  const document = activeDocument.value
  if (!document) return
  if (candidateSource === document.source) {
    const parsed = parseDesignerDocument(candidateSource)
    candidateId.value = null
    activeDocument.value = { ...document, tree: parsed.tree, diagnostics: parsed.diagnostics }
    saveState.value = 'clean'
    error.value = ''
    return
  }

  const request = ++candidateRequest
  try {
    const result = await api<PreviewCandidateResponse>('/__designer/api/candidate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: document.path, source: candidateSource }),
    })
    if (request !== candidateRequest || source.value !== candidateSource) return
    candidateId.value = result.candidateId
    activeDocument.value = { ...document, tree: result.tree, diagnostics: result.diagnostics }
    error.value = ''
  } catch (cause) {
    if (request !== candidateRequest) return
    error.value = cause instanceof Error ? cause.message : 'Unable to preview source'
  }
}

async function applyOperation(operation: DesignerSourceOperation): Promise<void> {
  try {
    const candidateSource = applySourceOperation(source.value, operation)
    source.value = candidateSource
    saveState.value = candidateSource === activeDocument.value?.source ? 'clean' : 'dirty'
    await createCandidate(candidateSource)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to edit selection'
  }
}

function updateSelectedText(event: Event): void {
  const node = selectedNode.value
  if (!node) return
  void applyOperation({
    type: 'set-text',
    nodeId: node.id,
    value: (event.target as HTMLTextAreaElement).value,
  })
}

function updateSelectedAttribute(name: string, event: Event): void {
  const node = selectedNode.value
  if (!node) return
  void applyOperation({
    type: 'set-attribute',
    nodeId: node.id,
    name,
    value: (event.target as HTMLInputElement).value,
  })
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
    candidateId.value = null
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

function handlePreviewLoad(): void {
  const node = selectedNode.value
  if (node && node.kind !== 'text') selectNode(node)
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
  window.clearTimeout(sourcePreviewTimer)
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
        <div class="layers-heading">Components</div>
        <div class="component-palette">
          <button
            v-for="component in components"
            :key="component.name"
            :disabled="!selectedNode || selectedNode.kind === 'text' || !selectedNode.editable"
            :title="selectedNode ? `Insert into ${selectedNode.label}` : 'Select a container first'"
            draggable="true"
            @dragstart="draggedNode = null; draggedComponent = component"
            @dragend="endTreeDrag"
            @click="insertComponent(component)"
          >
            <span class="component-glyph">+</span>
            <span><strong>{{ component.label }}</strong><small>{{ component.category }}</small></span>
          </button>
        </div>
        <div v-if="activeDocument" class="layers-heading">Layers</div>
        <ul v-if="activeDocument" class="tree-list">
          <TreeNode
            v-for="node in activeDocument.tree"
            :key="node.id"
            :node="node"
            :selected-id="selectedNodeId"
            :drag-kind="dragKind"
            @select="selectNode"
            @drag-node="startNodeDrag"
            @drag-end="endTreeDrag"
            @drop-node="handleTreeDrop"
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
              @load="handlePreviewLoad"
            />
            <div v-else class="preview-empty">Select a document to begin.</div>
          </div>
        </div>
      </section>

      <aside class="inspector-panel">
        <div class="inspector-tabs">
          <button :class="{ active: inspectorView === 'content' }" @click="inspectorView = 'content'">Content</button>
          <button :class="{ active: inspectorView === 'source' }" @click="inspectorView = 'source'">Source</button>
        </div>

        <div v-if="inspectorView === 'content'" class="inspector-content">
          <div v-if="!selectedNode" class="inspector-empty">
            <strong>Select a layer</strong>
            <span>Text and attributes for the selected element will appear here.</span>
          </div>
          <template v-else>
            <div class="selection-summary">
              <span class="tree-kind">{{ selectedNode.kind === 'component' ? 'C' : selectedNode.kind === 'text' ? 'T' : 'E' }}</span>
              <div><strong>{{ selectedNode.label }}</strong><small>{{ selectedNode.kind }}</small></div>
              <div class="selection-actions">
                <button :disabled="!selectedNode.editable" title="Duplicate layer" @click="duplicateSelectedNode">Duplicate</button>
                <button :disabled="!selectedNode.editable" title="Delete layer" @click="removeSelectedNode">Delete</button>
              </div>
            </div>
            <section v-if="selectedNode.kind === 'text'" class="inspector-section">
              <label for="selected-text">Text content</label>
              <textarea id="selected-text" :value="selectedNode.value" @input="updateSelectedText" />
            </section>
            <section v-if="selectedNode.attributes.length" class="inspector-section">
              <div class="section-title">Attributes</div>
              <label v-for="attribute in selectedNode.attributes" :key="attribute.name">
                <span>{{ attribute.name }}<small v-if="!attribute.editable">Expression</small></span>
                <input
                  :value="attribute.value"
                  :disabled="!attribute.editable"
                  @change="updateSelectedAttribute(attribute.name, $event)"
                />
              </label>
            </section>
            <div v-if="selectedNode.kind !== 'text' && !selectedNode.attributes.length" class="inspector-empty compact">No attributes on this layer.</div>
            <div v-if="!selectedNode.editable" class="locked-notice">{{ selectedNode.lockedReason }}</div>
          </template>
        </div>

        <textarea
          v-else
          class="source-editor"
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

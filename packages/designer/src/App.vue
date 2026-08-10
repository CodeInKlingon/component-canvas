<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  Braces,
  ChevronDown,
  Code2,
  Component,
  FileCode2,
  Layers3,
  Monitor,
  PanelBottomClose,
  PanelBottomOpen,
  Plus,
  Redo2,
  RefreshCw,
  Save,
  Smartphone,
  Tablet,
  Trash2,
  Undo2,
} from '@lucide/vue'
import type {
  DesignerApiError,
  DesignerDocument,
  DesignerDocumentSummary,
  SaveDocumentResponse,
  DesignerNode,
  DesignerSourceOperation,
  DesignerComponentMetadata,
  DesignerPropMetadata,
  DesignerStyleRule,
  DesignerStyleCandidateResponse,
  DesignerDocumentChangedEvent,
  PreviewCandidateResponse,
} from '@vue-designer/shared'
import { applySourceOperation, isPreviewToEditorMessage, isVoidElement, parseDesignerDocument } from '@vue-designer/shared'
import TreeNode from './TreeNode.vue'
import SourceEditor from './SourceEditor.vue'
import { SourceHistory } from './history'
import { findNode, findNodeAtOffset, findNodeAtPath, findNodePath, findRenderedSelection } from './selection'
import { nativeElements, type NativeElementMetadata } from './native-elements'

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
const previewOrigin = ref('')
const previewSession = ref(crypto.randomUUID())
const previewDiagnostic = ref<{ level: 'error' | 'warning' | 'info'; message: string; stack?: string } | null>(null)
const previewScroll = ref({ x: 0, y: 0 })
const sourceEditor = ref<InstanceType<typeof SourceEditor> | null>(null)
const selectedNodeId = ref<string | null>(null)
const candidateId = ref<string | null>(null)
const inspectorView = ref<'content' | 'style'>('content')
const sidebarView = ref<'layers' | 'components'>('layers')
const sourceOpen = ref(true)
const activeStyleSelector = ref('')
const styleRules = ref<DesignerStyleRule[]>([])
const computedStyles = ref<Record<string, string>>({})
const draggedComponent = ref<DesignerComponentMetadata | null>(null)
const draggedNative = ref<NativeElementMetadata | null>(null)
const draggedNode = ref<DesignerNode | null>(null)
const externalRevision = ref<string | null>(null)
const historyVersion = ref(0)
const history = new SourceHistory()
let sourcePreviewTimer: number | undefined
let candidateRequest = 0
let apiCapability = ''

const selectedNode = computed(() => findNode(activeDocument.value?.tree ?? [], selectedNodeId.value))
const selectedComponent = computed(() => selectedNode.value?.kind === 'component'
  ? components.value.find((component) => component.name === selectedNode.value?.label) ?? null
  : null)
const selectedNative = computed(() => selectedNode.value?.kind === 'element'
  ? nativeElements.find((element) => element.tag === selectedNode.value?.label) ?? null
  : null)
const selectedMetadataProps = computed(() => selectedComponent.value?.props ?? selectedNative.value?.props ?? [])
const activeStyleRule = computed<DesignerStyleRule | null>(() =>
  styleRules.value.find((rule) => rule.selector === activeStyleSelector.value)
    ?? styleRules.value[0]
    ?? null,
)
const styleControls = [
  { group: 'Layout', properties: ['display', 'width', 'height', 'gap'] },
  { group: 'Spacing', properties: ['padding', 'margin'] },
  { group: 'Typography', properties: ['font-size', 'font-weight', 'text-align', 'color'] },
  { group: 'Surface', properties: ['background-color', 'border', 'border-radius'] },
]
const dragKind = computed<'component' | 'node' | null>(() => draggedComponent.value || draggedNative.value ? 'component' : draggedNode.value ? 'node' : null)
const canUndo = computed(() => (historyVersion.value, history.canUndo))
const canRedo = computed(() => (historyVersion.value, history.canRedo))

function recordSource(candidateSource: string): void {
  history.push(candidateSource)
  historyVersion.value += 1
}

const previewUrl = computed(() => {
  if (!activeDocument.value || !previewOrigin.value) return ''
  const params = new URLSearchParams({
    path: activeDocument.value.path,
    version: String(previewVersion.value),
    session: previewSession.value,
  })
  if (candidateId.value) params.set('candidate', candidateId.value)
  return `${previewOrigin.value}/__designer/preview?${params}`
})

const stateLabel = computed(() => ({
  clean: 'Saved',
  dirty: 'Unsaved changes',
  saving: 'Saving...',
  conflict: 'External change',
})[saveState.value])

async function api<T>(url: string, init?: RequestInit, retry = true): Promise<T> {
  if (!apiCapability) {
    const session = await fetch('/__designer/api/session', { method: 'POST' })
    const body = await session.json() as { token: string }
    if (!session.ok || typeof body.token !== 'string') throw new Error('Unable to establish designer session')
    apiCapability = body.token
  }
  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${apiCapability}`)
  let response = await fetch(url, { ...init, headers })
  if (response.status === 401 && retry) {
    apiCapability = ''
    return api<T>(url, init, false)
  }
  const body = await response.json() as T | DesignerApiError
  if (!response.ok) throw Object.assign(new Error((body as DesignerApiError).error), { status: response.status })
  return body as T
}

async function loadDocuments(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const [loadedDocuments, loadedComponents, config] = await Promise.all([
      api<DesignerDocumentSummary[]>('/__designer/api/documents'),
      api<DesignerComponentMetadata[]>('/__designer/api/components'),
      api<{ previewOrigin: string }>('/__designer/api/config'),
    ])
    documents.value = loadedDocuments
    components.value = loadedComponents
    previewOrigin.value = config.previewOrigin
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

function canContainChildren(node: DesignerNode | null): boolean {
  return !!node && node.kind !== 'text' && !(node.kind === 'element' && isVoidElement(node.label)) && node.editable
}

function insertNative(element: NativeElementMetadata, target = selectedNode.value): void {
  if (!canContainChildren(target)) return
  void applyOperation({
    type: 'insert-native',
    parentId: target!.id,
    tag: element.tag,
    contentModel: element.contentModel,
    defaultContent: element.defaultContent,
    defaultChildren: element.defaultChildren,
    attributes: element.attributes,
  })
}

function startNodeDrag(node: DesignerNode): void {
  draggedComponent.value = null
  draggedNative.value = null
  draggedNode.value = node
}

function startComponentDrag(event: DragEvent, component: DesignerComponentMetadata): void {
  draggedNode.value = null
  draggedNative.value = null
  draggedComponent.value = component
  event.dataTransfer?.setData('application/x-vue-designer-component', component.name)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
}

function startNativeDrag(event: DragEvent, element: NativeElementMetadata): void {
  draggedNode.value = null
  draggedComponent.value = null
  draggedNative.value = element
  event.dataTransfer?.setData('application/x-vue-designer-native', element.tag)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
}

function endTreeDrag(): void {
  draggedComponent.value = null
  draggedNative.value = null
  draggedNode.value = null
}

function handleTreeDrop(target: DesignerNode, position: 'before' | 'inside' | 'after'): void {
  if (draggedComponent.value) {
    insertComponent(draggedComponent.value, target)
  } else if (draggedNative.value) {
    insertNative(draggedNative.value, target)
  } else if (draggedNode.value) {
    const nodeId = draggedNode.value.id
    selectedNodeId.value = null
    styleRules.value = []
    computedStyles.value = {}
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
  if ((saveState.value === 'dirty' || saveState.value === 'conflict') && !window.confirm('Discard unsaved changes?')) return
  error.value = ''
  try {
    const loaded = await api<DesignerDocument>(`/__designer/api/document?path=${encodeURIComponent(document.path)}`)
    activeDocument.value = loaded
    source.value = loaded.source
    history.reset(loaded.source)
    historyVersion.value += 1
    saveState.value = 'clean'
    externalRevision.value = null
    selectedNodeId.value = null
    candidateId.value = null
    previewSession.value = crypto.randomUUID()
    previewDiagnostic.value = null
    previewScroll.value = { x: 0, y: 0 }
    previewVersion.value += 1
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to open document'
  }
}

function updateSource(value: Event | string): void {
  source.value = typeof value === 'string' ? value : (value.target as HTMLTextAreaElement).value
  saveState.value = source.value === activeDocument.value?.source ? 'clean' : 'dirty'
  window.clearTimeout(sourcePreviewTimer)
  sourcePreviewTimer = window.setTimeout(() => void createCandidate(source.value), 350)
}

function commitSourceEdit(): void {
  recordSource(source.value)
}

async function createCandidate(candidateSource: string): Promise<void> {
  const document = activeDocument.value
  if (!document) return
  previewDiagnostic.value = null
  const selectedPath = findNodePath(document.tree, selectedNodeId.value)
  if (candidateSource === document.source) {
    const parsed = parseDesignerDocument(candidateSource)
    candidateId.value = null
    activeDocument.value = { ...document, tree: parsed.tree, diagnostics: parsed.diagnostics }
    selectedNodeId.value = findNode(parsed.tree, selectedNodeId.value)?.id
      ?? findNodeAtPath(parsed.tree, selectedPath)?.id
      ?? null
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
    selectedNodeId.value = findNode(result.tree, selectedNodeId.value)?.id
      ?? findNodeAtPath(result.tree, selectedPath)?.id
      ?? null
    error.value = ''
  } catch (cause) {
    if (request !== candidateRequest) return
    error.value = cause instanceof Error ? cause.message : 'Unable to preview source'
  }
}

async function applyOperation(operation: DesignerSourceOperation): Promise<void> {
  try {
    const candidateSource = applySourceOperation(source.value, operation)
    recordSource(candidateSource)
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

function selectedAttribute(name: string) {
  return selectedNode.value?.attributes.find((attribute) => attribute.name === name)
}

function propValue(prop: DesignerPropMetadata): string {
  const value = selectedAttribute(prop.name)?.value ?? prop.default ?? ''
  return value.replace(/^(['"])(.*)\1$/, '$2')
}

function propChecked(prop: DesignerPropMetadata): boolean {
  return propValue(prop) === 'true'
}

function propIsExpression(prop: DesignerPropMetadata): boolean {
  return selectedAttribute(prop.name)?.kind === 'expression'
}

function updateComponentProp(prop: DesignerPropMetadata, event: Event): void {
  const node = selectedNode.value
  if (!node) return
  const target = event.target as HTMLInputElement | HTMLSelectElement
  let value: string | number | boolean | null = target.value
  if (prop.control === 'checkbox') value = (target as HTMLInputElement).checked
  if (prop.control === 'number') value = target.value === '' ? null : Number(target.value)
  if (prop.control === 'select' && target.value === '' && !prop.required) value = null
  void applyOperation({
    type: 'set-attribute',
    nodeId: node.id,
    name: prop.name,
    value,
    binding: prop.control === 'checkbox' || prop.control === 'number',
  })
}

function clearComponentProp(prop: DesignerPropMetadata): void {
  const node = selectedNode.value
  if (node) void applyOperation({ type: 'set-attribute', nodeId: node.id, name: prop.name, value: null })
}

function isMetadataProp(name: string): boolean {
  return selectedMetadataProps.value.some((prop) => prop.name === name)
}

function styleSelector(): string {
  if (activeStyleRule.value) return activeStyleRule.value.selector
  const classValue = selectedNode.value?.attributes.find((attribute) => attribute.name === 'class' && attribute.kind === 'static')?.value
  const className = classValue?.split(/\s+/).find(Boolean) ?? `designer-${selectedNode.value?.id ?? 'node'}`
  return `.${className}`
}

function styleValue(property: string): string {
  return activeStyleRule.value?.declarations.find((declaration) => declaration.property === property)?.value ?? ''
}

function updateStyle(property: string, event: Event): void {
  const node = selectedNode.value
  if (!node || node.kind === 'text') return
  const selector = styleSelector()
  activeStyleSelector.value = selector
  const value = (event.target as HTMLInputElement | HTMLSelectElement).value
  const document = activeDocument.value
  if (!document) return
  previewDiagnostic.value = null
  const selectedPath = findNodePath(document.tree, selectedNodeId.value)
  void api<DesignerStyleCandidateResponse>('/__designer/api/style-candidate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: document.path,
      source: source.value,
      operation: { nodeId: node.id, selector, property, value: value || null },
    }),
  }).then((result) => {
    recordSource(result.source)
    source.value = result.source
    candidateId.value = result.candidateId
    styleRules.value = result.rules
    activeDocument.value = { ...document, tree: result.tree, diagnostics: result.diagnostics }
    selectedNodeId.value = findNode(result.tree, selectedNodeId.value)?.id
      ?? findNodeAtPath(result.tree, selectedPath)?.id
      ?? null
    saveState.value = result.source === document.source ? 'clean' : 'dirty'
    previewFrame.value?.contentWindow?.postMessage({
      channel: 'vue-designer',
      session: previewSession.value,
      type: 'apply-style',
      nodeId: node.id,
      property,
      value: value || null,
    }, '*')
  }).catch((cause) => {
    error.value = cause instanceof Error ? cause.message : 'Unable to update style'
  })
}

async function loadStyles(): Promise<void> {
  const document = activeDocument.value
  const node = selectedNode.value
  if (!document || !node || node.kind === 'text') {
    styleRules.value = []
    return
  }
  try {
    styleRules.value = await api<DesignerStyleRule[]>('/__designer/api/styles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: document.path, source: source.value, nodeId: node.id }),
    })
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to load styles'
  }
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
    externalRevision.value = null
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

async function keepLocalChanges(): Promise<void> {
  const document = activeDocument.value
  if (!document || !externalRevision.value) return
  activeDocument.value = { ...document, revision: externalRevision.value }
  externalRevision.value = null
  saveState.value = 'dirty'
  error.value = ''
  await save()
}

async function restoreHistory(nextSource: string | undefined): Promise<void> {
  if (nextSource === undefined) return
  source.value = nextSource
  historyVersion.value += 1
  saveState.value = nextSource === activeDocument.value?.source ? 'clean' : 'dirty'
  await createCandidate(nextSource)
}

function undo(): void {
  if (source.value !== history.current) recordSource(source.value)
  void restoreHistory(history.undo())
}

function redo(): void {
  void restoreHistory(history.redo())
}

function selectNode(node: DesignerNode, revealInSource = true): void {
  selectedNodeId.value = node.id
  activeStyleSelector.value = ''
  computedStyles.value = {}
  void loadStyles()
  const canvasNode = findRenderedSelection(activeDocument.value?.tree ?? [], node.id)
  previewFrame.value?.contentWindow?.postMessage({
    channel: 'vue-designer',
    session: previewSession.value,
    type: 'select',
    nodeId: canvasNode?.id ?? null,
  }, '*')
  if (revealInSource && sourceOpen.value) {
    requestAnimationFrame(() => {
      sourceEditor.value?.focus()
      sourceEditor.value?.setSelectionRange(node.range.start, node.range.end)
    })
  }
}

function syncSelectionFromSource(offset: number): void {
  const match = findNodeAtOffset(activeDocument.value?.tree ?? [], offset)
  if (match) selectNode(match, false)
}

function handleExternalChange(change: DesignerDocumentChangedEvent): void {
  const document = activeDocument.value
  if (!document || change.path !== document.path || change.revision === document.revision || saveState.value === 'saving') return
  externalRevision.value = change.revision
  if (saveState.value === 'clean') {
    void reload()
    return
  }
  saveState.value = 'conflict'
  error.value = 'This document changed on disk while you have unsaved changes.'
}

function handlePreviewMessage(event: MessageEvent): void {
  if (event.source !== previewFrame.value?.contentWindow || !isPreviewToEditorMessage(event.data)) return
  if (event.data.session !== previewSession.value) return
  if (event.data.type === 'ready') {
    previewFrame.value?.contentWindow?.postMessage({
      channel: 'vue-designer',
      session: previewSession.value,
      type: 'restore-viewport',
      scrollX: previewScroll.value.x,
      scrollY: previewScroll.value.y,
    }, '*')
    const node = selectedNode.value
    if (node) selectNode(node, false)
    return
  }
  if (event.data.type === 'viewport-state') {
    previewScroll.value = { x: event.data.scrollX, y: event.data.scrollY }
    return
  }
  if (event.data.type === 'diagnostic') {
    previewDiagnostic.value = event.data
    return
  }
  if (event.data.type === 'computed-style') {
    if (event.data.nodeId === selectedNodeId.value) computedStyles.value = event.data.styles
    return
  }
  const node = findNode(activeDocument.value?.tree ?? [], event.data.nodeId)
  if (node) selectNode(node)
}

function reloadPreview(): void {
  previewDiagnostic.value = null
  previewSession.value = crypto.randomUUID()
  previewVersion.value += 1
}

function handlePreviewLoad(): void {
  // Selection and viewport restoration wait for the preview's ready handshake.
}

function handleShortcut(event: KeyboardEvent): void {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    void save()
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    if (event.shiftKey) redo()
    else undo()
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
    event.preventDefault()
    redo()
  }
}

import.meta.hot?.on('vue-designer:document-changed', handleExternalChange)

onMounted(() => {
  window.addEventListener('keydown', handleShortcut)
  window.addEventListener('message', handlePreviewMessage)
  void loadDocuments()
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleShortcut)
  window.removeEventListener('message', handlePreviewMessage)
  window.clearTimeout(sourcePreviewTimer)
  import.meta.hot?.off('vue-designer:document-changed', handleExternalChange)
})
</script>

<template>
  <div class="studio">
    <header class="topbar">
      <div class="brand">
        <!-- <span class="brand-mark">VD</span>
        <div><strong>Vue Designer</strong><small>Live component studio</small></div> -->
      </div>
      <div class="document-title">
        <FileCode2 :size="14" />
        <span>{{ activeDocument?.path ?? 'No document selected' }}</span>
        <span class="status-dot" :class="saveState" />
      </div>
      <div class="actions">
        <div class="viewport-switcher" aria-label="Preview viewport">
          <button :class="{ active: viewportWidth === '100%' }" title="Desktop viewport" @click="viewportWidth = '100%'">
            <Monitor :size="14" /><span>Desktop</span>
          </button>
          <button :class="{ active: viewportWidth === '768px' }" title="Tablet viewport" @click="viewportWidth = '768px'">
            <Tablet :size="14" /><span>Tablet</span>
          </button>
          <button :class="{ active: viewportWidth === '390px' }" title="Mobile viewport" @click="viewportWidth = '390px'">
            <Smartphone :size="14" /><span>Mobile</span>
          </button>
        </div>
        <span class="save-state">{{ stateLabel }}</span>
        <div class="history-actions" aria-label="Document history">
          <button :disabled="!canUndo" title="Undo (Ctrl+Z)" aria-label="Undo" @click="undo"><Undo2 :size="15" /></button>
          <button :disabled="!canRedo" title="Redo (Ctrl+Y)" aria-label="Redo" @click="redo"><Redo2 :size="15" /></button>
        </div>
        <button class="save-button" :disabled="saveState === 'clean' || saveState === 'saving'" @click="save"><Save :size="15" />Save</button>
      </div>
    </header>

    <main class="workspace">
      <aside class="sidebar">
        <div class="panel-heading">
          <span>{{ sidebarView === 'layers' ? 'Layers' : 'Components' }}</span>
          <button title="Refresh project" aria-label="Refresh project" @click="loadDocuments"><RefreshCw :size="14" /></button>
        </div>
        <div class="sidebar-content">
          <template v-if="sidebarView === 'layers'">
            <div class="document-picker">
              <FileCode2 :size="15" />
              <select :value="activeDocument?.path" aria-label="Active document" @change="openDocument(documents.find((item) => item.path === ($event.target as HTMLSelectElement).value)!)">
                <option v-for="document in documents" :key="document.path" :value="document.path">{{ document.name }}</option>
              </select>
              <ChevronDown :size="14" />
            </div>
            <div v-if="loading" class="empty-state">Scanning project...</div>
            <ul v-else-if="activeDocument" class="tree-list">
              <TreeNode
                v-for="node in activeDocument.tree"
                :key="node.id"
                :node="node"
                :selected-id="selectedNodeId"
                :drag-kind="dragKind"
                :dragged-node="draggedNode"
                @select="selectNode"
                @drag-node="startNodeDrag"
                @drag-end="endTreeDrag"
                @drop-node="handleTreeDrop"
              />
            </ul>
            <div v-else class="empty-state">No Vue documents match the configured pattern.</div>
            <div v-if="activeDocument?.diagnostics.length" class="tree-diagnostic">{{ activeDocument.diagnostics[0]?.message }}</div>
          </template>
          <template v-else>
            <div class="palette-intro">Insert into <strong>{{ selectedNode?.label ?? 'a selected container' }}</strong></div>
            <div class="layers-heading">Project components</div>
            <div class="component-palette">
              <button v-for="component in components" :key="component.name" :disabled="!canContainChildren(selectedNode)" :title="selectedNode ? `Insert into ${selectedNode.label}` : 'Select a container first'" draggable="true" @dragstart="startComponentDrag($event, component)" @dragend="endTreeDrag" @click="insertComponent(component)">
                <span class="component-glyph"><Component :size="14" /></span>
                <span><strong>{{ component.label }}</strong><small>{{ component.category }}</small></span>
                <Plus :size="13" />
              </button>
            </div>
            <div class="layers-heading">Native elements</div>
            <div class="component-palette native-palette">
              <button v-for="element in nativeElements" :key="element.tag" :disabled="!canContainChildren(selectedNode)" :title="selectedNode ? `Insert into ${selectedNode.label}` : 'Select a container first'" draggable="true" @dragstart="startNativeDrag($event, element)" @dragend="endTreeDrag" @click="insertNative(element)">
                <span class="component-glyph"><Braces :size="14" /></span>
                <span><strong>{{ element.label }}</strong><small>{{ element.category }}</small></span>
                <Plus :size="13" />
              </button>
            </div>
          </template>
        </div>
        <div class="sidebar-switcher" aria-label="Sidebar view">
          <button :class="{ active: sidebarView === 'layers' }" @click="sidebarView = 'layers'"><Layers3 :size="15" />Layers</button>
          <button :class="{ active: sidebarView === 'components' }" @click="sidebarView = 'components'"><Component :size="15" />Components</button>
        </div>
      </aside>

      <div class="center-workspace" :class="{ 'source-collapsed': !sourceOpen }">
        <section class="canvas-panel">
          <div class="canvas-label">Canvas <span>{{ viewportWidth }}</span></div>
          <div class="canvas-scroll">
            <div class="preview-frame" :style="{ width: viewportWidth }">
              <iframe v-if="previewUrl" ref="previewFrame" :key="previewUrl" :src="previewUrl" sandbox="allow-scripts" title="Vue document preview" @load="handlePreviewLoad" />
              <div v-else class="preview-empty">Select a document to begin.</div>
            </div>
          </div>
        </section>
        <section class="source-panel">
          <header class="source-panel-header">
            <span><Code2 :size="14" />Source</span>
            <code>{{ activeDocument?.name ?? 'No document' }}</code>
            <button :title="sourceOpen ? 'Collapse source' : 'Open source'" :aria-label="sourceOpen ? 'Collapse source' : 'Open source'" @click="sourceOpen = !sourceOpen">
              <PanelBottomClose v-if="sourceOpen" :size="15" /><PanelBottomOpen v-else :size="15" />
            </button>
          </header>
          <SourceEditor v-show="sourceOpen" ref="sourceEditor" :source="source" :disabled="!activeDocument" @input="updateSource" @blur="commitSourceEdit" @cursor="syncSelectionFromSource" />
        </section>
      </div>

      <aside class="inspector-panel">
        <div class="inspector-tabs">
          <button :class="{ active: inspectorView === 'content' }" @click="inspectorView = 'content'">Props</button>
          <button :class="{ active: inspectorView === 'style' }" @click="inspectorView = 'style'">Style</button>
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
                <button :disabled="!selectedNode.editable" title="Duplicate layer" aria-label="Duplicate layer" @click="duplicateSelectedNode"><Plus :size="14" /></button>
                <button :disabled="!selectedNode.editable" title="Delete layer" aria-label="Delete layer" @click="removeSelectedNode"><Trash2 :size="14" /></button>
              </div>
            </div>
            <section v-if="selectedNode.kind === 'text'" class="inspector-section">
              <label for="selected-text">Text content</label>
              <textarea id="selected-text" :value="selectedNode.value" @input="updateSelectedText" />
            </section>
            <section v-if="selectedMetadataProps.length" class="inspector-section props-section">
              <div class="section-title">{{ selectedComponent ? 'Props' : 'Attributes' }}</div>
              <label v-for="prop in selectedMetadataProps" :key="prop.name" :title="prop.description || prop.type">
                <span>
                  {{ prop.name }}
                  <small>{{ prop.required ? 'Required' : prop.type }}</small>
                </span>
                <div class="prop-control">
                  <input
                    v-if="prop.control === 'checkbox'"
                    type="checkbox"
                    :checked="propChecked(prop)"
                    :disabled="propIsExpression(prop)"
                    @change="updateComponentProp(prop, $event)"
                  />
                  <select
                    v-else-if="prop.control === 'select'"
                    :value="propValue(prop)"
                    :disabled="propIsExpression(prop)"
                    @change="updateComponentProp(prop, $event)"
                  >
                    <option v-if="!prop.required" value="">Default</option>
                    <option v-for="option in prop.options" :key="option" :value="option">{{ option }}</option>
                  </select>
                  <input
                    v-else
                    :type="prop.control === 'number' ? 'number' : prop.control === 'color' ? 'color' : 'text'"
                    :value="propValue(prop)"
                    :disabled="propIsExpression(prop)"
                    @change="updateComponentProp(prop, $event)"
                  />
                  <button v-if="selectedAttribute(prop.name) && !prop.required" title="Use default value" @click="clearComponentProp(prop)">Reset</button>
                </div>
                <small v-if="propIsExpression(prop)" class="expression-note">Expression props are source-only.</small>
              </label>
            </section>
            <section v-if="selectedNode.attributes.some((attribute) => !isMetadataProp(attribute.name))" class="inspector-section">
              <div class="section-title">Attributes</div>
              <label v-for="attribute in selectedNode.attributes.filter((item) => !isMetadataProp(item.name))" :key="attribute.name">
                <span>{{ attribute.name }}<small v-if="!attribute.editable">Expression</small></span>
                <input
                  :value="attribute.value"
                  :disabled="!attribute.editable"
                  @change="updateSelectedAttribute(attribute.name, $event)"
                />
              </label>
            </section>
            <div v-if="selectedNode.kind !== 'text' && !selectedNode.attributes.length && !selectedMetadataProps.length" class="inspector-empty compact">No attributes on this layer.</div>
            <div v-if="!selectedNode.editable" class="locked-notice">{{ selectedNode.lockedReason }}</div>
          </template>
        </div>

        <div v-else-if="inspectorView === 'style'" class="inspector-content style-inspector">
          <div v-if="!selectedNode || selectedNode.kind === 'text'" class="inspector-empty">
            <strong>Select an element</strong>
            <span>Editable local CSS rules will appear here.</span>
          </div>
          <template v-else>
            <div class="selection-summary">
              <span class="tree-kind">{{ selectedNode.kind === 'component' ? 'C' : 'E' }}</span>
              <div><strong>{{ selectedNode.label }}</strong><small>Styles</small></div>
            </div>
            <div class="style-rule-picker">
              <label>Local rule</label>
              <select
                v-if="styleRules.length"
                :value="activeStyleRule?.selector"
                @change="activeStyleSelector = ($event.target as HTMLSelectElement).value"
              >
                <option v-for="rule in styleRules" :key="rule.selector" :value="rule.selector">{{ rule.selector }}</option>
              </select>
              <code v-else>{{ styleSelector() }} (new)</code>
            </div>
            <section v-for="group in styleControls" :key="group.group" class="inspector-section style-section">
              <div class="section-title">{{ group.group }}</div>
              <label v-for="property in group.properties" :key="property">
                <span>{{ property }}</span>
                <select v-if="property === 'display'" :value="styleValue(property)" @change="updateStyle(property, $event)">
                  <option value="">Unset</option>
                  <option v-for="value in ['block', 'flex', 'grid', 'inline-flex', 'none']" :key="value" :value="value">{{ value }}</option>
                </select>
                <select v-else-if="property === 'text-align'" :value="styleValue(property)" @change="updateStyle(property, $event)">
                  <option value="">Unset</option>
                  <option v-for="value in ['left', 'center', 'right', 'justify']" :key="value" :value="value">{{ value }}</option>
                </select>
                <div v-else-if="property === 'color' || property === 'background-color'" class="color-control">
                  <input type="color" :value="styleValue(property) || '#000000'" @change="updateStyle(property, $event)" />
                  <input :value="styleValue(property)" placeholder="Unset" @change="updateStyle(property, $event)" />
                </div>
                <input v-else :value="styleValue(property)" placeholder="Unset" @change="updateStyle(property, $event)" />
              </label>
            </section>
            <section v-if="Object.keys(computedStyles).length" class="inspector-section computed-section">
              <div class="section-title">Computed</div>
              <div v-for="(value, property) in computedStyles" :key="property" class="computed-row">
                <span>{{ property }}</span><code>{{ value || 'initial' }}</code>
              </div>
            </section>
          </template>
        </div>

      </aside>
    </main>

    <div v-if="error || previewDiagnostic" class="diagnostic">
      <span>{{ error || previewDiagnostic?.message }}</span>
      <details v-if="previewDiagnostic?.stack">
        <summary>Details</summary>
        <pre>{{ previewDiagnostic.stack }}</pre>
      </details>
      <button v-if="saveState === 'conflict'" @click="reload">Reload from disk</button>
      <button v-if="saveState === 'conflict' && externalRevision" @click="keepLocalChanges">Overwrite disk</button>
      <button v-if="previewDiagnostic" @click="reloadPreview">Reload preview</button>
      <button @click="error = ''; previewDiagnostic = null">Dismiss</button>
    </div>
  </div>
</template>

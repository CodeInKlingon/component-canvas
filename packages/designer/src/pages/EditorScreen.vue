<script setup lang="ts">
import { computed, inject, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  ArrowLeft,
  Braces,
  Eye,
  ChevronDown,
  Code2,
  Component,
  FileCode2,
  Layers3,
  MousePointer2,
  Maximize2,
  Minus,
  Monitor,
  PanelBottomClose,
  PanelBottomOpen,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Redo2,
  RefreshCw,
  Save,
  Sparkles,
  Smartphone,
  Tablet,
  Trash2,
  Undo2,
} from '@lucide/vue'
import type {
  DesignerDocument,
  DesignerDocumentSummary,
  SaveDocumentResponse,
  DesignerNode,
  DesignerSourceOperation,
  DesignerComponentMetadata,
  DesignerPropMetadata,
  DesignerStyleRule,
  DesignerStyleCandidateResponse,
  DesignerAiModel,
  DesignerAiModelsResponse,
  DesignerAiModelParameterValue,
  DesignerAiResponse,
  DesignerDocumentChangedEvent,
  PreviewCandidateResponse,
  DesignerSourceCandidateResponse,
  DesignerFrameworkClientMetadata,
} from '@vue-designer/shared'
import { isPreviewToEditorMessage } from '@vue-designer/shared'
import { hostKey, readOnlyKey } from '../services/host'
import type { DesignerRoute } from '../services/router'
import TreeNode from '../components/TreeNode.vue'
import SourceEditor from '../components/SourceEditor.vue'
import { SourceHistory } from '../lib/history'
import { findNode, findNodeAtOffset, findNodeAtPath, findNodePath, findRenderedSelection, reconcileCollapsedTree } from '../lib/selection'
import { nativeElements, type NativeElementMetadata } from '../lib/native-elements'
import { createInsertComponentOperation, findComponentForTag, groupComponents } from '../lib/component-palette'
import { captureDragSelection, findDragSelectionOffset, type DragSelection } from '../lib/drag-selection'
import { nodeClipboardMime, parseNodeClipboard, serializeNodeClipboard, type NodeClipboardPayload } from '../lib/node-clipboard'
import { clampZoom, fitZoom, viewportPresets, zoomAroundPoint, type ViewportMode } from '../lib/canvas'
import { isCurrentCandidateRequest, resolveCandidateSelection } from '../lib/candidate-state'
import { readAiModelPreference, resolveAiModelId, resolveAiModelParams, writeAiModelPreference } from '../services/ai-model-preference'

type SaveState = 'clean' | 'dirty' | 'saving' | 'conflict'

const props = defineProps<{ path: string }>()
const emit = defineEmits<{ navigate: [route: DesignerRoute] }>()
const host = inject(hostKey)!
const readOnly = inject(readOnlyKey, false)
const api = host.request

const documents = ref<DesignerDocumentSummary[]>([])
const components = ref<DesignerComponentMetadata[]>([])
const componentQuery = ref('')
const activeDocument = ref<DesignerDocument | null>(null)
const source = ref('')
const error = ref('')
const loading = ref(true)
const saveState = ref<SaveState>('clean')
const previewVersion = ref(0)
const viewportMode = ref<ViewportMode>('responsive')
const canvasViewport = ref<HTMLElement | null>(null)
const canvasSize = ref({ width: 0, height: 0 })
const canvasPan = ref({ x: 0, y: 0 })
const canvasZoom = ref(1)
const canvasOwnsInput = ref(true)
const isWheelPanning = ref(false)
const isPanning = ref(false)
const spacePressed = ref(false)
const previewFrame = ref<HTMLIFrameElement | null>(null)
const previewOrigin = ref('')
const previewSession = ref(crypto.randomUUID())
const previewDiagnostic = ref<{ level: 'error' | 'warning' | 'info'; message: string; stack?: string } | null>(null)
const previewScroll = ref({ x: 0, y: 0 })
const sourceEditor = ref<InstanceType<typeof SourceEditor> | null>(null)
const selectedNodeId = ref<string | null>(null)
const collapsedIds = ref<ReadonlySet<string>>(new Set())
const treeCollapseState = new Map<string, Set<string>>()
const candidateId = ref<string | null>(null)
const inspectorView = ref<'content' | 'style'>('content')
const sidebarView = ref<'layers' | 'components'>('layers')
const sidebarOpen = ref(true)
const inspectorOpen = ref(true)
const sourceOpen = ref(true)
const activeStyleSelector = ref('')
const styleRules = ref<DesignerStyleRule[]>([])
const computedStyles = ref<Record<string, string>>({})
const draggedComponent = ref<DesignerComponentMetadata | null>(null)
const draggedNative = ref<NativeElementMetadata | null>(null)
const draggedNode = ref<DesignerNode | null>(null)
const dragSelection = ref<DragSelection | null>(null)
const droppedSelection = ref<DragSelection | null>(null)
const insertedSelectionOffset = ref<number | null>(null)
const contextMenu = ref<{ nodeId: string; x: number; y: number } | null>(null)
const insertPicker = ref<{ nodeId: string; position: 'inside' | 'after' } | null>(null)
const clipboardPayload = ref<NodeClipboardPayload | null>(null)
const externalRevision = ref<string | null>(null)
const aiEnabled = ref(false)
const framework = ref<DesignerFrameworkClientMetadata | null>(null)
const aiPromptOpen = ref(false)
const aiPrompt = ref('')
const aiRunning = ref(false)
const aiModels = ref<DesignerAiModel[]>([])
const aiModel = ref('')
const aiModelsState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const aiModelsError = ref('')
const aiParams = ref<Record<string, string>>({})
const selectedAiModel = computed(() => aiModels.value.find((model) => model.id === aiModel.value))
const historyVersion = ref(0)
const history = new SourceHistory()
let sourcePreviewTimer: number | undefined
let candidateRequest = 0
let canvasResizeObserver: ResizeObserver | undefined
let panPointerId: number | undefined
let panStart = { x: 0, y: 0, panX: 0, panY: 0 }
let wheelPanActiveUntil = 0
let wheelPanTimer: number | undefined
let escapeDeselecting = false

const selectedNode = computed(() => findNode(activeDocument.value?.tree ?? [], selectedNodeId.value))
const selectedComponent = computed(() => selectedNode.value?.kind === 'component'
  ? findComponentForTag(components.value, selectedNode.value.label)
  : null)
const componentGroups = computed(() => groupComponents(components.value, componentQuery.value))
const pendingComponentMeta = new Set<string>()
watch(selectedComponent, (component) => {
  if (!component || component.metaLoaded || pendingComponentMeta.has(component.id)) return
  pendingComponentMeta.add(component.id)
  void loadComponentMeta(component).finally(() => pendingComponentMeta.delete(component.id))
}, { immediate: true })
const selectedNative = computed(() => selectedNode.value?.kind === 'element'
  ? nativeElements.find((element) => element.tag === selectedNode.value?.label) ?? null
  : null)
const inspectorLocked = computed(() => readOnly || !selectedNode.value?.editable)
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
const viewportSize = computed(() => viewportMode.value === 'responsive'
  ? { width: Math.max(1, canvasSize.value.width), height: Math.max(1, canvasSize.value.height) }
  : viewportPresets[viewportMode.value])
const viewportLabel = computed(() => viewportMode.value === 'responsive'
  ? `Responsive · ${viewportSize.value.width} × ${viewportSize.value.height}`
  : `${viewportSize.value.width} × ${viewportSize.value.height}`)
const canvasSceneStyle = computed(() => ({
  width: `${viewportSize.value.width}px`,
  height: `${viewportSize.value.height}px`,
  transform: `translate(${canvasPan.value.x}px, ${canvasPan.value.y}px) scale(${canvasZoom.value})`,
}))
const zoomLabel = computed(() => `${Math.round(canvasZoom.value * 100)}%`)

function recordSource(candidateSource: string): void {
  history.push(candidateSource)
  historyVersion.value += 1
}

const previewUrl = computed(() => {
  if (!activeDocument.value || (!readOnly && !previewOrigin.value)) return ''
  return host.previewUrl({
    previewOrigin: previewOrigin.value,
    path: activeDocument.value.path,
    version: previewVersion.value,
    session: previewSession.value,
    candidateId: candidateId.value,
  })
})
// A static build has no separate preview origin or CORS headers. With no host APIs or
// credentials to protect, its preview may keep the page origin to load its own modules.
const previewSandbox = readOnly ? 'allow-scripts allow-same-origin' : 'allow-scripts'

const stateLabel = computed(() => ({
  clean: 'Saved',
  dirty: 'Unsaved changes',
  saving: 'Saving...',
  conflict: 'External change',
})[saveState.value])

const documentMissing = ref(false)

async function loadDocuments(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const config = await host.config()
    framework.value = config.framework
    const [loadedDocuments] = await Promise.all([
      host.listDocuments(),
      loadComponents(),
    ])
    documents.value = loadedDocuments
    previewOrigin.value = config.previewOrigin
    aiEnabled.value = !readOnly && config.framework.capabilities.ai
    if (activeDocument.value?.path !== props.path) await openDocument(props.path)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to load documents'
  } finally {
    loading.value = false
  }
}

async function loadComponents(): Promise<void> {
  if (!framework.value?.capabilities.components) {
    components.value = []
    return
  }
  const loaded = await host.listComponents()
  const previous = new Map(components.value.map((component) => [component.id, component]))
  components.value = loaded.map((component) => previous.get(component.id)?.metaLoaded ? previous.get(component.id)! : component)
}

async function loadComponentMeta(component: DesignerComponentMetadata): Promise<void> {
  try {
    const loaded = await host.getComponentMeta(component.id)
    components.value = components.value.map((item) => item.id === loaded.id ? loaded : item)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to load component metadata'
  }
}

function handleComponentsChanged(): void {
  components.value = components.value.map((component) => ({ ...component, metaLoaded: false }))
  void loadComponents().catch((cause: unknown) => {
    error.value = cause instanceof Error ? cause.message : 'Unable to load components'
  })
}

function insertComponent(component: DesignerComponentMetadata, target = selectedNode.value, position: 'inside' | 'after' = 'inside'): void {
  const document = activeDocument.value
  const parent = target
  if (!framework.value?.capabilities.components || !document || !parent || !parent.editable
    || (position === 'inside' && !parent.capabilities.canContainChildren)) return
  void applyOperation(createInsertComponentOperation(component, document.path, parent.id, position))
}

function openInsertPicker(position: 'inside' | 'after'): void {
  const nodeId = contextMenu.value?.nodeId
  if (!nodeId) return
  insertPicker.value = { nodeId, position }
  closeContextMenu()
}

function closeInsertPicker(): void {
  insertPicker.value = null
}

function pickComponent(component: DesignerComponentMetadata): void {
  const picker = insertPicker.value
  const target = findNode(activeDocument.value?.tree ?? [], picker?.nodeId ?? null)
  if (!picker || !target) return
  insertComponent(component, target, picker.position)
  closeInsertPicker()
}

function canContainChildren(node: DesignerNode | null): boolean {
  return !!node?.capabilities.canContainChildren
}

function openContextMenu(event: MouseEvent, node: DesignerNode): void {
  if (!node.editable) return
  if (readOnly) {
    selectNode(node, false)
    contextMenu.value = { nodeId: node.id, x: Math.min(event.clientX, window.innerWidth - 190), y: Math.min(event.clientY, window.innerHeight - 60) }
    return
  }
  selectNode(node, false)
  contextMenu.value = {
    nodeId: node.id,
    x: Math.min(event.clientX, window.innerWidth - 190),
    y: Math.min(event.clientY, window.innerHeight - 180),
  }
}

function closeContextMenu(): void {
  contextMenu.value = null
}

async function copyContextNode(): Promise<void> {
  const node = findNode(activeDocument.value?.tree ?? [], contextMenu.value?.nodeId ?? null)
  if (!node?.editable) return
  const serialized = serializeNodeClipboard(node, source.value)
  clipboardPayload.value = parseNodeClipboard(serialized)
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        [nodeClipboardMime]: new Blob([serialized], { type: nodeClipboardMime }),
        'text/plain': new Blob([source.value.slice(node.range.start, node.range.end)], { type: 'text/plain' }),
      }),
    ])
  } catch {
    // The in-memory payload keeps same-session paste available when clipboard permissions are denied.
  }
  closeContextMenu()
}

async function readClipboardPayload(): Promise<NodeClipboardPayload | null> {
  try {
    for (const item of await navigator.clipboard.read()) {
      if (!item.types.includes(nodeClipboardMime)) continue
      const payload = parseNodeClipboard(await (await item.getType(nodeClipboardMime)).text())
      if (payload) return payload
    }
  } catch {
    // Fall back to the last validated same-session payload.
  }
  return clipboardPayload.value
}

async function pasteContextNode(position: 'inside' | 'after'): Promise<void> {
  const target = findNode(activeDocument.value?.tree ?? [], contextMenu.value?.nodeId ?? null)
  if (!target?.editable || (position === 'inside' && !canContainChildren(target))) return
  const payload = await readClipboardPayload()
  if (!payload) return
  closeContextMenu()
  await applyOperation({ type: 'insert-node', targetId: target.id, position, source: payload.source })
}

function insertNative(element: NativeElementMetadata, target = selectedNode.value, position: 'inside' | 'after' = 'inside'): void {
  if (!target?.editable || (position === 'inside' && !canContainChildren(target))) return
  void applyOperation({
    type: 'insert-native',
    parentId: target!.id,
    tag: element.tag,
    contentModel: element.contentModel,
    defaultContent: element.defaultContent,
    defaultChildren: element.defaultChildren,
    attributes: element.attributes,
    position,
  })
}

function pickNative(element: NativeElementMetadata): void {
  const picker = insertPicker.value
  const target = findNode(activeDocument.value?.tree ?? [], picker?.nodeId ?? null)
  if (!picker || !target) return
  insertNative(element, target, picker.position)
  closeInsertPicker()
}

function startNodeDrag(node: DesignerNode): void {
  draggedComponent.value = null
  draggedNative.value = null
  draggedNode.value = node
  dragSelection.value = captureDragSelection(selectedNodeId.value, node.id, source.value, node.range)
}

function startComponentDrag(event: DragEvent, component: DesignerComponentMetadata): void {
  draggedNode.value = null
  draggedNative.value = null
  draggedComponent.value = component
  event.dataTransfer?.setData('application/x-vue-designer-component', component.id)
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
  if (dragSelection.value && !droppedSelection.value) selectedNodeId.value = dragSelection.value.nodeId
  draggedComponent.value = null
  draggedNative.value = null
  draggedNode.value = null
  dragSelection.value = null
}

function handleTreeDrop(target: DesignerNode, position: 'before' | 'inside' | 'after'): void {
  if (draggedComponent.value) {
    insertComponent(draggedComponent.value, target)
  } else if (draggedNative.value) {
    insertNative(draggedNative.value, target)
  } else if (draggedNode.value) {
    const nodeId = draggedNode.value.id
    droppedSelection.value = dragSelection.value
    void applyOperation({ type: 'move-node', nodeId, targetId: target.id, position })
  }
  endTreeDrag()
}

function duplicateSelectedNode(): void {
  const node = selectedNode.value
  if (node?.editable) void applyOperation({ type: 'duplicate-node', nodeId: node.id })
}

function duplicateContextNode(): void {
  const node = findNode(activeDocument.value?.tree ?? [], contextMenu.value?.nodeId ?? null)
  closeContextMenu()
  if (node?.editable) void applyOperation({ type: 'duplicate-node', nodeId: node.id })
}

function removeContextNode(): void {
  const node = findNode(activeDocument.value?.tree ?? [], contextMenu.value?.nodeId ?? null)
  if (!node?.editable || !window.confirm(`Delete ${node.label}?`)) return
  closeContextMenu()
  selectedNodeId.value = null
  void applyOperation({ type: 'remove-node', nodeId: node.id })
}

function removeSelectedNode(): void {
  const node = selectedNode.value
  if (!node?.editable || !window.confirm(`Delete ${node.label}?`)) return
  selectedNodeId.value = null
  void applyOperation({ type: 'remove-node', nodeId: node.id })
}

// Leaving with unsaved changes is confirmed by the router before the path changes.
async function openDocument(path: string): Promise<void> {
  error.value = ''
  documentMissing.value = false
  try {
    const loaded = await host.getDocument(path)
    if (path !== props.path) return
    activeDocument.value = loaded
    source.value = loaded.source
    history.reset(loaded.source)
    historyVersion.value += 1
    saveState.value = 'clean'
    externalRevision.value = null
    selectedNodeId.value = null
    collapsedIds.value = treeCollapseState.get(path) ?? new Set()
    candidateId.value = null
    previewSession.value = crypto.randomUUID()
    previewDiagnostic.value = null
    previewScroll.value = { x: 0, y: 0 }
    previewVersion.value += 1
  } catch (cause) {
    if (path !== props.path) return
    activeDocument.value = null
    source.value = ''
    selectedNodeId.value = null
    const status = (cause as { status?: number }).status
    if (status === 404) documentMissing.value = true
    else error.value = cause instanceof Error ? cause.message : 'Unable to open document'
  }
}

function hasUnsavedChanges(): boolean {
  return saveState.value === 'dirty' || saveState.value === 'conflict'
}

function showDesigns(): void {
  emit('navigate', { name: 'landing' })
}

function switchDocument(path: string): void {
  emit('navigate', { name: 'editor', path })
}

watch(() => props.path, (path) => {
  closeContextMenu()
  closeInsertPicker()
  aiPromptOpen.value = false
  void openDocument(path)
})

function updateSource(value: Event | string): void {
  if (readOnly) return
  source.value = typeof value === 'string' ? value : (value.target as HTMLTextAreaElement).value
  saveState.value = source.value === activeDocument.value?.source ? 'clean' : 'dirty'
  window.clearTimeout(sourcePreviewTimer)
  sourcePreviewTimer = window.setTimeout(() => void createCandidate(source.value), 350)
}

function commitSourceEdit(): void {
  if (!readOnly) recordSource(source.value)
}

async function createCandidate(candidateSource: string): Promise<void> {
  const document = activeDocument.value
  if (!document) return
  previewDiagnostic.value = null
  const selectedPath = findNodePath(document.tree, selectedNodeId.value)
  const movedSelectionOffset = droppedSelection.value
    ? findDragSelectionOffset(candidateSource, droppedSelection.value)
    : null
  const nextSelectionOffset = insertedSelectionOffset.value ?? movedSelectionOffset
  const request = ++candidateRequest
  try {
    const result = await api<PreviewCandidateResponse>('/__designer/api/candidate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: document.path, source: candidateSource }),
    })
    if (!isCurrentCandidateRequest(request, candidateRequest, candidateSource, source.value, document.path, activeDocument.value?.path)) return
    candidateId.value = result.candidateId
    activeDocument.value = { ...document, tree: result.tree, diagnostics: result.diagnostics }
    replaceTree(result.tree)
    selectedNodeId.value = resolveCandidateSelection(result.tree, nextSelectionOffset, selectedNodeId.value, selectedPath)
    droppedSelection.value = null
    insertedSelectionOffset.value = null
    error.value = ''
  } catch (cause) {
    if (request !== candidateRequest) return
    droppedSelection.value = null
    insertedSelectionOffset.value = null
    error.value = cause instanceof Error ? cause.message : 'Unable to preview source'
  }
}

async function applyOperation(operation: DesignerSourceOperation): Promise<void> {
  const document = activeDocument.value
  if (readOnly || !document) return
  const requestSource = source.value
  const selectedPath = findNodePath(document.tree, selectedNodeId.value)
  const request = ++candidateRequest
  try {
    const result = await api<DesignerSourceCandidateResponse>('/__designer/api/source-candidate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: document.path, source: requestSource, operation }),
    })
    if (!isCurrentCandidateRequest(request, candidateRequest, requestSource, source.value, document.path, activeDocument.value?.path)) return
    recordSource(result.source)
    source.value = result.source
    candidateId.value = result.candidateId
    activeDocument.value = { ...document, tree: result.tree, diagnostics: result.diagnostics }
    replaceTree(result.tree)
    selectedNodeId.value = resolveCandidateSelection(result.tree, result.selectionOffset, selectedNodeId.value, selectedPath)
    saveState.value = result.source === document.source ? 'clean' : 'dirty'
    error.value = ''
  } catch (cause) {
    if (request !== candidateRequest) return
    error.value = cause instanceof Error ? cause.message : 'Unable to edit selection'
  }
}

async function loadAiModels(): Promise<void> {
  if (aiModelsState.value === 'loading' || aiModelsState.value === 'ready') return
  aiModelsState.value = 'loading'
  aiModelsError.value = ''
  try {
    const result = await api<DesignerAiModelsResponse>('/__designer/api/ai/models')
    aiModels.value = result.models
    aiModel.value = resolveAiModelId(result.models, result.defaultModel, aiModel.value, readAiModelPreference()?.model)
    aiModelsState.value = 'ready'
  } catch (cause) {
    aiModelsError.value = cause instanceof Error ? cause.message : 'Unable to load Cursor models'
    aiModelsState.value = 'error'
  }
}

watch(selectedAiModel, (model) => {
  aiParams.value = resolveAiModelParams(model, readAiModelPreference())
})

watch([aiModel, aiParams], () => {
  if (aiModelsState.value !== 'ready' || !selectedAiModel.value) return
  writeAiModelPreference({
    model: aiModel.value,
    params: Object.entries(aiParams.value).map(([id, value]) => ({ id, value })),
  })
}, { deep: true })

function selectedAiParams(): DesignerAiModelParameterValue[] {
  return Object.entries(aiParams.value)
    .filter(([, value]) => value !== '')
    .map(([id, value]) => ({ id, value }))
}

function closeAiPrompt(): void {
  if (!aiRunning.value) aiPromptOpen.value = false
}

function submitAiPromptShortcut(event: KeyboardEvent): void {
  if (!event.ctrlKey && !event.metaKey) return
  event.preventDefault()
  void runAiEdit()
}

function openAiPrompt(): void {
  aiPromptOpen.value = true
  void loadAiModels()
}

async function runAiEdit(): Promise<void> {
  const document = activeDocument.value
  const node = selectedNode.value
  const prompt = aiPrompt.value.trim()
  if (readOnly || !framework.value?.capabilities.ai || !document || !node || !prompt || aiRunning.value) return
  const requestSource = source.value
  aiRunning.value = true
  error.value = ''
  try {
    const result = await api<DesignerAiResponse>('/__designer/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: document.path,
        source: requestSource,
        prompt,
        model: aiModel.value || undefined,
        params: aiModel.value ? selectedAiParams() : undefined,
        selection: {
          nodeId: node.id,
          range: node.range,
          source: requestSource.slice(node.range.start, node.range.end),
        },
      }),
    })
    if (source.value !== requestSource || activeDocument.value?.path !== document.path) {
      throw new Error('The document changed while Cursor was working. Run the prompt again.')
    }
    if (result.source === requestSource) {
      aiPromptOpen.value = false
      aiPrompt.value = ''
      return
    }
    recordSource(result.source)
    source.value = result.source
    saveState.value = result.source === document.source ? 'clean' : 'dirty'
    await createCandidate(result.source)
    aiPromptOpen.value = false
    aiPrompt.value = ''
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to apply AI edit'
  } finally {
    aiRunning.value = false
  }
}

function updateSelectedText(event: Event): void {
  const node = selectedNode.value
  if (!node?.editable) return
  void applyOperation({
    type: 'set-text',
    nodeId: node.id,
    value: (event.target as HTMLTextAreaElement).value,
  })
}

function updateSelectedAttribute(name: string, event: Event): void {
  const node = selectedNode.value
  if (!node?.editable) return
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
  if (!node?.editable) return
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
  if (node?.editable) void applyOperation({ type: 'set-attribute', nodeId: node.id, name: prop.name, value: null })
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
  if (readOnly || !framework.value?.capabilities.styles || !node?.editable || node.kind === 'text') return
  const selector = styleSelector()
  activeStyleSelector.value = selector
  const value = (event.target as HTMLInputElement | HTMLSelectElement).value
  const document = activeDocument.value
  if (!document) return
  const requestSource = source.value
  const request = ++candidateRequest
  previewDiagnostic.value = null
  const selectedPath = findNodePath(document.tree, selectedNodeId.value)
  void api<DesignerStyleCandidateResponse>('/__designer/api/style-candidate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: document.path,
      source: requestSource,
      operation: { nodeId: node.id, selector, property, value: value || null },
    }),
  }).then((result) => {
    if (!isCurrentCandidateRequest(request, candidateRequest, requestSource, source.value, document.path, activeDocument.value?.path)) return
    recordSource(result.source)
    source.value = result.source
    candidateId.value = result.candidateId
    styleRules.value = result.rules
    activeDocument.value = { ...document, tree: result.tree, diagnostics: result.diagnostics }
    replaceTree(result.tree)
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
    if (request !== candidateRequest) return
    error.value = cause instanceof Error ? cause.message : 'Unable to update style'
  })
}

async function loadStyles(): Promise<void> {
  const document = activeDocument.value
  const node = selectedNode.value
  if (!framework.value?.capabilities.styles || !document || !node || node.kind === 'text') {
    styleRules.value = []
    return
  }
  try {
    styleRules.value = await host.getStyleRules({ path: document.path, source: source.value }, node.id)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to load styles'
  }
}

async function save(): Promise<void> {
  const document = activeDocument.value
  if (readOnly || !document || saveState.value === 'saving' || saveState.value === 'clean') return

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
    await openDocument(activeDocument.value.path)
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
  if (readOnly || nextSource === undefined) return
  source.value = nextSource
  historyVersion.value += 1
  saveState.value = nextSource === activeDocument.value?.source ? 'clean' : 'dirty'
  await createCandidate(nextSource)
}

function undo(): void {
  if (readOnly) return
  if (source.value !== history.current) recordSource(source.value)
  void restoreHistory(history.undo())
}

function redo(): void {
  void restoreHistory(history.redo())
}

function selectNode(node: DesignerNode, revealInSource = true): void {
  if (dragSelection.value && node.id !== dragSelection.value.nodeId) return
  aiPromptOpen.value = false
  selectedNodeId.value = node.id
  activeStyleSelector.value = ''
  computedStyles.value = {}
  void loadStyles()
  revealAncestors(node)
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

function deselectNode(): void {
  aiPromptOpen.value = false
  selectedNodeId.value = null
  activeStyleSelector.value = ''
  computedStyles.value = {}
  previewFrame.value?.contentWindow?.postMessage({
    channel: 'vue-designer',
    session: previewSession.value,
    type: 'select',
    nodeId: null,
  }, '*')
}

function revealAncestors(node: DesignerNode): void {
  const tree = activeDocument.value?.tree
  if (!tree) return
  const path = findNodePath(tree, node.id)
  if (!path) return
  const ids = new Set(collapsedIds.value)
  let changed = false
  for (let i = 0; i < path.length - 1; i++) {
    const ancestor = findNodeAtPath(tree, path.slice(0, i + 1))
    if (ancestor && ids.delete(ancestor.id)) changed = true
  }
  if (changed) {
    collapsedIds.value = ids
    if (activeDocument.value) treeCollapseState.set(activeDocument.value.path, ids)
  }
}

function toggleCollapse(node: DesignerNode): void {
  const ids = new Set(collapsedIds.value)
  if (ids.has(node.id)) ids.delete(node.id)
  else ids.add(node.id)
  collapsedIds.value = ids
  if (activeDocument.value) treeCollapseState.set(activeDocument.value.path, ids)
}

function replaceTree(nextTree: DesignerNode[]): void {
  const document = activeDocument.value
  if (!document) return
  const reconciled = reconcileCollapsedTree(document.tree, nextTree, collapsedIds.value)
  collapsedIds.value = reconciled
  treeCollapseState.set(document.path, reconciled)
}

function syncSelectionFromSource(offset: number): void {
  if (escapeDeselecting) return
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
  if (event.data.type === 'pan-key-state') {
    spacePressed.value = event.data.pressed
    return
  }
  if (event.data.type === 'canvas-wheel') {
    if (event.data.zoom) {
      const viewportBounds = canvasViewport.value?.getBoundingClientRect()
      const frameBounds = previewFrame.value?.getBoundingClientRect()
      if (viewportBounds && frameBounds) {
        setCanvasZoom(canvasZoom.value * Math.exp(-event.data.deltaY * 0.002), {
          x: frameBounds.left - viewportBounds.left + event.data.clientX * canvasZoom.value,
          y: frameBounds.top - viewportBounds.top + event.data.clientY * canvasZoom.value,
        })
      }
    } else {
      continueWheelPanGesture()
      panCanvasByWheel(event.data.deltaX, event.data.deltaY)
    }
    return
  }
  if (event.data.type === 'ready') {
    previewFrame.value?.contentWindow?.postMessage({
      channel: 'vue-designer',
      session: previewSession.value,
      type: 'restore-viewport',
      scrollX: previewScroll.value.x,
      scrollY: previewScroll.value.y,
    }, '*')
    syncCanvasInputMode()
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
  if (event.data.type === 'select' && event.data.nodeId === null) {
    deselectNode()
    return
  }
  const node = findNode(activeDocument.value?.tree ?? [], event.data.nodeId)
  if (node) {
    if (event.data.type === 'context-menu') {
      const frame = previewFrame.value?.getBoundingClientRect()
      if (frame) openContextMenu(new MouseEvent('contextmenu', {
        clientX: frame.left + event.data.clientX * canvasZoom.value,
        clientY: frame.top + event.data.clientY * canvasZoom.value,
      }), node)
      return
    }
    selectNode(node, event.data.type !== 'ai-prompt')
    if (event.data.type === 'ai-prompt' && aiEnabled.value) openAiPrompt()
  }
}

function reloadPreview(): void {
  spacePressed.value = false
  isPanning.value = false
  previewDiagnostic.value = null
  previewSession.value = crypto.randomUUID()
  previewVersion.value += 1
}

function handlePreviewLoad(): void {
  spacePressed.value = false
  isPanning.value = false
  // Selection and viewport restoration wait for the preview's ready handshake.
}

function centerCanvas(zoom = canvasZoom.value): void {
  const viewport = canvasViewport.value
  if (!viewport) return
  canvasPan.value = {
    x: (viewport.clientWidth - viewportSize.value.width * zoom) / 2,
    y: (viewport.clientHeight - viewportSize.value.height * zoom) / 2,
  }
}

function setViewportMode(mode: ViewportMode): void {
  viewportMode.value = mode
  syncCanvasInputMode(mode)
  void nextTick(() => {
    if (mode === 'responsive') {
      canvasZoom.value = 1
      canvasPan.value = { x: 0, y: 0 }
    } else {
      fitCanvas()
    }
  })
}

function syncCanvasInputMode(mode = viewportMode.value): void {
  previewFrame.value?.contentWindow?.postMessage({
    channel: 'vue-designer',
    session: previewSession.value,
    type: 'canvas-input-mode',
    enabled: canvasOwnsInput.value && mode !== 'responsive',
    selectionEnabled: canvasOwnsInput.value || mode === 'responsive',
  }, '*')
}

function toggleCanvasInputMode(): void {
  canvasOwnsInput.value = !canvasOwnsInput.value
  if (!canvasOwnsInput.value) {
    isWheelPanning.value = false
    window.clearTimeout(wheelPanTimer)
  }
  syncCanvasInputMode()
}

function panCanvasByWheel(deltaX: number, deltaY: number): void {
  if (!canvasOwnsInput.value || viewportMode.value === 'responsive') return
  canvasPan.value = {
    x: canvasPan.value.x - deltaX,
    y: canvasPan.value.y - deltaY,
  }
}

function continueWheelPanGesture(): void {
  wheelPanActiveUntil = performance.now() + 300
  isWheelPanning.value = true
  window.clearTimeout(wheelPanTimer)
  wheelPanTimer = window.setTimeout(() => {
    isWheelPanning.value = false
  }, 300)
}

function wheelDeltaScale(event: WheelEvent): number {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return 16
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return canvasViewport.value?.clientHeight ?? 1
  return 1
}

function continueCanvasWheelOutsideViewport(event: WheelEvent): void {
  const target = event.target
  const insideViewport = target instanceof Node && !!canvasViewport.value?.contains(target)
  if (insideViewport) return
  if (!canvasOwnsInput.value || viewportMode.value === 'responsive' || performance.now() > wheelPanActiveUntil) return
  event.preventDefault()
  const scale = wheelDeltaScale(event)
  panCanvasByWheel(event.deltaX * scale, event.deltaY * scale)
  continueWheelPanGesture()
}

function setCanvasZoom(zoom: number, point?: { x: number; y: number }): void {
  const nextZoom = clampZoom(zoom)
  const viewport = canvasViewport.value
  if (!viewport || viewportMode.value === 'responsive') return
  const anchor = point ?? { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 }
  canvasPan.value = zoomAroundPoint(canvasPan.value, anchor, canvasZoom.value, nextZoom)
  canvasZoom.value = nextZoom
}

function fitCanvas(): void {
  if (viewportMode.value === 'responsive') return
  canvasZoom.value = fitZoom(canvasSize.value, viewportSize.value)
  centerCanvas(canvasZoom.value)
}

function handleCanvasWheel(event: WheelEvent): void {
  if (viewportMode.value === 'responsive') return
  const scale = wheelDeltaScale(event)
  if (event.ctrlKey || event.metaKey) {
    event.preventDefault()
    const bounds = canvasViewport.value?.getBoundingClientRect()
    if (!bounds) return
    const point = { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
    setCanvasZoom(canvasZoom.value * Math.exp(-event.deltaY * scale * 0.002), point)
    return
  }
  if (!canvasOwnsInput.value) return
  event.preventDefault()
  continueWheelPanGesture()
  panCanvasByWheel(event.deltaX * scale, event.deltaY * scale)
}

function startCanvasPan(event: PointerEvent): void {
  const accepted = viewportMode.value !== 'responsive'
    && (event.button === 1 || (event.button === 0 && spacePressed.value))
  if (!accepted) return
  event.preventDefault()
  isPanning.value = true
  panPointerId = event.pointerId
  panStart = { x: event.clientX, y: event.clientY, panX: canvasPan.value.x, panY: canvasPan.value.y }
  if (event.isTrusted) canvasViewport.value?.setPointerCapture(event.pointerId)
}

function moveCanvasPan(event: PointerEvent): void {
  if (!isPanning.value || event.pointerId !== panPointerId) return
  canvasPan.value = {
    x: panStart.panX + event.clientX - panStart.x,
    y: panStart.panY + event.clientY - panStart.y,
  }
}

function stopCanvasPan(event: PointerEvent): void {
  if (event.pointerId !== panPointerId) return
  isPanning.value = false
  panPointerId = undefined
}

function selectCanvasPoint(event: MouseEvent): void {
  const frameBounds = previewFrame.value?.getBoundingClientRect()
  if (!frameBounds) return
  previewFrame.value?.contentWindow?.postMessage({
    channel: 'vue-designer',
    session: previewSession.value,
    type: 'select-at-point',
    clientX: (event.clientX - frameBounds.left) / canvasZoom.value,
    clientY: (event.clientY - frameBounds.top) / canvasZoom.value,
  }, '*')
}

function handleShortcut(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null
  const isEditing = target?.matches('input, textarea, select, [contenteditable="true"]') ?? false
  if (event.code === 'Space' && !isEditing) {
    spacePressed.value = true
    event.preventDefault()
  }
  if (event.key === 'Escape' && aiPromptOpen.value) {
    closeAiPrompt()
    return
  }
  if (event.key === 'Escape') {
    escapeDeselecting = true
    closeContextMenu()
    closeInsertPicker()
    deselectNode()
  }
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
  } else if (!isEditing && (event.ctrlKey || event.metaKey) && (event.key === '+' || event.key === '=')) {
    event.preventDefault()
    setCanvasZoom(canvasZoom.value * 1.2)
  } else if (!isEditing && (event.ctrlKey || event.metaKey) && event.key === '-') {
    event.preventDefault()
    setCanvasZoom(canvasZoom.value / 1.2)
  } else if (!isEditing && (event.ctrlKey || event.metaKey) && event.key === '0') {
    event.preventDefault()
    setCanvasZoom(1)
  }
}

function handleKeyUp(event: KeyboardEvent): void {
  if (event.code === 'Space') spacePressed.value = false
  if (event.key === 'Escape') {
    requestAnimationFrame(() => {
      escapeDeselecting = false
    })
  }
}

import.meta.hot?.on('vue-designer:document-changed', handleExternalChange)
import.meta.hot?.on('vue-designer:components-changed', handleComponentsChanged)

onMounted(() => {
  window.addEventListener('keydown', handleShortcut)
  window.addEventListener('keyup', handleKeyUp)
  window.addEventListener('message', handlePreviewMessage)
  window.addEventListener('wheel', continueCanvasWheelOutsideViewport, { capture: true, passive: false })
  window.addEventListener('pointerdown', closeContextMenu)
  canvasResizeObserver = new ResizeObserver(([entry]) => {
    if (!entry) return
    const { width, height } = entry.contentRect
    canvasSize.value = { width: Math.floor(width), height: Math.floor(height) }
    if (viewportMode.value === 'responsive') canvasPan.value = { x: 0, y: 0 }
  })
  if (canvasViewport.value) canvasResizeObserver.observe(canvasViewport.value)
  void loadDocuments()
})

defineExpose({ hasUnsavedChanges })

onUnmounted(() => {
  window.removeEventListener('keydown', handleShortcut)
  window.removeEventListener('keyup', handleKeyUp)
  window.removeEventListener('message', handlePreviewMessage)
  window.removeEventListener('wheel', continueCanvasWheelOutsideViewport, { capture: true })
  window.removeEventListener('pointerdown', closeContextMenu)
  canvasResizeObserver?.disconnect()
  window.clearTimeout(sourcePreviewTimer)
  window.clearTimeout(wheelPanTimer)
  import.meta.hot?.off('vue-designer:document-changed', handleExternalChange)
  import.meta.hot?.off('vue-designer:components-changed', handleComponentsChanged)
})
</script>

<template>
  <div class="studio">
    <header class="topbar">
      <div class="brand">
        <button class="back-link" title="All designs" @click="showDesigns"><ArrowLeft :size="15" />Designs</button>
        <span v-if="readOnly" class="read-only-badge" title="This build is read-only. Run the dev server to edit designs."><Eye :size="14" />Read-only</span>
      </div>
      <div class="document-title">
        <FileCode2 :size="14" />
        <span>{{ activeDocument?.path ?? 'No document selected' }}</span>
        <span class="status-dot" :class="saveState" />
      </div>
      <div class="actions">
        <div class="viewport-switcher" aria-label="Preview viewport">
          <button :class="{ active: viewportMode === 'responsive' }" title="Responsive viewport" @click="setViewportMode('responsive')">
            <Maximize2 :size="14" /><span>Responsive</span>
          </button>
          <button :class="{ active: viewportMode === 'desktop' }" title="Desktop viewport (1440 × 900)" @click="setViewportMode('desktop')">
            <Monitor :size="14" /><span>Desktop</span>
          </button>
          <button :class="{ active: viewportMode === 'tablet' }" title="Tablet viewport (768 × 1024)" @click="setViewportMode('tablet')">
            <Tablet :size="14" /><span>Tablet</span>
          </button>
          <button :class="{ active: viewportMode === 'mobile' }" title="Mobile viewport (390 × 844)" @click="setViewportMode('mobile')">
            <Smartphone :size="14" /><span>Mobile</span>
          </button>
        </div>
        <template v-if="!readOnly">
          <span class="save-state">{{ stateLabel }}</span>
          <div class="history-actions" aria-label="Document history">
            <button :disabled="!canUndo" title="Undo (Ctrl+Z)" aria-label="Undo" @click="undo"><Undo2 :size="15" /></button>
            <button :disabled="!canRedo" title="Redo (Ctrl+Y)" aria-label="Redo" @click="redo"><Redo2 :size="15" /></button>
          </div>
          <button class="save-button" :disabled="saveState === 'clean' || saveState === 'saving'" @click="save"><Save :size="15" />Save</button>
        </template>
      </div>
    </header>

    <main class="workspace" :class="{ 'sidebar-collapsed': !sidebarOpen, 'inspector-collapsed': !inspectorOpen }">
      <aside class="sidebar" :class="{ collapsed: !sidebarOpen }">
        <div class="panel-heading">
          <span v-if="sidebarOpen">{{ sidebarView === 'layers' ? 'Layers' : 'Components' }}</span>
          <div v-if="sidebarOpen" class="panel-heading-actions">
            <button title="Refresh project" aria-label="Refresh project" @click="loadDocuments"><RefreshCw :size="14" /></button>
            <button title="Collapse left panel" aria-label="Collapse left panel" @click="sidebarOpen = false"><PanelLeftClose :size="15" /></button>
          </div>
          <button v-else title="Expand left panel" aria-label="Expand left panel" @click="sidebarOpen = true"><PanelLeftOpen :size="15" /></button>
        </div>
        <div v-if="sidebarOpen" class="sidebar-content">
          <template v-if="sidebarView === 'layers'">
            <div class="document-picker">
              <FileCode2 :size="15" />
              <select :value="path" aria-label="Active document" @change="switchDocument(($event.target as HTMLSelectElement).value)">
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
                :collapsed-ids="collapsedIds"
                :drag-kind="dragKind"
                :dragged-node="draggedNode"
                @select="selectNode"
                @toggle-collapse="toggleCollapse"
                @drag-node="startNodeDrag"
                @drag-end="endTreeDrag"
                @drop-node="handleTreeDrop"
                @context-menu="openContextMenu"
              />
            </ul>
            <div v-else-if="documentMissing" class="empty-state">
              <code>{{ path }}</code> is not a design in this project.
              <button class="back-link" @click="showDesigns"><ArrowLeft :size="14" />All designs</button>
            </div>
            <div v-else class="empty-state">Loading design...</div>
            <div v-if="activeDocument?.diagnostics.length" class="tree-diagnostic">{{ activeDocument.diagnostics[0]?.message }}</div>
          </template>
          <template v-else>
            <div class="palette-intro">Insert into <strong>{{ selectedNode?.label ?? 'a selected container' }}</strong></div>
            <input v-if="components.length" v-model="componentQuery" class="palette-search" type="search" placeholder="Search components" aria-label="Search components">
            <template v-for="group in componentGroups" :key="group.id">
              <div class="layers-heading">{{ group.label }}</div>
              <div class="component-palette">
                <button v-for="component in group.components" :key="component.id" :disabled="!canContainChildren(selectedNode)" :title="selectedNode ? `Insert <${component.tag}> into ${selectedNode.label}` : 'Select a container first'" draggable="true" @dragstart="startComponentDrag($event, component)" @dragend="endTreeDrag" @click="insertComponent(component)">
                  <span class="component-glyph"><Component :size="14" /></span>
                  <span><strong>{{ component.label }}</strong><small>{{ component.category }}</small></span>
                  <Plus :size="13" />
                </button>
              </div>
            </template>
            <div v-if="components.length && !componentGroups.length" class="empty-state">No components match “{{ componentQuery }}”.</div>
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
        <div v-if="sidebarOpen" class="sidebar-switcher" aria-label="Sidebar view">
          <button :class="{ active: sidebarView === 'layers' }" @click="sidebarView = 'layers'"><Layers3 :size="15" />Layers</button>
          <button v-if="framework?.capabilities.components && !readOnly" :class="{ active: sidebarView === 'components' }" @click="sidebarView = 'components'"><Component :size="15" />Components</button>
        </div>
      </aside>

      <div class="center-workspace" :class="{ 'source-collapsed': !sourceOpen }">
        <section class="canvas-panel">
          <div class="canvas-label">
            <span>Canvas · {{ viewportLabel }}</span>
            <div class="canvas-zoom" aria-label="Canvas zoom">
              <button :disabled="viewportMode === 'responsive'" title="Zoom out" aria-label="Zoom out" @click="setCanvasZoom(canvasZoom / 1.2)"><Minus :size="13" /></button>
              <button :disabled="viewportMode === 'responsive'" title="Reset zoom to 100%" @click="setCanvasZoom(1)">{{ zoomLabel }}</button>
              <button :disabled="viewportMode === 'responsive'" title="Zoom in" aria-label="Zoom in" @click="setCanvasZoom(canvasZoom * 1.2)"><Plus :size="13" /></button>
              <button :disabled="viewportMode === 'responsive'" title="Fit viewport" aria-label="Fit viewport" @click="fitCanvas"><Maximize2 :size="13" /></button>
            </div>
            <button
              class="canvas-scroll-toggle"
              :class="{ active: canvasOwnsInput }"
              :disabled="viewportMode === 'responsive'"
              :aria-pressed="canvasOwnsInput"
              :title="viewportMode === 'responsive'
                ? 'Input routing is unavailable in responsive view'
                : canvasOwnsInput ? 'Canvas receives input; click selects and drag pans' : 'Preview receives input'"
              @click="toggleCanvasInputMode"
            >
              <MousePointer2 :size="13" />
              {{ canvasOwnsInput ? 'Canvas' : 'Preview' }}
            </button>
          </div>
          <div
            ref="canvasViewport"
            class="canvas-viewport"
            :class="{ 'pan-ready': spacePressed && viewportMode !== 'responsive', panning: isPanning }"
            @wheel="handleCanvasWheel"
            @pointerdown="startCanvasPan"
            @pointermove="moveCanvasPan"
            @pointerup="stopCanvasPan"
            @pointercancel="stopCanvasPan"
          >
            <div class="canvas-scene" :style="canvasSceneStyle">
              <div class="preview-frame">
                <iframe v-if="previewUrl" ref="previewFrame" :key="previewUrl" :src="previewUrl" :sandbox="previewSandbox" :title="`${framework?.documentLabel ?? 'Document'} preview`" @load="handlePreviewLoad" />
                <div v-else class="preview-empty">Select a document to begin.</div>
              </div>
            </div>
            <div v-if="spacePressed && viewportMode !== 'responsive'" class="canvas-pan-capture" />
            <div v-if="canvasOwnsInput && viewportMode !== 'responsive'" class="canvas-input-capture" @click="selectCanvasPoint" />
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
          <SourceEditor
            v-if="framework"
            v-show="sourceOpen"
            :key="`${framework.sourceLanguage}:${activeDocument?.path ?? ''}`"
            ref="sourceEditor"
            :source="source"
            :file-name="activeDocument?.path.split('/').at(-1) ?? `document${framework.fileExtension}`"
            :language="framework.sourceLanguage"
            :document-label="framework.documentLabel"
            :disabled="readOnly || !activeDocument"
            @input="updateSource"
            @blur="commitSourceEdit"
            @cursor="syncSelectionFromSource"
          />
        </section>
      </div>

      <aside class="inspector-panel" :class="{ collapsed: !inspectorOpen }">
        <div class="inspector-tabs">
          <button v-if="inspectorOpen" :class="{ active: inspectorView === 'content' }" @click="inspectorView = 'content'">Props</button>
          <button v-if="inspectorOpen && framework?.capabilities.styles" :class="{ active: inspectorView === 'style' }" @click="inspectorView = 'style'">Style</button>
          <button class="panel-collapse-button" :title="inspectorOpen ? 'Collapse right panel' : 'Expand right panel'" :aria-label="inspectorOpen ? 'Collapse right panel' : 'Expand right panel'" @click="inspectorOpen = !inspectorOpen">
            <PanelRightClose v-if="inspectorOpen" :size="15" /><PanelRightOpen v-else :size="15" />
          </button>
        </div>

        <div v-if="inspectorOpen && inspectorView === 'content'" class="inspector-content">
          <div v-if="!selectedNode" class="inspector-empty">
            <strong>Select a layer</strong>
            <span>Text and attributes for the selected element will appear here.</span>
          </div>
          <template v-else>
            <div class="selection-summary">
              <span class="tree-kind">{{ selectedNode.kind === 'component' ? 'C' : selectedNode.kind === 'text' ? 'T' : 'E' }}</span>
              <div><strong>{{ selectedNode.label }}</strong><small>{{ selectedNode.kind }}</small></div>
              <div v-if="!readOnly" class="selection-actions">
                <button :disabled="!selectedNode.editable" title="Duplicate layer" aria-label="Duplicate layer" @click="duplicateSelectedNode"><Plus :size="14" /></button>
                <button :disabled="!selectedNode.editable" title="Delete layer" aria-label="Delete layer" @click="removeSelectedNode"><Trash2 :size="14" /></button>
              </div>
            </div>
            <section v-if="selectedNode.kind === 'text'" class="inspector-section">
              <label for="selected-text">Text content</label>
              <textarea id="selected-text" :value="selectedNode.value" :readonly="inspectorLocked" @input="updateSelectedText" />
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
                    :disabled="inspectorLocked || propIsExpression(prop)"
                    @change="updateComponentProp(prop, $event)"
                  />
                  <select
                    v-else-if="prop.control === 'select'"
                    :value="propValue(prop)"
                    :disabled="inspectorLocked || propIsExpression(prop)"
                    @change="updateComponentProp(prop, $event)"
                  >
                    <option v-if="!prop.required" value="">Default</option>
                    <option v-for="option in prop.options" :key="option" :value="option">{{ option }}</option>
                  </select>
                  <input
                    v-else
                    :type="prop.control === 'number' ? 'number' : prop.control === 'color' ? 'color' : 'text'"
                    :value="propValue(prop)"
                    :readonly="inspectorLocked"
                    :disabled="propIsExpression(prop)"
                    @change="updateComponentProp(prop, $event)"
                  />
                  <button v-if="selectedAttribute(prop.name) && !prop.required && !inspectorLocked" title="Use default value" @click="clearComponentProp(prop)">Reset</button>
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
                  :readonly="inspectorLocked"
                  :disabled="!attribute.editable"
                  @change="updateSelectedAttribute(attribute.name, $event)"
                />
              </label>
            </section>
            <div v-if="selectedNode.kind !== 'text' && !selectedNode.attributes.length && !selectedMetadataProps.length" class="inspector-empty compact">No attributes on this layer.</div>
            <div v-if="!selectedNode.editable" class="locked-notice">{{ selectedNode.lockedReason }}</div>
            <div v-else-if="readOnly" class="read-only-notice">Read-only build. Run the dev server to edit this design.</div>
          </template>
        </div>

        <div v-else-if="inspectorOpen && inspectorView === 'style' && framework?.capabilities.styles" class="inspector-content style-inspector">
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
                <select v-if="property === 'display'" :value="styleValue(property)" :disabled="inspectorLocked" @change="updateStyle(property, $event)">
                  <option value="">Unset</option>
                  <option v-for="value in ['block', 'flex', 'grid', 'inline-flex', 'none']" :key="value" :value="value">{{ value }}</option>
                </select>
                <select v-else-if="property === 'text-align'" :value="styleValue(property)" :disabled="inspectorLocked" @change="updateStyle(property, $event)">
                  <option value="">Unset</option>
                  <option v-for="value in ['left', 'center', 'right', 'justify']" :key="value" :value="value">{{ value }}</option>
                </select>
                <div v-else-if="property === 'color' || property === 'background-color'" class="color-control">
                  <input type="color" :disabled="inspectorLocked" :value="styleValue(property) || '#000000'" @change="updateStyle(property, $event)" />
                  <input :readonly="inspectorLocked" :value="styleValue(property)" placeholder="Unset" @change="updateStyle(property, $event)" />
                </div>
                <input v-else :readonly="inspectorLocked" :value="styleValue(property)" placeholder="Unset" @change="updateStyle(property, $event)" />
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
    <div
      v-if="contextMenu"
      class="node-context-menu"
      role="menu"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      @pointerdown.stop
    >
            <button v-if="readOnly" role="menuitem" @click="copyContextNode">Copy</button>
            <template v-else>
            <button role="menuitem" :disabled="!canContainChildren(selectedNode)" @click="openInsertPicker('inside')">Insert inside...</button>
            <button role="menuitem" @click="openInsertPicker('after')">Insert after...</button>
            <hr />
            <button role="menuitem" @click="copyContextNode">Copy</button>
            <button role="menuitem" @click="duplicateContextNode">Duplicate</button>
            <hr />
            <button role="menuitem" :disabled="!canContainChildren(selectedNode)" @click="pasteContextNode('inside')">Paste inside</button>
            <button role="menuitem" @click="pasteContextNode('after')">Paste after</button>
            <hr />
            <button class="danger" role="menuitem" @click="removeContextNode">Delete</button>
            </template>
          </div>
    <div v-if="aiPromptOpen && selectedNode && !readOnly" class="ai-prompt-backdrop" @pointerdown.self="closeAiPrompt">
      <form class="ai-prompt" role="dialog" aria-modal="true" aria-labelledby="ai-prompt-title" @submit.prevent="runAiEdit">
        <header>
          <div>
            <strong id="ai-prompt-title"><Sparkles :size="15" />Edit {{ selectedNode.label }} with AI</strong>
            <small>Cursor proposes a source change you can preview, undo, or save</small>
          </div>
          <button type="button" aria-label="Close AI prompt" :disabled="aiRunning" @click="closeAiPrompt">×</button>
        </header>
        <div class="ai-prompt-body">
          <textarea
            v-model="aiPrompt"
            autofocus
            :disabled="aiRunning"
            placeholder="Describe the change..."
            @keydown.enter="submitAiPromptShortcut"
          />
        </div>
        <footer>
          <div class="ai-prompt-settings">
            <label>
              <span>Model</span>
              <select
                v-model="aiModel"
                :title="aiModelsState === 'error' ? aiModelsError : selectedAiModel?.description ?? 'Cursor model'"
                :disabled="aiRunning || aiModelsState !== 'ready'"
              >
                <option v-if="aiModelsState === 'loading'" :value="aiModel">Loading models...</option>
                <option v-else-if="aiModelsState === 'error'" :value="aiModel">Models unavailable</option>
                <option v-for="model in aiModels" :key="model.id" :value="model.id">{{ model.displayName }}</option>
              </select>
            </label>
            <label v-for="parameter in selectedAiModel?.parameters ?? []" :key="parameter.id">
              <span>{{ parameter.displayName ?? parameter.id }}</span>
              <select v-model="aiParams[parameter.id]" :disabled="aiRunning">
                <option value="">Default</option>
                <option v-for="option in parameter.values" :key="option.value" :value="option.value">{{ option.displayName ?? option.value }}</option>
              </select>
            </label>
          </div>
          <div class="ai-prompt-actions">
            <button type="button" :disabled="aiRunning" @click="closeAiPrompt">Cancel</button>
            <button type="submit" :disabled="!aiPrompt.trim() || aiRunning"><Sparkles :size="13" />{{ aiRunning ? 'Working...' : 'Apply' }}</button>
          </div>
        </footer>
      </form>
    </div>
    <div v-if="insertPicker && !readOnly" class="insert-picker-backdrop" @pointerdown.self="closeInsertPicker">
      <section class="insert-picker" role="dialog" aria-modal="true" aria-labelledby="insert-picker-title">
        <header>
          <div><strong id="insert-picker-title">Insert {{ insertPicker.position }}</strong><small>Choose a project component or native element</small></div>
          <button aria-label="Close insert picker" @click="closeInsertPicker">×</button>
        </header>
        <div class="insert-picker-content">
          <section>
            <input v-if="components.length" v-model="componentQuery" class="palette-search" type="search" placeholder="Search components" aria-label="Search components">
            <template v-for="group in componentGroups" :key="group.id">
              <h3>{{ group.label }}</h3>
              <div class="component-palette">
                <button v-for="component in group.components" :key="component.id" @click="pickComponent(component)">
                  <span class="component-glyph"><Component :size="14" /></span><span><strong>{{ component.label }}</strong><small>{{ component.category }}</small></span><Plus :size="13" />
                </button>
              </div>
            </template>
          </section>
          <section>
            <h3>Native elements</h3>
            <div class="component-palette native-palette">
              <button v-for="element in nativeElements" :key="element.tag" @click="pickNative(element)">
                <span class="component-glyph"><Braces :size="14" /></span><span><strong>{{ element.label }}</strong><small>{{ element.category }}</small></span><Plus :size="13" />
              </button>
            </div>
          </section>
        </div>
      </section>
    </div>
  </div>
</template>

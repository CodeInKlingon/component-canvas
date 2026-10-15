<script setup lang="ts">
import { computed, inject, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  ArrowLeft,
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
import AiPromptDialog from '../components/AiPromptDialog.vue'
import InsertPickerDialog from '../components/InsertPickerDialog.vue'
import NodeContextMenu from '../components/NodeContextMenu.vue'
import PaletteItem from '../components/PaletteItem.vue'
import ReadOnlyBadge from '../components/ReadOnlyBadge.vue'
import SelectionSummary from '../components/SelectionSummary.vue'
import UiButton from '../components/ui/UiButton.vue'
import UiButtonGroup from '../components/ui/UiButtonGroup.vue'
import UiColorInput from '../components/ui/UiColorInput.vue'
import UiEmptyState from '../components/ui/UiEmptyState.vue'
import UiField from '../components/ui/UiField.vue'
import UiInput from '../components/ui/UiInput.vue'
import UiNotice from '../components/ui/UiNotice.vue'
import UiPanelHeader from '../components/ui/UiPanelHeader.vue'
import UiSectionHeading from '../components/ui/UiSectionHeading.vue'
import UiSegmentedControl, { type UiSegmentOption } from '../components/ui/UiSegmentedControl.vue'
import UiSelect from '../components/ui/UiSelect.vue'
import UiTabs from '../components/ui/UiTabs.vue'
import UiTextarea from '../components/ui/UiTextarea.vue'
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
const styleOptions: Record<string, string[]> = {
  display: ['block', 'flex', 'grid', 'inline-flex', 'none'],
  'text-align': ['left', 'center', 'right', 'justify'],
}
const viewportOptions: UiSegmentOption<ViewportMode>[] = [
  { value: 'responsive', label: 'Responsive', icon: Maximize2, title: 'Responsive viewport' },
  { value: 'desktop', label: 'Desktop', icon: Monitor, title: 'Desktop viewport (1440 × 900)' },
  { value: 'tablet', label: 'Tablet', icon: Tablet, title: 'Tablet viewport (768 × 1024)' },
  { value: 'mobile', label: 'Mobile', icon: Smartphone, title: 'Mobile viewport (390 × 844)' },
]
const sidebarOptions = computed<UiSegmentOption<'layers' | 'components'>[]>(() => [
  { value: 'layers', label: 'Layers', icon: Layers3 },
  ...(framework.value?.capabilities.components && !readOnly ? [{ value: 'components' as const, label: 'Components', icon: Component }] : []),
])
const inspectorTabs = computed(() => [
  { value: 'content' as const, label: 'Props' },
  ...(framework.value?.capabilities.styles ? [{ value: 'style' as const, label: 'Style' }] : []),
])
const documentOptions = computed(() => documents.value.map((document) => ({ value: document.path, label: document.name })))
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
  selectNode(node, false)
  contextMenu.value = { nodeId: node.id, x: event.clientX, y: event.clientY }
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
  if (event.key === 'Escape') {
    escapeDeselecting = true
    closeContextMenu()
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
        <UiButton variant="ghost" class="back-link" title="All designs" @click="showDesigns"><template #icon><ArrowLeft :size="15" /></template>Designs</UiButton>
        <ReadOnlyBadge v-if="readOnly" />
      </div>
      <div class="document-title">
        <FileCode2 :size="14" />
        <span>{{ activeDocument?.path ?? 'No document selected' }}</span>
        <span class="status-dot" :class="saveState" />
      </div>
      <div class="actions">
        <UiSegmentedControl :model-value="viewportMode" class="viewport-switcher" :options="viewportOptions" aria-label="Preview viewport" @update:model-value="setViewportMode" />
        <template v-if="!readOnly">
          <span class="save-state">{{ stateLabel }}</span>
          <UiButtonGroup aria-label="Document history">
            <UiButton variant="ghost" icon-only :disabled="!canUndo" label="Undo (Ctrl+Z)" aria-label="Undo" @click="undo"><Undo2 :size="15" /></UiButton>
            <UiButton variant="ghost" icon-only :disabled="!canRedo" label="Redo (Ctrl+Y)" aria-label="Redo" @click="redo"><Redo2 :size="15" /></UiButton>
          </UiButtonGroup>
          <UiButton variant="primary" size="lg" :disabled="saveState === 'clean' || saveState === 'saving'" @click="save"><template #icon><Save :size="15" /></template>Save</UiButton>
        </template>
      </div>
    </header>

    <main class="workspace" :class="{ 'sidebar-collapsed': !sidebarOpen, 'inspector-collapsed': !inspectorOpen }">
      <aside class="sidebar" :class="{ collapsed: !sidebarOpen }">
        <UiPanelHeader class="panel-heading" :title="sidebarOpen ? (sidebarView === 'layers' ? 'Layers' : 'Components') : undefined">
          <template #actions>
            <template v-if="sidebarOpen">
              <UiButton variant="ghost" size="sm" icon-only label="Refresh project" @click="loadDocuments"><RefreshCw :size="14" /></UiButton>
              <UiButton variant="ghost" size="sm" icon-only label="Collapse left panel" @click="sidebarOpen = false"><PanelLeftClose :size="15" /></UiButton>
            </template>
            <UiButton v-else variant="ghost" size="sm" icon-only label="Expand left panel" @click="sidebarOpen = true"><PanelLeftOpen :size="15" /></UiButton>
          </template>
        </UiPanelHeader>
        <div v-if="sidebarOpen" class="sidebar-content">
          <template v-if="sidebarView === 'layers'">
            <UiSelect class="document-picker" :value="path" :options="documentOptions" aria-label="Active document" @change="switchDocument(($event.target as HTMLSelectElement).value)">
              <template #leading><FileCode2 :size="15" /></template>
            </UiSelect>
            <UiEmptyState v-if="loading">Scanning project...</UiEmptyState>
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
            <UiEmptyState v-else-if="documentMissing">
              <code>{{ path }}</code> is not a design in this project.
              <template #actions><UiButton variant="ghost" class="back-link" @click="showDesigns"><template #icon><ArrowLeft :size="14" /></template>All designs</UiButton></template>
            </UiEmptyState>
            <UiEmptyState v-else>Loading design...</UiEmptyState>
            <UiNotice v-if="activeDocument?.diagnostics.length" class="panel-notice" tone="danger">{{ activeDocument.diagnostics[0]?.message }}</UiNotice>
          </template>
          <template v-else>
            <UiNotice class="panel-notice">Insert into <strong>{{ selectedNode?.label ?? 'a selected container' }}</strong></UiNotice>
            <UiInput v-if="components.length" v-model="componentQuery" class="palette-search" type="search" placeholder="Search components" aria-label="Search components" />
            <template v-for="group in componentGroups" :key="group.id">
              <UiSectionHeading class="palette-heading">{{ group.label }}</UiSectionHeading>
              <div class="palette-list">
                <PaletteItem
                  v-for="component in group.components"
                  :key="component.id"
                  :label="component.label"
                  :category="component.category"
                  kind="component"
                  :disabled="!canContainChildren(selectedNode)"
                  :title="selectedNode ? `Insert <${component.tag}> into ${selectedNode.label}` : 'Select a container first'"
                  draggable="true"
                  @dragstart="startComponentDrag($event, component)"
                  @dragend="endTreeDrag"
                  @click="insertComponent(component)"
                />
              </div>
            </template>
            <UiEmptyState v-if="components.length && !componentGroups.length">No components match “{{ componentQuery }}”.</UiEmptyState>
            <UiSectionHeading class="palette-heading">Native elements</UiSectionHeading>
            <div class="palette-list">
              <PaletteItem
                v-for="element in nativeElements"
                :key="element.tag"
                :label="element.label"
                :category="element.category"
                kind="native"
                :disabled="!canContainChildren(selectedNode)"
                :title="selectedNode ? `Insert into ${selectedNode.label}` : 'Select a container first'"
                draggable="true"
                @dragstart="startNativeDrag($event, element)"
                @dragend="endTreeDrag"
                @click="insertNative(element)"
              />
            </div>
          </template>
        </div>
        <UiSegmentedControl v-if="sidebarOpen" v-model="sidebarView" class="sidebar-switcher" appearance="pills" size="sm" :options="sidebarOptions" aria-label="Sidebar view" />
      </aside>

      <div class="center-workspace" :class="{ 'source-collapsed': !sourceOpen }">
        <section class="canvas-panel">
          <UiPanelHeader variant="caption" :title="`Canvas · ${viewportLabel}`">
            <template #actions>
              <UiButtonGroup aria-label="Canvas zoom">
                <UiButton variant="ghost" size="xs" icon-only :disabled="viewportMode === 'responsive'" label="Zoom out" @click="setCanvasZoom(canvasZoom / 1.2)"><Minus :size="13" /></UiButton>
                <UiButton variant="ghost" size="xs" mono :disabled="viewportMode === 'responsive'" title="Reset zoom to 100%" @click="setCanvasZoom(1)">{{ zoomLabel }}</UiButton>
                <UiButton variant="ghost" size="xs" icon-only :disabled="viewportMode === 'responsive'" label="Zoom in" @click="setCanvasZoom(canvasZoom * 1.2)"><Plus :size="13" /></UiButton>
                <UiButton variant="ghost" size="xs" icon-only :disabled="viewportMode === 'responsive'" label="Fit viewport" @click="fitCanvas"><Maximize2 :size="13" /></UiButton>
              </UiButtonGroup>
              <UiButton
                class="canvas-input-toggle"
                size="xs"
                :active="canvasOwnsInput && viewportMode !== 'responsive'"
                :disabled="viewportMode === 'responsive'"
                :aria-pressed="canvasOwnsInput"
                :title="viewportMode === 'responsive'
                  ? 'Input routing is unavailable in responsive view'
                  : canvasOwnsInput ? 'Canvas receives input; click selects and drag pans' : 'Preview receives input'"
                @click="toggleCanvasInputMode"
              >
                <template #icon><MousePointer2 :size="13" /></template>
                {{ canvasOwnsInput ? 'Canvas' : 'Preview' }}
              </UiButton>
            </template>
          </UiPanelHeader>
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
                <UiEmptyState v-else variant="centered">Select a document to begin.</UiEmptyState>
              </div>
            </div>
            <div v-if="spacePressed && viewportMode !== 'responsive'" class="canvas-pan-capture" />
            <div v-if="canvasOwnsInput && viewportMode !== 'responsive'" class="canvas-input-capture" @click="selectCanvasPoint" />
          </div>
        </section>
        <section class="source-panel">
          <UiPanelHeader>
            <template #title><Code2 :size="14" />Source</template>
            <code class="source-panel-name">{{ activeDocument?.name ?? 'No document' }}</code>
            <template #actions>
              <UiButton variant="ghost" size="sm" icon-only :label="sourceOpen ? 'Collapse source' : 'Open source'" @click="sourceOpen = !sourceOpen">
                <PanelBottomClose v-if="sourceOpen" :size="15" /><PanelBottomOpen v-else :size="15" />
              </UiButton>
            </template>
          </UiPanelHeader>
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
        <UiTabs v-model="inspectorView" class="inspector-tabs" :tabs="inspectorOpen ? inspectorTabs : []">
          <template #trailing>
            <UiButton variant="ghost" size="sm" icon-only :label="inspectorOpen ? 'Collapse right panel' : 'Expand right panel'" @click="inspectorOpen = !inspectorOpen">
              <PanelRightClose v-if="inspectorOpen" :size="15" /><PanelRightOpen v-else :size="15" />
            </UiButton>
          </template>
        </UiTabs>

        <div v-if="inspectorOpen && inspectorView === 'content'" class="inspector-content">
          <UiEmptyState v-if="!selectedNode" title="Select a layer">Text and attributes for the selected element will appear here.</UiEmptyState>
          <template v-else>
            <SelectionSummary :node="selectedNode" :subtitle="selectedNode.kind">
              <template v-if="!readOnly" #actions>
                <UiButton variant="ghost" size="sm" icon-only :disabled="!selectedNode.editable" label="Duplicate layer" @click="duplicateSelectedNode"><Plus :size="14" /></UiButton>
                <UiButton variant="ghost" size="sm" icon-only danger :disabled="!selectedNode.editable" label="Delete layer" @click="removeSelectedNode"><Trash2 :size="14" /></UiButton>
              </template>
            </SelectionSummary>
            <section v-if="selectedNode.kind === 'text'" class="inspector-section">
              <UiField label="Text content">
                <UiTextarea :value="selectedNode.value" mono :readonly="inspectorLocked" @input="updateSelectedText" />
              </UiField>
            </section>
            <section v-if="selectedMetadataProps.length" class="inspector-section">
              <UiSectionHeading variant="title">{{ selectedComponent ? 'Props' : 'Attributes' }}</UiSectionHeading>
              <UiField
                v-for="prop in selectedMetadataProps"
                :key="prop.name"
                :label="prop.name"
                :hint="prop.required ? 'Required' : prop.type"
                :title="prop.description || prop.type"
              >
                <div class="prop-control">
                  <input
                    v-if="prop.control === 'checkbox'"
                    type="checkbox"
                    :checked="propChecked(prop)"
                    :disabled="inspectorLocked || propIsExpression(prop)"
                    @change="updateComponentProp(prop, $event)"
                  />
                  <UiSelect
                    v-else-if="prop.control === 'select'"
                    :value="propValue(prop)"
                    :options="prop.options ?? []"
                    :empty-option="prop.required ? undefined : 'Default'"
                    mono
                    :disabled="inspectorLocked || propIsExpression(prop)"
                    @change="updateComponentProp(prop, $event)"
                  />
                  <UiColorInput
                    v-else-if="prop.control === 'color'"
                    :value="propValue(prop)"
                    :label="prop.name"
                    :readonly="inspectorLocked"
                    :disabled="propIsExpression(prop)"
                    @change="updateComponentProp(prop, $event)"
                  />
                  <UiInput
                    v-else
                    :type="prop.control === 'number' ? 'number' : 'text'"
                    :value="propValue(prop)"
                    mono
                    :readonly="inspectorLocked"
                    :disabled="propIsExpression(prop)"
                    @change="updateComponentProp(prop, $event)"
                  />
                  <UiButton v-if="selectedAttribute(prop.name) && !prop.required && !inspectorLocked" variant="ghost" size="sm" title="Use default value" @click="clearComponentProp(prop)">Reset</UiButton>
                </div>
                <template v-if="propIsExpression(prop)" #note><small class="expression-note">Expression props are source-only.</small></template>
              </UiField>
            </section>
            <section v-if="selectedNode.attributes.some((attribute) => !isMetadataProp(attribute.name))" class="inspector-section">
              <UiSectionHeading variant="title">Attributes</UiSectionHeading>
              <UiField
                v-for="attribute in selectedNode.attributes.filter((item) => !isMetadataProp(item.name))"
                :key="attribute.name"
                :label="attribute.name"
                :hint="attribute.editable ? undefined : 'Expression'"
              >
                <UiInput
                  :value="attribute.value"
                  mono
                  :readonly="inspectorLocked"
                  :disabled="!attribute.editable"
                  @change="updateSelectedAttribute(attribute.name, $event)"
                />
              </UiField>
            </section>
            <UiEmptyState v-if="selectedNode.kind !== 'text' && !selectedNode.attributes.length && !selectedMetadataProps.length" compact>No attributes on this layer.</UiEmptyState>
            <UiNotice v-if="!selectedNode.editable" class="panel-notice" tone="warning">{{ selectedNode.lockedReason }}</UiNotice>
            <UiNotice v-else-if="readOnly" class="panel-notice">Read-only build. Run the dev server to edit this design.</UiNotice>
          </template>
        </div>

        <div v-else-if="inspectorOpen && inspectorView === 'style' && framework?.capabilities.styles" class="inspector-content">
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
      </aside>
    </main>

    <UiNotice v-if="error || previewDiagnostic" class="diagnostic" tone="danger" inline>
      <span>{{ error || previewDiagnostic?.message }}</span>
      <details v-if="previewDiagnostic?.stack">
        <summary>Details</summary>
        <pre>{{ previewDiagnostic.stack }}</pre>
      </details>
      <template #actions>
        <UiButton v-if="saveState === 'conflict'" size="sm" @click="reload">Reload from disk</UiButton>
        <UiButton v-if="saveState === 'conflict' && externalRevision" size="sm" @click="keepLocalChanges">Overwrite disk</UiButton>
        <UiButton v-if="previewDiagnostic" size="sm" @click="reloadPreview">Reload preview</UiButton>
        <UiButton size="sm" @click="error = ''; previewDiagnostic = null">Dismiss</UiButton>
      </template>
    </UiNotice>
    <NodeContextMenu
      v-if="contextMenu"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :read-only="readOnly"
      :can-insert-inside="canContainChildren(selectedNode)"
      @close="closeContextMenu"
      @insert="openInsertPicker"
      @copy="copyContextNode"
      @duplicate="duplicateContextNode"
      @paste="pasteContextNode"
      @remove="removeContextNode"
    />
    <AiPromptDialog
      v-if="aiPromptOpen && selectedNode && !readOnly"
      v-model:prompt="aiPrompt"
      v-model:model="aiModel"
      v-model:params="aiParams"
      :node-label="selectedNode.label"
      :running="aiRunning"
      :models="aiModels"
      :models-state="aiModelsState"
      :models-error="aiModelsError"
      @close="closeAiPrompt"
      @submit="runAiEdit"
    />
    <InsertPickerDialog
      v-if="insertPicker && !readOnly"
      v-model:query="componentQuery"
      :position="insertPicker.position"
      :searchable="components.length > 0"
      :groups="componentGroups"
      :natives="nativeElements"
      @close="closeInsertPicker"
      @pick-component="pickComponent"
      @pick-native="pickNative"
    />
  </div>
</template>

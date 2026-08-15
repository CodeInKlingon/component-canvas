export interface DesignerDocumentSummary {
  path: string
  name: string
}

export interface DesignerDocument extends DesignerDocumentSummary {
  source: string
  revision: string
  tree: DesignerNode[]
  diagnostics: DesignerDiagnostic[]
}

export interface DesignerFrameworkClientMetadata {
  id: string
  sourceLanguage: string
  fileExtension: string
  documentLabel: string
  capabilities: {
    styles: boolean
    components: boolean
    ai: boolean
  }
}

export interface DesignerSourceRange {
  start: number
  end: number
}

export interface DesignerDiagnostic {
  message: string
  severity: 'error' | 'warning'
  range?: DesignerSourceRange
}

export interface DesignerNode {
  id: string
  kind: 'element' | 'component' | 'text'
  label: string
  value?: string
  range: DesignerSourceRange
  editable: boolean
  capabilities: DesignerNodeCapabilities
  lockedReason?: string
  attributes: DesignerAttribute[]
  children: DesignerNode[]
}

export interface DesignerNodeCapabilities {
  canContainChildren: boolean
}

export interface ParsedDesignerDocument {
  tree: DesignerNode[]
  diagnostics: DesignerDiagnostic[]
}

export interface DesignerAttribute {
  name: string
  value: string
  kind: 'static' | 'literal-binding' | 'expression'
  editable: boolean
  range: DesignerSourceRange
}

export interface DesignerApiError {
  error: string
  currentRevision?: string
}

export interface SaveDocumentRequest {
  source: string
  revision: string
}

export interface DesignerDocumentChangedEvent {
  path: string
  revision: string
}

export interface SaveDocumentResponse {
  revision: string
}

export interface PreviewCandidateResponse {
  candidateId: string
  tree: DesignerNode[]
  diagnostics: DesignerDiagnostic[]
}

export interface DesignerSourceCandidateResponse extends PreviewCandidateResponse, DesignerSourceOperationResult {
}

export interface DesignerAiRequest {
  path: string
  source: string
  prompt: string
  selection: {
    nodeId: string
    range: DesignerSourceRange
    source: string
  }
}

export interface DesignerAiResponse {
  source: string
}

export interface DesignerComponentMetadata {
  name: string
  label: string
  category: string
  source: string
  defaultContent?: string
  props: DesignerPropMetadata[]
  events: Array<{ name: string; description: string }>
  slots: Array<{ name: string; description: string }>
}

export interface DesignerPropMetadata {
  name: string
  type: string
  description: string
  required: boolean
  default?: string
  control: 'text' | 'number' | 'checkbox' | 'select' | 'color'
  options?: string[]
}

export interface DesignerStyleDeclaration {
  property: string
  value: string
  range: DesignerSourceRange
}

export interface DesignerStyleRule {
  selector: string
  declarations: DesignerStyleDeclaration[]
  insertOffset: number
}

export interface DesignerStyleOperation {
  nodeId: string
  selector: string
  property: string
  value: string | null
}

export interface DesignerStyleCandidateResponse extends PreviewCandidateResponse {
  source: string
  rules: DesignerStyleRule[]
}

export type DesignerSourceOperation =
  | { type: 'set-text'; nodeId: string; value: string }
  | { type: 'set-attribute'; nodeId: string; name: string; value: string | number | boolean | null; binding?: boolean }
  | {
      type: 'insert-component'
      parentId: string
      name: string
      importSource: string
      defaultContent?: string
      position?: 'inside' | 'after'
    }
  | {
      type: 'insert-native'
      parentId: string
      tag: string
      contentModel: 'normal' | 'text' | 'void'
      defaultContent?: string
      defaultChildren?: string
      attributes?: Record<string, string | number | boolean>
      position?: 'inside' | 'after'
    }
  | { type: 'remove-node'; nodeId: string }
  | { type: 'duplicate-node'; nodeId: string }
  | { type: 'insert-node'; targetId: string; position: 'inside' | 'after'; source: string }
  | {
      type: 'move-node'
      nodeId: string
      targetId: string
      position: 'before' | 'inside' | 'after'
    }

export interface DesignerSourceOperationResult {
  source: string
  selectionOffset?: number
}

export class DesignerOperationError extends Error {
  override name = 'DesignerOperationError'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isStringRecord(value: unknown): value is Record<string, string | number | boolean> {
  return isRecord(value) && Object.values(value).every((item) =>
    typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean',
  )
}

export function isDesignerSourceOperation(value: unknown): value is DesignerSourceOperation {
  if (!isRecord(value) || typeof value.type !== 'string') return false
  const string = (key: string) => typeof value[key] === 'string'
  const optionalString = (key: string) => value[key] === undefined || string(key)
  const position = (allowed: string[]) => value.position === undefined || allowed.includes(String(value.position))

  switch (value.type) {
    case 'set-text':
      return string('nodeId') && string('value')
    case 'set-attribute':
      return string('nodeId') && string('name')
        && (value.value === null || ['string', 'number', 'boolean'].includes(typeof value.value))
        && (value.binding === undefined || typeof value.binding === 'boolean')
    case 'insert-component':
      return string('parentId') && string('name') && string('importSource')
        && optionalString('defaultContent') && position(['inside', 'after'])
    case 'insert-native':
      return string('parentId') && string('tag')
        && ['normal', 'text', 'void'].includes(String(value.contentModel))
        && optionalString('defaultContent') && optionalString('defaultChildren')
        && (value.attributes === undefined || isStringRecord(value.attributes))
        && position(['inside', 'after'])
    case 'remove-node':
    case 'duplicate-node':
      return string('nodeId')
    case 'insert-node':
      return string('targetId') && ['inside', 'after'].includes(String(value.position)) && string('source')
    case 'move-node':
      return string('nodeId') && string('targetId')
        && ['before', 'inside', 'after'].includes(String(value.position))
    default:
      return false
  }
}

export type PreviewToEditorMessage =
  | { channel: 'vue-designer'; session: string; type: 'ready' }
  | { channel: 'vue-designer'; session: string; type: 'pan-key-state'; pressed: boolean }
  | { channel: 'vue-designer'; session: string; type: 'canvas-wheel'; deltaX: number; deltaY: number; clientX: number; clientY: number; zoom: boolean }
  | { channel: 'vue-designer'; session: string; type: 'viewport-state'; scrollX: number; scrollY: number }
  | { channel: 'vue-designer'; session: string; type: 'select'; nodeId: string | null }
  | { channel: 'vue-designer'; session: string; type: 'ai-prompt'; nodeId: string }
  | { channel: 'vue-designer'; session: string; type: 'context-menu'; nodeId: string; clientX: number; clientY: number }
  | { channel: 'vue-designer'; session: string; type: 'computed-style'; nodeId: string; styles: Record<string, string> }
  | { channel: 'vue-designer'; session: string; type: 'diagnostic'; level: 'error' | 'warning' | 'info'; message: string; stack?: string }

export type EditorToPreviewMessage =
  | { channel: 'vue-designer'; session: string; type: 'select'; nodeId: string | null }
  | { channel: 'vue-designer'; session: string; type: 'canvas-input-mode'; enabled: boolean; selectionEnabled: boolean }
  | { channel: 'vue-designer'; session: string; type: 'select-at-point'; clientX: number; clientY: number }
  | { channel: 'vue-designer'; session: string; type: 'restore-viewport'; scrollX: number; scrollY: number }
  | { channel: 'vue-designer'; session: string; type: 'apply-style'; nodeId: string; property: string; value: string | null }

export function isPreviewToEditorMessage(value: unknown): value is PreviewToEditorMessage {
  if (!value || typeof value !== 'object') return false
  const message = value as Record<string, unknown>
  if (message.channel !== 'vue-designer' || typeof message.session !== 'string') return false
  if (message.type === 'ready') return true
  if (message.type === 'pan-key-state') return typeof message.pressed === 'boolean'
  if (message.type === 'canvas-wheel') return typeof message.deltaX === 'number' && Number.isFinite(message.deltaX)
    && typeof message.deltaY === 'number' && Number.isFinite(message.deltaY)
    && typeof message.clientX === 'number' && Number.isFinite(message.clientX)
    && typeof message.clientY === 'number' && Number.isFinite(message.clientY)
    && typeof message.zoom === 'boolean'
  if (message.type === 'viewport-state') return typeof message.scrollX === 'number' && Number.isFinite(message.scrollX)
    && typeof message.scrollY === 'number' && Number.isFinite(message.scrollY)
  if (message.type === 'diagnostic') {
    return ['error', 'warning', 'info'].includes(String(message.level)) && typeof message.message === 'string'
      && (message.stack === undefined || typeof message.stack === 'string')
  }
  if (message.type === 'select') return message.nodeId === null || typeof message.nodeId === 'string'
  if (typeof message.nodeId !== 'string') return false
  if (message.type === 'ai-prompt') return true
  if (message.type === 'context-menu') return typeof message.clientX === 'number' && Number.isFinite(message.clientX)
    && typeof message.clientY === 'number' && Number.isFinite(message.clientY)
  return message.type === 'computed-style' && !!message.styles && typeof message.styles === 'object'
}

export function isEditorToPreviewMessage(value: unknown): value is EditorToPreviewMessage {
  if (!value || typeof value !== 'object') return false
  const message = value as Record<string, unknown>
  if (message.channel !== 'vue-designer' || typeof message.session !== 'string') return false
  if (message.type === 'select') return message.nodeId === null || typeof message.nodeId === 'string'
  if (message.type === 'canvas-input-mode') return typeof message.enabled === 'boolean'
    && typeof message.selectionEnabled === 'boolean'
  if (message.type === 'select-at-point') return typeof message.clientX === 'number' && Number.isFinite(message.clientX)
    && typeof message.clientY === 'number' && Number.isFinite(message.clientY)
  if (message.type === 'restore-viewport') return typeof message.scrollX === 'number' && Number.isFinite(message.scrollX)
    && typeof message.scrollY === 'number' && Number.isFinite(message.scrollY)
  return message.type === 'apply-style' && typeof message.nodeId === 'string'
    && typeof message.property === 'string' && (message.value === null || typeof message.value === 'string')
}

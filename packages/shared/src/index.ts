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
  lockedReason?: string
  attributes: DesignerAttribute[]
  children: DesignerNode[]
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
    }
  | {
      type: 'insert-native'
      parentId: string
      tag: string
      contentModel: 'normal' | 'text' | 'void'
      defaultContent?: string
      defaultChildren?: string
      attributes?: Record<string, string | number | boolean>
    }
  | { type: 'remove-node'; nodeId: string }
  | { type: 'duplicate-node'; nodeId: string }
  | {
      type: 'move-node'
      nodeId: string
      targetId: string
      position: 'before' | 'inside' | 'after'
    }

const voidElements = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])

export function isVoidElement(tag: string): boolean {
  return voidElements.has(tag.toLowerCase())
}

export type PreviewToEditorMessage =
  | { channel: 'vue-designer'; session: string; type: 'ready' }
  | { channel: 'vue-designer'; session: string; type: 'select'; nodeId: string }
  | { channel: 'vue-designer'; session: string; type: 'computed-style'; nodeId: string; styles: Record<string, string> }
  | { channel: 'vue-designer'; session: string; type: 'diagnostic'; level: 'error' | 'warning' | 'info'; message: string; stack?: string }

export type EditorToPreviewMessage =
  | { channel: 'vue-designer'; session: string; type: 'select'; nodeId: string | null }
  | { channel: 'vue-designer'; session: string; type: 'apply-style'; nodeId: string; property: string; value: string | null }

export function isPreviewToEditorMessage(value: unknown): value is PreviewToEditorMessage {
  if (!value || typeof value !== 'object') return false
  const message = value as Record<string, unknown>
  if (message.channel !== 'vue-designer' || typeof message.session !== 'string') return false
  if (message.type === 'ready') return true
  if (message.type === 'diagnostic') {
    return ['error', 'warning', 'info'].includes(String(message.level)) && typeof message.message === 'string'
      && (message.stack === undefined || typeof message.stack === 'string')
  }
  if (typeof message.nodeId !== 'string') return false
  if (message.type === 'select') return true
  return message.type === 'computed-style' && !!message.styles && typeof message.styles === 'object'
}

export function isEditorToPreviewMessage(value: unknown): value is EditorToPreviewMessage {
  if (!value || typeof value !== 'object') return false
  const message = value as Record<string, unknown>
  if (message.channel !== 'vue-designer' || typeof message.session !== 'string') return false
  if (message.type === 'select') return message.nodeId === null || typeof message.nodeId === 'string'
  return message.type === 'apply-style' && typeof message.nodeId === 'string'
    && typeof message.property === 'string' && (message.value === null || typeof message.value === 'string')
}

export { applySourceOperation, instrumentDesignerNodes, parseDesignerDocument } from './parse.ts'

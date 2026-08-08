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
  range: DesignerSourceRange
  editable: boolean
  lockedReason?: string
  children: DesignerNode[]
}

export interface DesignerApiError {
  error: string
  currentRevision?: string
}

export interface SaveDocumentRequest {
  source: string
  revision: string
}

export interface SaveDocumentResponse {
  revision: string
}

export type PreviewToEditorMessage = {
  channel: 'vue-designer'
  type: 'select'
  nodeId: string
}

export type EditorToPreviewMessage = {
  channel: 'vue-designer'
  type: 'select'
  nodeId: string | null
}

export function isPreviewToEditorMessage(value: unknown): value is PreviewToEditorMessage {
  if (!value || typeof value !== 'object') return false
  const message = value as Record<string, unknown>
  return message.channel === 'vue-designer'
    && message.type === 'select'
    && typeof message.nodeId === 'string'
}

export { instrumentDesignerNodes, parseDesignerDocument } from './parse.ts'

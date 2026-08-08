export interface DesignerDocumentSummary {
  path: string
  name: string
}

export interface DesignerDocument extends DesignerDocumentSummary {
  source: string
  revision: string
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

import type {
  CreateDocumentRequest,
  DesignerApiError,
  DesignerComponentMetadata,
  DesignerDocument,
  DesignerDocumentSummary,
  DesignerMode,
  DesignerRuntimeConfig,
  DesignerStaticDocument,
  DesignerStyleRule,
} from '@component-canvas/shared'
import type { InjectionKey } from 'vue'

export interface PreviewUrlRequest {
  previewOrigin: string
  path: string
  session: string
  version: number
  candidateId?: string | null
}

/** The designer's view of the project: a live dev server or a static read-only build. */
export interface DesignerHost {
  readonly mode: DesignerMode
  config(): Promise<DesignerRuntimeConfig>
  listDocuments(): Promise<DesignerDocumentSummary[]>
  getDocument(path: string): Promise<DesignerDocument>
  listComponents(): Promise<DesignerComponentMetadata[]>
  getComponentMeta(id: string): Promise<DesignerComponentMetadata>
  getStyleRules(document: { path: string; source: string }, nodeId: string): Promise<DesignerStyleRule[]>
  previewUrl(request: PreviewUrlRequest): string
  /** Creates a document from the framework's starter template. Absent when read-only. */
  createDocument?(request: CreateDocumentRequest): Promise<DesignerDocumentSummary>
  /** Calls a designer API endpoint. Always rejects when read-only. */
  request<T>(url: string, init?: RequestInit): Promise<T>
}

export const hostKey: InjectionKey<DesignerHost> = Symbol('vue-designer-host')
export const readOnlyKey: InjectionKey<boolean> = Symbol('vue-designer-read-only')

export class ReadOnlyError extends Error {
  constructor() {
    super('This designer is read-only')
  }
}

export function readDesignerMode(document: Document): DesignerMode {
  return document.querySelector('meta[name="vue-designer-mode"]')?.getAttribute('content') === 'readonly'
    ? 'readonly'
    : 'edit'
}

function jsonRequest(body: unknown): RequestInit {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

export function createServerHost(fetcher: typeof fetch = fetch): DesignerHost {
  let capability = ''

  async function request<T>(url: string, init?: RequestInit, retry = true): Promise<T> {
    if (!capability) {
      const session = await fetcher('/__designer/api/session', { method: 'POST' })
      const body = await session.json() as { token: string }
      if (!session.ok || typeof body.token !== 'string') throw new Error('Unable to establish designer session')
      capability = body.token
    }
    const headers = new Headers(init?.headers)
    headers.set('Authorization', `Bearer ${capability}`)
    const response = await fetcher(url, { ...init, headers })
    if (response.status === 401 && retry) {
      capability = ''
      return request<T>(url, init, false)
    }
    const body = await response.json() as T | DesignerApiError
    if (!response.ok) throw Object.assign(new Error((body as DesignerApiError).error), { status: response.status })
    return body as T
  }

  return {
    mode: 'edit',
    request: (url, init) => request(url, init),
    config: () => request('/__designer/api/config'),
    listDocuments: () => request('/__designer/api/documents'),
    getDocument: (path) => request(`/__designer/api/document?path=${encodeURIComponent(path)}`),
    listComponents: () => request('/__designer/api/components'),
    getComponentMeta: (id) => request(`/__designer/api/components/meta?id=${encodeURIComponent(id)}`),
    getStyleRules: (document, nodeId) => request('/__designer/api/styles', jsonRequest({ ...document, nodeId })),
    createDocument: (body) => request('/__designer/api/documents', jsonRequest(body)),
    previewUrl({ previewOrigin, path, session, version, candidateId }) {
      const params = new URLSearchParams({ path, version: String(version), session })
      if (candidateId) params.set('candidate', candidateId)
      return `${previewOrigin}/__designer/preview?${params}`
    },
  }
}

/** Path of a document's emitted snapshot, encoded per segment for static hosts. */
export function staticDocumentFile(path: string): string {
  return `documents/${path.split('/').map(encodeURIComponent).join('/')}.json`
}

export function createStaticHost(base = import.meta.env.BASE_URL, fetcher: typeof fetch = fetch): DesignerHost {
  const dataUrl = (file: string) => `${base}__designer/data/${file}`
  const documents = new Map<string, Promise<DesignerStaticDocument>>()
  let components: Promise<DesignerComponentMetadata[]> | undefined

  async function data<T>(file: string): Promise<T> {
    const response = await fetcher(dataUrl(file))
    if (!response.ok) throw Object.assign(new Error(`Unable to load ${file}`), { status: response.status })
    return response.json() as Promise<T>
  }

  function getDocument(path: string): Promise<DesignerStaticDocument> {
    let document = documents.get(path)
    if (!document) {
      document = data<DesignerStaticDocument>(staticDocumentFile(path))
      document.catch(() => documents.delete(path))
      documents.set(path, document)
    }
    return document
  }

  function listComponents(): Promise<DesignerComponentMetadata[]> {
    components ??= data<DesignerComponentMetadata[]>('components.json').catch((cause: unknown) => {
      if ((cause as { status?: number }).status === 404) return []
      components = undefined
      throw cause
    })
    return components
  }

  return {
    mode: 'readonly',
    request: () => Promise.reject(new ReadOnlyError()),
    config: () => data('config.json'),
    listDocuments: () => data('documents.json'),
    getDocument,
    listComponents,
    async getComponentMeta(id) {
      const component = (await listComponents()).find((item) => item.id === id)
      if (!component) throw new Error('Component not found')
      return component
    },
    async getStyleRules(document, nodeId) {
      return (await getDocument(document.path)).styleRules[nodeId] ?? []
    },
    previewUrl({ path, session, version }) {
      const params = new URLSearchParams({ path, version: String(version), session })
      return `${base}__designer/preview.html?${params}`
    },
  }
}

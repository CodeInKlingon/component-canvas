import { createHash, randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fg from 'fast-glob'
import { loadEnv, type Plugin, type PluginOption, type ResolvedConfig, type UserConfig, type ViteDevServer } from 'vite'
import type {
  DesignerDocument,
  DesignerDocumentSummary,
  DesignerComponentMetadata,
  DesignerStyleCandidateResponse,
  DesignerStyleOperation,
  DesignerDocumentChangedEvent,
  DesignerAiRequest,
  DesignerAiModel,
  DesignerAiModelsResponse,
  DesignerAiResponse,
  DesignerSourceCandidateResponse,
  DesignerSourceOperation,
  DesignerSourceOperationResult,
  DesignerFrameworkClientMetadata,
  DesignerStyleRule,
  ParsedDesignerDocument,
  PreviewCandidateResponse,
  SaveDocumentRequest,
} from '@vue-designer/shared'
import { DesignerOperationError, isDesignerSourceOperation } from '@vue-designer/shared'
import { CapabilityStore } from './capabilities.js'
import { defaultAiModel, invalidAiModelParams, listAiModels, runAiPrompt, type CursorAiOptions } from './ai.js'

export interface DesignerDocumentContext {
  path: string
  absolutePath: string
  source: string
}

export interface DesignerFramework {
  id: string
  client: DesignerFrameworkClientMetadata
  vite?: PluginOption
  config?: UserConfig
  parse(context: DesignerDocumentContext): ParsedDesignerDocument
  applySourceOperation(context: DesignerDocumentContext, operation: DesignerSourceOperation): DesignerSourceOperationResult
  instrument(context: DesignerDocumentContext & { id: string; code: string; candidateId?: string }): { code: string; map: null }
  preview: {
    createCandidateId(absolutePath: string, candidateId: string): string
    resolveCandidateId(id: string): { candidateId: string; root: boolean } | undefined
    createDocumentId(absolutePath: string): string
    isDocumentId(id: string, absolutePath: string): boolean
    createEntry(context: { documentImport: string; appImport?: string }): string
  }
  styles?: {
    getRules(context: DesignerDocumentContext, nodeId: string): DesignerStyleRule[]
    applyOperation(context: DesignerDocumentContext, operation: DesignerStyleOperation): string
  }
  components?: {
    load(context: { config: ResolvedConfig; server: ViteDevServer; registryPath: string }): Promise<DesignerComponentMetadata[]>
  }
  ai?: {
    createPrompt(request: DesignerAiRequest): string
    extractSource(result: string): string
    invalidSourceMessage(message: string): string
  }
}

export interface DesignerOptions {
  framework: DesignerFramework
  documents: string | string[]
  app?: string
  components?: string
  previewPort?: number
  ai?: CursorAiOptions
}

const designerEntry = fileURLToPath(
  new URL('../../designer/src/main.ts', import.meta.url),
)

function revision(source: string): string {
  return createHash('sha256').update(source).digest('hex')
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(body))
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0

  for await (const chunk of request) {
    const buffer = Buffer.from(chunk)
    size += buffer.length
    if (size > 5 * 1024 * 1024) throw new Error('Request body exceeds 5 MB')
    chunks.push(buffer)
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function isSaveRequest(value: unknown): value is SaveDocumentRequest {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.source === 'string' && typeof candidate.revision === 'string'
}

function isCandidateRequest(value: unknown): value is { path: string; source: string } {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.path === 'string' && typeof candidate.source === 'string'
}

function isSourceCandidateRequest(value: unknown): value is {
  path: string
  source: string
  operation: DesignerSourceOperation
} {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.path === 'string' && typeof candidate.source === 'string'
    && isDesignerSourceOperation(candidate.operation)
}

function isStyleRequest(value: unknown): value is { path: string; source: string; operation: DesignerStyleOperation } {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.path === 'string' && typeof candidate.source === 'string'
    && !!candidate.operation && typeof candidate.operation === 'object'
}

function isAiRequest(value: unknown): value is DesignerAiRequest {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  if (typeof candidate.path !== 'string' || typeof candidate.source !== 'string'
    || typeof candidate.prompt !== 'string' || !candidate.prompt.trim()
    || (candidate.model !== undefined && typeof candidate.model !== 'string')
    || (candidate.params !== undefined && (!Array.isArray(candidate.params) || !candidate.params.every((param) => !!param
      && typeof param === 'object' && typeof (param as Record<string, unknown>).id === 'string'
      && typeof (param as Record<string, unknown>).value === 'string')))
    || !candidate.selection || typeof candidate.selection !== 'object') return false
  const selection = candidate.selection as Record<string, unknown>
  const range = selection.range as Record<string, unknown> | undefined
  return typeof selection.nodeId === 'string' && typeof selection.source === 'string'
    && !!range && Number.isInteger(range.start) && Number.isInteger(range.end)
}

function createDesignerPlugin(options: DesignerOptions): Plugin {
  let config: ResolvedConfig
  let documentFiles = new Map<string, string>()
  const previewEntryPrefix = '\0vue-designer:preview-entry?'
  const candidates = new Map<string, { path: string; source: string }>()
  const capabilities = new CapabilityStore()
  let previewOrigin = ''
  let cursorAiOptions: CursorAiOptions | undefined
  let aiModels: Promise<DesignerAiModel[]> | undefined

  function loadAiModels(aiOptions: CursorAiOptions): Promise<DesignerAiModel[]> {
    aiModels ??= listAiModels(aiOptions).catch((cause: unknown) => {
      aiModels = undefined
      throw cause
    })
    return aiModels
  }

  async function discoverDocuments(): Promise<DesignerDocumentSummary[]> {
    const patterns = Array.isArray(options.documents)
      ? options.documents
      : [options.documents]
    const files = await fg(patterns, {
      absolute: true,
      cwd: config.root,
      onlyFiles: true,
      unique: true,
    })

    documentFiles = new Map(
      files.map((absolutePath) => {
        const relativePath = path.relative(config.root, absolutePath).replaceAll('\\', '/')
        return [relativePath, path.resolve(absolutePath)]
      }),
    )

    return [...documentFiles.keys()].sort().map((relativePath) => ({
      path: relativePath,
      name: path.basename(relativePath, path.extname(relativePath)),
    }))
  }

  async function resolveDocument(relativePath: string): Promise<string | undefined> {
    await discoverDocuments()
    return documentFiles.get(relativePath)
  }

  function context(path: string, absolutePath: string, source: string): DesignerDocumentContext {
    return { path, absolutePath, source }
  }

  function storeCandidate(path: string, source: string): string {
    const candidateId = randomUUID()
    candidates.set(candidateId, { path, source })
    if (candidates.size > 50) candidates.delete(candidates.keys().next().value!)
    return candidateId
  }

  return {
    name: 'vue-designer',
    enforce: 'pre',
    config() {
      return options.framework.config
    },
    async resolveId(id) {
      if (options.framework.preview.resolveCandidateId(id)) return id
      if (id.startsWith('/__designer/preview-entry.js?')) {
        return `${previewEntryPrefix}${id.slice(id.indexOf('?') + 1)}`
      }
      if (id.startsWith('/__designer/candidate?')) {
        const candidateId = new URLSearchParams(id.slice(id.indexOf('?') + 1)).get('id') ?? ''
        const candidate = candidates.get(candidateId)
        if (!candidate) throw new Error('Preview candidate expired')
        const absolutePath = await resolveDocument(candidate.path)
        if (!absolutePath) throw new Error('Preview document not found')
        return options.framework.preview.createCandidateId(absolutePath, candidateId)
      }
    },
    async load(id) {
      const candidateReference = options.framework.preview.resolveCandidateId(id)
      if (candidateReference?.root) {
        const candidate = candidates.get(candidateReference.candidateId)
        if (!candidate) throw new Error('Preview candidate expired')
        return candidate.source
      }
      if (!id.startsWith(previewEntryPrefix)) return

      const params = new URLSearchParams(id.slice(previewEntryPrefix.length))
      const relativePath = params.get('path') ?? ''
      const previewSession = params.get('session') ?? ''
      if (!previewSession) throw new Error('Preview session is required')
      const absolutePath = await resolveDocument(relativePath)
      if (!absolutePath) throw new Error('Preview document not found')
      const candidateId = params.get('candidate')
      const candidate = candidateId ? candidates.get(candidateId) : undefined
      if (candidate && candidate.path !== relativePath) throw new Error('Preview candidate does not match document')

      const appPath = options.app ? path.resolve(config.root, options.app) : null
      const documentImport = candidateId && candidate
        ? `/__designer/candidate?id=${encodeURIComponent(candidateId)}`
        : options.framework.preview.createDocumentId(absolutePath)
      const frameworkEntry = options.framework.preview.createEntry({
        documentImport,
        appImport: appPath ?? undefined,
      })
      return `
const session = ${JSON.stringify(previewSession)}
const send = (message) => parent.postMessage({ channel: 'vue-designer', session, ...message }, '*')
const describe = (value) => value instanceof Error
  ? { message: value.message, stack: value.stack }
  : { message: typeof value === 'string' ? value : JSON.stringify(value) }

let panKeyPressed = false
let canvasInputMode = false
let selectionEnabled = true
const isKeyboardTarget = (target) => target instanceof Element
  && ((target instanceof HTMLElement && target.isContentEditable)
    || !!target.closest('input, textarea, select, button, a[href], summary, [role="button"]'))
const setPanKeyPressed = (pressed) => {
  if (panKeyPressed === pressed) return
  panKeyPressed = pressed
  send({ type: 'pan-key-state', pressed })
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && selectionEnabled) {
    send({ type: 'select', nodeId: null })
    select(null)
  }
  if (event.code !== 'Space' || isKeyboardTarget(event.target)) return
  event.preventDefault()
  setPanKeyPressed(true)
}, true)
document.addEventListener('keyup', (event) => {
  if (event.code !== 'Space' || !panKeyPressed) return
  event.preventDefault()
  setPanKeyPressed(false)
}, true)
addEventListener('blur', () => setPanKeyPressed(false))
document.addEventListener('wheel', (event) => {
  if (!canvasInputMode) return
  event.preventDefault()
  const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE
    ? 16
    : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
      ? innerHeight
      : 1
  send({
    type: 'canvas-wheel',
    deltaX: event.deltaX * scale,
    deltaY: event.deltaY * scale,
    clientX: event.clientX,
    clientY: event.clientY,
    zoom: event.ctrlKey || event.metaKey,
  })
}, { capture: true, passive: false })

addEventListener('error', (event) => send({ type: 'diagnostic', level: 'error', ...describe(event.error ?? event.message) }))
addEventListener('unhandledrejection', (event) => send({ type: 'diagnostic', level: 'error', ...describe(event.reason) }))
for (const level of ['warn', 'error']) {
  const original = console[level]
  console[level] = (...values) => {
    original(...values)
    send({ type: 'diagnostic', level: level === 'warn' ? 'warning' : 'error', ...describe(values[0]) })
  }
}

${frameworkEntry}

let selected
let scrollFrame
const selectionOverlay = document.createElement('div')
selectionOverlay.setAttribute('data-vue-designer-overlay', 'selection')
selectionOverlay.style.cssText = 'position:fixed;display:none;pointer-events:none;z-index:2147483647;border:2px solid #2563eb;box-sizing:content-box;box-shadow:0 0 0 1px rgba(255,255,255,.9);'
document.body.append(selectionOverlay)
const aiButton = document.createElement('button')
aiButton.type = 'button'
aiButton.title = 'Edit selection with AI'
aiButton.setAttribute('aria-label', 'Edit selection with AI')
aiButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><!-- Icon from Lucide by Lucide Contributors - https://github.com/lucide-icons/lucide/blob/main/LICENSE --><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594zM20 2v4m2-2h-4"/><circle cx="4" cy="20" r="2"/></g></svg>'
aiButton.style.cssText = 'position:fixed;display:none;place-items:center;width:25px;height:25px;padding:0;border:0px solid #bfdbfe;border-radius:8px;background:#2563eb;color:#fff;font:700 11px system-ui;cursor:pointer;z-index:2147483647;'
aiButton.addEventListener('click', (event) => {
  event.preventDefault()
  event.stopPropagation()
  const nodeId = selected?.getAttribute('data-vue-designer-id')
  if (nodeId) send({ type: 'ai-prompt', nodeId })
})
document.body.append(aiButton)
const selectionResizeObserver = new ResizeObserver(() => updateSelectionOverlay())
function updateSelectionOverlay() {
  if (!selected?.isConnected) {
    selectionOverlay.style.display = 'none'
    aiButton.style.display = 'none'
    return
  }
  const rect = selected.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) {
    selectionOverlay.style.display = 'none'
    aiButton.style.display = 'none'
    return
  }
  selectionOverlay.style.display = 'block'
  selectionOverlay.style.left = (rect.left - 2) + 'px'
  selectionOverlay.style.top = (rect.top - 2) + 'px'
  selectionOverlay.style.width = rect.width + 'px'
  selectionOverlay.style.height = rect.height + 'px'
  aiButton.style.display = ${JSON.stringify(!!options.ai && !!options.framework.ai)} ? 'grid' : 'none'
  aiButton.style.left = Math.max(4, rect.right - 24) + 'px'
  aiButton.style.top = Math.max(4, rect.top - 34) + 'px'
}
addEventListener('scroll', () => {
  cancelAnimationFrame(scrollFrame)
  scrollFrame = requestAnimationFrame(() => {
    updateSelectionOverlay()
    send({ type: 'viewport-state', scrollX, scrollY })
  })
}, { passive: true })
document.addEventListener('scroll', updateSelectionOverlay, { capture: true, passive: true })
addEventListener('resize', updateSelectionOverlay, { passive: true })
function select(nodeId) {
  if (selected) selectionResizeObserver.unobserve(selected)
  selected = nodeId ? document.querySelector('[data-vue-designer-id="' + CSS.escape(nodeId) + '"]') : null
  if (selected) {
    selectionResizeObserver.observe(selected)
    updateSelectionOverlay()
    const computed = getComputedStyle(selected)
    const properties = ['display', 'width', 'height', 'padding', 'margin', 'gap', 'font-size', 'font-weight', 'text-align', 'color', 'background-color', 'border', 'border-radius']
    const styles = Object.fromEntries(properties.map((property) => [property, computed.getPropertyValue(property)]))
    send({ type: 'computed-style', nodeId, styles })
  } else {
    updateSelectionOverlay()
  }
}
document.addEventListener('click', (event) => {
  if (!selectionEnabled || (event.target instanceof Node && aiButton.contains(event.target))) return
  const target = event.target instanceof Element ? event.target.closest('[data-vue-designer-id]') : null
  const nodeId = target?.getAttribute('data-vue-designer-id')
  event.preventDefault()
  event.stopPropagation()
  if (!nodeId) {
    send({ type: 'select', nodeId: null })
    select(null)
    return
  }
  send({ type: 'select', nodeId })
  select(nodeId)
}, true)
document.addEventListener('contextmenu', (event) => {
  if (!selectionEnabled) return
  const target = event.target instanceof Element ? event.target.closest('[data-vue-designer-id]') : null
  let nodeId = target?.getAttribute('data-vue-designer-id')
  if (!nodeId && selected) {
    const rect = selected.getBoundingClientRect()
    if (event.clientX >= rect.left && event.clientX <= rect.right
      && event.clientY >= rect.top && event.clientY <= rect.bottom) {
      nodeId = selected.getAttribute('data-vue-designer-id')
    }
  }
  if (!nodeId) return
  event.preventDefault()
  event.stopPropagation()
  select(nodeId)
  send({ type: 'select', nodeId })
  send({ type: 'context-menu', nodeId, clientX: event.clientX, clientY: event.clientY })
}, true)
addEventListener('message', (event) => {
  const message = event.data
  if (message?.channel !== 'vue-designer' || message.session !== session) return
  if (message.type === 'select' && (message.nodeId === null || typeof message.nodeId === 'string')) select(message.nodeId)
  if (message.type === 'canvas-input-mode' && typeof message.enabled === 'boolean' && typeof message.selectionEnabled === 'boolean') {
    canvasInputMode = message.enabled
    selectionEnabled = message.selectionEnabled
  }
  if (message.type === 'select-at-point' && Number.isFinite(message.clientX) && Number.isFinite(message.clientY)) {
    if (!selectionEnabled) return
    const target = document.elementFromPoint(message.clientX, message.clientY)?.closest('[data-vue-designer-id]')
    const nodeId = target?.getAttribute('data-vue-designer-id')
    if (nodeId) {
      send({ type: 'select', nodeId })
      select(nodeId)
    } else {
      send({ type: 'select', nodeId: null })
      select(null)
    }
  }
  if (message.type === 'restore-viewport' && Number.isFinite(message.scrollX) && Number.isFinite(message.scrollY)) {
    requestAnimationFrame(() => scrollTo(message.scrollX, message.scrollY))
  }
  if (message.type === 'apply-style') {
    if (typeof message.nodeId !== 'string' || typeof message.property !== 'string'
      || (message.value !== null && typeof message.value !== 'string')) return
    const target = document.querySelector('[data-vue-designer-id="' + CSS.escape(message.nodeId) + '"]')
    if (!(target instanceof HTMLElement)) return
    if (message.value) target.style.setProperty(message.property, message.value)
    else target.style.removeProperty(message.property)
    if (message.nodeId === selected?.getAttribute('data-vue-designer-id')) select(message.nodeId)
  }
})
`
    },
    transform(code, id) {
      const candidateReference = options.framework.preview.resolveCandidateId(id)
      if (candidateReference?.root) {
        const candidate = candidates.get(candidateReference.candidateId)
        const absolutePath = candidate ? documentFiles.get(candidate.path) : undefined
        if (!candidate || !absolutePath) return
        return options.framework.instrument({ ...context(candidate.path, absolutePath, candidate.source), id, code, candidateId: candidateReference.candidateId })
      }
      const filePath = path.resolve(id.split('?')[0] ?? id)
      const document = [...documentFiles].find(([, documentPath]) => path.resolve(documentPath) === filePath)
      if (!document || !options.framework.preview.isDocumentId(id, document[1])) return
      return options.framework.instrument({ ...context(document[0], document[1], code), id, code })
    },
    configResolved(resolvedConfig) {
      config = resolvedConfig
      if (options.ai) {
        const env = loadEnv(config.mode, config.root, '')
        cursorAiOptions = { ...options.ai, apiKey: options.ai.apiKey ?? env.CURSOR_API_KEY }
      }
    },
    configureServer(server) {
      const startPreviewServer = () => {
        const address = server.httpServer?.address()
        if (!address || typeof address === 'string') return
        const mainPort = address.port
        const previewServer = createServer((request, response) => {
          if (!request.url || request.url.startsWith('/__designer/api/')) {
            response.statusCode = 403
            return response.end('Preview access to designer APIs is forbidden')
          }
          if (request.url.startsWith('/@vite/client')) {
            response.statusCode = 200
            response.setHeader('Content-Type', 'text/javascript; charset=utf-8')
            response.setHeader('Access-Control-Allow-Origin', '*')
            return response.end(`
const styles = new Map()
export function createHotContext() {
  return { data: {}, accept() {}, acceptExports() {}, dispose() {}, prune() {}, decline() {}, invalidate() {}, on() {}, off() {}, send() {} }
}
export function updateStyle(id, content) {
  let style = styles.get(id)
  if (!style) {
    style = document.createElement('style')
    style.setAttribute('data-vite-dev-id', id)
    document.head.appendChild(style)
    styles.set(id, style)
  }
  style.textContent = content
}
export function removeStyle(id) { styles.get(id)?.remove(); styles.delete(id) }
export function injectQuery(url) { return url }
`)
          }
          const proxy = httpRequest({
            hostname: '127.0.0.1',
            port: mainPort,
            method: request.method,
            path: request.url,
            headers: { ...request.headers, host: `127.0.0.1:${mainPort}` },
          }, (proxied) => {
            response.statusCode = proxied.statusCode ?? 502
            for (const [name, value] of Object.entries(proxied.headers)) {
              if (value !== undefined && name !== 'content-security-policy') response.setHeader(name, value)
            }
            response.setHeader('Access-Control-Allow-Origin', '*')
            if (request.url?.startsWith('/__designer/preview?')) {
              const origin = previewOrigin
              const websocketOrigin = origin.replace('http:', 'ws:')
              response.setHeader('Content-Security-Policy', `default-src 'none'; script-src ${origin}; style-src 'unsafe-inline' https://fonts.googleapis.com; img-src ${origin} data: blob:; font-src ${origin} data: https://fonts.gstatic.com; connect-src ${origin} ${websocketOrigin}; base-uri 'none'; form-action 'none'`)
            }
            proxied.pipe(response)
          })
          proxy.on('error', () => {
            if (!response.headersSent) response.statusCode = 502
            response.end('Preview proxy unavailable')
          })
          request.pipe(proxy)
        })
        previewServer.on('upgrade', (request, socket, head) => {
          const proxy = httpRequest({
            hostname: '127.0.0.1',
            port: mainPort,
            method: request.method,
            path: request.url,
            headers: { ...request.headers, host: `127.0.0.1:${mainPort}` },
          })
          proxy.on('upgrade', (response, proxySocket, proxyHead) => {
            socket.write(`HTTP/1.1 101 Switching Protocols\r\n${Object.entries(response.headers).map(([name, value]) => `${name}: ${value}`).join('\r\n')}\r\n\r\n`)
            if (head.length) proxySocket.write(head)
            if (proxyHead.length) socket.write(proxyHead)
            proxySocket.pipe(socket).pipe(proxySocket)
          })
          proxy.on('error', () => socket.destroy())
          proxy.end()
        })
        previewServer.listen(options.previewPort ?? 0, '127.0.0.1', () => {
          const previewAddress = previewServer.address()
          if (previewAddress && typeof previewAddress !== 'string') previewOrigin = `http://127.0.0.1:${previewAddress.port}`
        })
        server.httpServer?.once('close', () => previewServer.close())
      }
      if (server.httpServer?.listening) startPreviewServer()
      else server.httpServer?.once('listening', startPreviewServer)

      server.watcher.on('change', async (changedPath) => {
        const absoluteChangedPath = path.resolve(changedPath)
        const entry = [...documentFiles].find(([, absolutePath]) => path.resolve(absolutePath) === absoluteChangedPath)
        if (!entry) return
        try {
          const source = await fs.readFile(entry[1], 'utf8')
          const data: DesignerDocumentChangedEvent = { path: entry[0], revision: revision(source) }
          server.ws.send({ type: 'custom', event: 'vue-designer:document-changed', data })
        } catch {
          // The normal Vite watcher handles removals and transient rename events.
        }
      })
      server.middlewares.use(async (request, response, next) => {
        if (!request.url) return next()
        const url = new URL(request.url, 'http://designer.local')

        // A script-only sandbox has an opaque `null` origin. Permit it to load
        // Vite modules without exposing the filesystem-backed designer API.
        if (!url.pathname.startsWith('/__designer/api/')) {
          response.setHeader('Access-Control-Allow-Origin', '*')
        }

        try {
          if (request.method === 'POST' && url.pathname === '/__designer/api/session') {
            return json(response, 201, capabilities.issue())
          }

          if (request.method === 'GET' && url.pathname === '/__designer/api/config') {
            if (!previewOrigin) return json(response, 503, { error: 'Preview server is starting' })
            return json(response, 200, {
              previewOrigin,
              framework: {
                ...options.framework.client,
                capabilities: {
                  styles: !!options.framework.styles,
                  components: !!options.framework.components && !!options.components,
                  ai: !!options.framework.ai && !!options.ai,
                },
              },
            })
          }

          if (url.pathname.startsWith('/__designer/api/')
            && !capabilities.accepts(request.headers.authorization)) {
            return json(response, 401, { error: 'Missing or expired designer capability' })
          }

          if (request.method === 'GET' && url.pathname === '/__designer/api/documents') {
            return json(response, 200, await discoverDocuments())
          }

          if (request.method === 'GET' && url.pathname === '/__designer/api/components') {
            if (!options.framework.components) {
              return json(response, 404, { error: 'Component metadata is not supported by this framework' })
            }
            if (!options.components) return json(response, 200, [])
            const registryPath = path.resolve(config.root, options.components)
            const components = await options.framework.components.load({ config, server, registryPath })
            return json(response, 200, components)
          }

          if (request.method === 'POST' && url.pathname === '/__designer/api/candidate') {
            const body = await readBody(request)
            const absolutePath = isCandidateRequest(body) ? await resolveDocument(body.path) : undefined
            if (!isCandidateRequest(body) || !absolutePath) {
              return json(response, 400, { error: 'Invalid preview candidate' })
            }
            const parsed = options.framework.parse(context(body.path, absolutePath, body.source))
            const parseError = parsed.diagnostics.find((item) => item.severity === 'error')
            if (parseError) return json(response, 422, { error: parseError.message })

            const candidateId = storeCandidate(body.path, body.source)
            const result: PreviewCandidateResponse = {
              candidateId,
              tree: parsed.tree,
              diagnostics: parsed.diagnostics,
            }
            return json(response, 200, result)
          }

          if (request.method === 'POST' && url.pathname === '/__designer/api/source-candidate') {
            const body = await readBody(request)
            const absolutePath = isSourceCandidateRequest(body) ? await resolveDocument(body.path) : undefined
            if (!isSourceCandidateRequest(body) || !absolutePath) {
              return json(response, 400, { error: 'Invalid source operation' })
            }

            try {
              const operationContext = context(body.path, absolutePath, body.source)
              const mutation = options.framework.applySourceOperation(operationContext, body.operation)
              const parsed = options.framework.parse({ ...operationContext, source: mutation.source })
              const parseError = parsed.diagnostics.find((item) => item.severity === 'error')
              if (parseError) return json(response, 422, { error: parseError.message })

              const candidateId = storeCandidate(body.path, mutation.source)
              const result: DesignerSourceCandidateResponse = {
                ...mutation,
                candidateId,
                tree: parsed.tree,
                diagnostics: parsed.diagnostics,
              }
              return json(response, 200, result)
            } catch (cause) {
              if (!(cause instanceof DesignerOperationError)) throw cause
              return json(response, 422, {
                error: cause instanceof Error ? cause.message : 'Unable to apply source operation',
              })
            }
          }

          if (request.method === 'GET' && url.pathname === '/__designer/api/ai/models') {
            if (!options.ai || !options.framework.ai) return json(response, 404, { error: 'AI editing is not supported or configured' })
            const aiOptions = cursorAiOptions ?? options.ai
            try {
              const models = await loadAiModels(aiOptions)
              const configured = aiOptions.model ?? defaultAiModel
              const result: DesignerAiModelsResponse = {
                models,
                defaultModel: models.some((model) => model.id === configured) ? configured : models[0]?.id ?? configured,
              }
              return json(response, 200, result)
            } catch (cause) {
              return json(response, 502, { error: cause instanceof Error ? cause.message : 'Unable to load Cursor models' })
            }
          }

          if (request.method === 'POST' && url.pathname === '/__designer/api/ai') {
            if (!options.ai || !options.framework.ai) return json(response, 404, { error: 'AI editing is not supported or configured' })
            const body = await readBody(request)
            const absolutePath = isAiRequest(body) ? await resolveDocument(body.path) : undefined
            if (!isAiRequest(body) || !absolutePath
              || body.selection.range.start < 0 || body.selection.range.end > body.source.length
              || body.selection.range.start >= body.selection.range.end
              || body.source.slice(body.selection.range.start, body.selection.range.end) !== body.selection.source) {
              return json(response, 400, { error: 'Invalid AI edit request' })
            }
            const aiOptions = cursorAiOptions ?? options.ai
            const modelId = body.model || aiOptions.model || defaultAiModel
            const params = body.params ?? []
            if (body.model || params.length) {
              const model = (await loadAiModels(aiOptions)).find((item) => item.id === modelId)
              if (!model) return json(response, 400, { error: `Unknown Cursor model: ${modelId}` })
              const paramsError = invalidAiModelParams(model, params)
              if (paramsError) return json(response, 400, { error: paramsError })
            }
            const rawResult = await runAiPrompt(
              options.framework.ai.createPrompt(body),
              config.root,
              { ...aiOptions, model: modelId, params },
            )
            const proposedSource = options.framework.ai.extractSource(rawResult)
            const parsed = options.framework.parse(context(body.path, absolutePath, proposedSource))
            const parseError = parsed.diagnostics.find((item) => item.severity === 'error')
            if (parseError) return json(response, 422, { error: options.framework.ai.invalidSourceMessage(parseError.message) })
            const result: DesignerAiResponse = { source: proposedSource }
            return json(response, 200, result)
          }

          if (request.method === 'POST' && url.pathname === '/__designer/api/styles') {
            if (!options.framework.styles) return json(response, 404, { error: 'Styles are not supported by this framework' })
            const body = await readBody(request)
            if (!body || typeof body !== 'object') return json(response, 400, { error: 'Invalid style request' })
            const requestBody = body as Record<string, unknown>
            const absolutePath = typeof requestBody.path === 'string' ? await resolveDocument(requestBody.path) : undefined
            if (typeof requestBody.path !== 'string' || typeof requestBody.source !== 'string'
              || typeof requestBody.nodeId !== 'string' || !absolutePath) {
              return json(response, 400, { error: 'Invalid style request' })
            }
            return json(response, 200, options.framework.styles.getRules(
              context(requestBody.path, absolutePath, requestBody.source), requestBody.nodeId,
            ))
          }

          if (request.method === 'POST' && url.pathname === '/__designer/api/style-candidate') {
            if (!options.framework.styles) return json(response, 404, { error: 'Styles are not supported by this framework' })
            const body = await readBody(request)
            const absolutePath = isStyleRequest(body) ? await resolveDocument(body.path) : undefined
            if (!isStyleRequest(body) || !absolutePath) {
              return json(response, 400, { error: 'Invalid style operation' })
            }
            const operationContext = context(body.path, absolutePath, body.source)
            const candidateSource = options.framework.styles.applyOperation(operationContext, body.operation)
            const parsed = options.framework.parse({ ...operationContext, source: candidateSource })
            const parseError = parsed.diagnostics.find((item) => item.severity === 'error')
            if (parseError) return json(response, 422, { error: parseError.message })
            const candidateId = storeCandidate(body.path, candidateSource)
            const result: DesignerStyleCandidateResponse = {
              source: candidateSource,
              candidateId,
              tree: parsed.tree,
              diagnostics: parsed.diagnostics,
              rules: options.framework.styles.getRules({ ...operationContext, source: candidateSource }, body.operation.nodeId),
            }
            return json(response, 200, result)
          }

          if (url.pathname === '/__designer/api/document') {
            const relativePath = url.searchParams.get('path') ?? ''
            const absolutePath = await resolveDocument(relativePath)
            if (!absolutePath) return json(response, 404, { error: 'Document not found' })

            if (request.method === 'GET') {
              const source = await fs.readFile(absolutePath, 'utf8')
              const parsed = options.framework.parse(context(relativePath, absolutePath, source))
              const document: DesignerDocument = {
                path: relativePath,
                name: path.basename(relativePath, path.extname(relativePath)),
                source,
                revision: revision(source),
                tree: parsed.tree,
                diagnostics: parsed.diagnostics,
              }
              return json(response, 200, document)
            }

            if (request.method === 'PUT') {
              const body = await readBody(request)
              if (!isSaveRequest(body)) {
                return json(response, 400, { error: 'Invalid save request' })
              }

              const currentSource = await fs.readFile(absolutePath, 'utf8')
              const currentRevision = revision(currentSource)
              if (currentRevision !== body.revision) {
                return json(response, 409, {
                  error: 'The document changed outside the designer',
                  currentRevision,
                })
              }

              const parsed = options.framework.parse(context(relativePath, absolutePath, body.source))
              const parseError = parsed.diagnostics.find((item) => item.severity === 'error')
              if (parseError) return json(response, 422, { error: parseError.message })

              const temporaryPath = `${absolutePath}.${randomUUID()}.designer-tmp`
              await fs.writeFile(temporaryPath, body.source, 'utf8')
              await fs.rename(temporaryPath, absolutePath)
              return json(response, 200, { revision: revision(body.source) })
            }
          }

          if (request.method === 'GET' && url.pathname === '/__designer/preview') {
            const relativePath = url.searchParams.get('path') ?? ''
            const absolutePath = await resolveDocument(relativePath)
            if (!absolutePath) {
              response.statusCode = 404
              return response.end('Document not found')
            }

            const entryParams = new URLSearchParams({ path: relativePath })
            const previewSession = url.searchParams.get('session') ?? ''
            if (!previewSession) {
              response.statusCode = 400
              return response.end('Preview session is required')
            }
            entryParams.set('session', previewSession)
            const candidateId = url.searchParams.get('candidate')
            if (candidateId) entryParams.set('candidate', candidateId)
            response.statusCode = 200
            response.setHeader('Content-Type', 'text/html; charset=utf-8')
            response.setHeader('Cache-Control', 'no-store')
            response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'")
            response.end(`<!doctype html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body><div id="app"></div><script type="module" src="/__designer/preview-entry.js?${entryParams}"></script></body></html>`)
            return
          }

          if (request.method === 'GET' && url.pathname === '/__designer/client.js') {
            response.statusCode = 200
            response.setHeader('Content-Type', 'text/javascript; charset=utf-8')
            return response.end(`import ${JSON.stringify(`/@fs/${designerEntry.replaceAll('\\', '/')}`)}`)
          }

          if (request.method === 'GET' && (url.pathname === '/__designer' || url.pathname === '/__designer/')) {
            response.statusCode = 200
            response.setHeader('Content-Type', 'text/html; charset=utf-8')
            return response.end(`<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vue Designer</title></head><body><div id="app"></div><script type="module" src="/__designer/client.js"></script></body></html>`)
          }

          next()
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown designer error'
          if (url.pathname.startsWith('/__designer/api/')) return json(response, 500, { error: message })
          server.config.logger.error(`[vue-designer] ${message}`)
          response.statusCode = 500
          response.end(message)
        }
      })
    },
  }
}

export default function designer(options: DesignerOptions): PluginOption {
  if (!options.framework) throw new Error('A designer framework is required')
  return [createDesignerPlugin(options), options.framework.vite]
}

import { createHash, randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fg from 'fast-glob'
import type { Plugin, ResolvedConfig } from 'vite'
import type {
  DesignerDocument,
  DesignerDocumentSummary,
  PreviewCandidateResponse,
  SaveDocumentRequest,
} from '@vue-designer/shared'
import { instrumentDesignerNodes, parseDesignerDocument } from '@vue-designer/shared'

export interface VueDesignerOptions {
  documents: string | string[]
  app?: string
  components?: string
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

export default function vueDesigner(options: VueDesignerOptions): Plugin {
  let config: ResolvedConfig
  let documentFiles = new Map<string, string>()
  const previewEntryPrefix = '\0vue-designer:preview-entry?'
  const candidateMarker = '?vue-designer-candidate='
  const candidates = new Map<string, { path: string; source: string }>()

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

  return {
    name: 'vue-designer',
    enforce: 'pre',
    async resolveId(id) {
      if (id.startsWith('/__designer/preview-entry.js?')) {
        return `${previewEntryPrefix}${id.slice(id.indexOf('?') + 1)}`
      }
      if (id.startsWith('/__designer/candidate.vue?')) {
        const candidateId = new URLSearchParams(id.slice(id.indexOf('?') + 1)).get('id') ?? ''
        const candidate = candidates.get(candidateId)
        if (!candidate) throw new Error('Preview candidate expired')
        const absolutePath = await resolveDocument(candidate.path)
        if (!absolutePath) throw new Error('Preview document not found')
        return `${absolutePath}${candidateMarker}${candidateId}`
      }
    },
    async load(id) {
      if (id.includes(candidateMarker)) {
        const candidateId = id.slice(id.indexOf(candidateMarker) + candidateMarker.length)
        const candidate = candidates.get(candidateId)
        if (!candidate) throw new Error('Preview candidate expired')
        return candidate.source
      }
      if (!id.startsWith(previewEntryPrefix)) return

      const params = new URLSearchParams(id.slice(previewEntryPrefix.length))
      const relativePath = params.get('path') ?? ''
      const absolutePath = await resolveDocument(relativePath)
      if (!absolutePath) throw new Error('Preview document not found')
      const candidateId = params.get('candidate')
      const candidate = candidateId ? candidates.get(candidateId) : undefined
      if (candidate && candidate.path !== relativePath) throw new Error('Preview candidate does not match document')

      const appPath = options.app ? path.resolve(config.root, options.app) : null
      const documentImport = candidateId && candidate
        ? `/__designer/candidate.vue?id=${encodeURIComponent(candidateId)}`
        : absolutePath
      return `
import { createApp, h } from 'vue'
import Document from ${JSON.stringify(documentImport)}
${appPath ? `import setup from ${JSON.stringify(appPath)}` : 'const setup = null'}
const app = createApp({ render: () => h(Document) })
if (setup?.setup) await setup.setup(app)
app.mount('#app')

let selected
function select(nodeId) {
  selected?.style.removeProperty('outline')
  selected?.style.removeProperty('outline-offset')
  selected = nodeId ? document.querySelector('[data-vue-designer-id="' + CSS.escape(nodeId) + '"]') : null
  selected?.style.setProperty('outline', '2px solid #78b82a')
  selected?.style.setProperty('outline-offset', '3px')
}
document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target.closest('[data-vue-designer-id]') : null
  const nodeId = target?.getAttribute('data-vue-designer-id')
  if (!nodeId) return
  event.preventDefault()
  event.stopPropagation()
  select(nodeId)
  parent.postMessage({ channel: 'vue-designer', type: 'select', nodeId }, '*')
}, true)
addEventListener('message', (event) => {
  const message = event.data
  if (message?.channel === 'vue-designer' && message.type === 'select') select(message.nodeId)
})
`
    },
    transform(code, id) {
      if (id.includes(candidateMarker)) return { code: instrumentDesignerNodes(code), map: null }
      const filePath = path.resolve(id.split('?')[0] ?? id)
      const isDocument = [...documentFiles.values()].some(
        (documentPath) => path.resolve(documentPath) === filePath,
      )
      if (!isDocument) return
      return { code: instrumentDesignerNodes(code), map: null }
    },
    configResolved(resolvedConfig) {
      config = resolvedConfig
    },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (!request.url) return next()
        const url = new URL(request.url, 'http://designer.local')

        // A script-only sandbox has an opaque `null` origin. Permit it to load
        // Vite modules without exposing the filesystem-backed designer API.
        if (!url.pathname.startsWith('/__designer/api/')) {
          response.setHeader('Access-Control-Allow-Origin', '*')
        }

        try {
          if (request.method === 'GET' && url.pathname === '/__designer/api/documents') {
            return json(response, 200, await discoverDocuments())
          }

          if (request.method === 'POST' && url.pathname === '/__designer/api/candidate') {
            const body = await readBody(request)
            if (!isCandidateRequest(body) || !await resolveDocument(body.path)) {
              return json(response, 400, { error: 'Invalid preview candidate' })
            }
            const parsed = parseDesignerDocument(body.source)
            const parseError = parsed.diagnostics.find((item) => item.severity === 'error')
            if (parseError) return json(response, 422, { error: parseError.message })

            const candidateId = randomUUID()
            candidates.set(candidateId, { path: body.path, source: body.source })
            if (candidates.size > 50) candidates.delete(candidates.keys().next().value!)
            const result: PreviewCandidateResponse = {
              candidateId,
              tree: parsed.tree,
              diagnostics: parsed.diagnostics,
            }
            return json(response, 200, result)
          }

          if (url.pathname === '/__designer/api/document') {
            const relativePath = url.searchParams.get('path') ?? ''
            const absolutePath = await resolveDocument(relativePath)
            if (!absolutePath) return json(response, 404, { error: 'Document not found' })

            if (request.method === 'GET') {
              const source = await fs.readFile(absolutePath, 'utf8')
              const parsed = parseDesignerDocument(source)
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
            const candidateId = url.searchParams.get('candidate')
            if (candidateId) entryParams.set('candidate', candidateId)
            response.statusCode = 200
            response.setHeader('Content-Type', 'text/html; charset=utf-8')
            response.setHeader('Cache-Control', 'no-store')
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

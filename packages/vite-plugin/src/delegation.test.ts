import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServer, type ViteDevServer } from 'vite'
import { DesignerOperationError, type DesignerNode, type ParsedDesignerDocument } from '@vue-designer/shared'
import designer, { type DesignerFramework, type DesignerDocumentContext } from './index'

const source = '<document>saved</document>'
const tree: DesignerNode[] = [{
  id: 'node-0',
  kind: 'element',
  label: 'document',
  range: { start: 0, end: source.length },
  editable: true,
  capabilities: { canContainChildren: true },
  attributes: [],
  children: [],
}]

function fakeFramework(overrides: Partial<DesignerFramework> = {}): DesignerFramework {
  return {
    id: 'fake',
    client: {
      id: 'fake', sourceLanguage: 'text', fileExtension: '.fake', documentLabel: 'Fake document',
      capabilities: { styles: true, components: true, ai: true },
    },
    parse: vi.fn((context: DesignerDocumentContext): ParsedDesignerDocument => {
      if (context.source === 'THROW') throw new Error('adapter defect')
      return { tree, diagnostics: context.source === 'INVALID' ? [{ message: 'Invalid document', severity: 'error' }] : [] }
    }),
    applySourceOperation: vi.fn((context) => ({ source: `${context.source}:mutated`, selectionOffset: 4 })),
    instrument: vi.fn((context) => ({ code: context.code, map: null })),
    preview: {
      createCandidateId: (file, id) => `${file}.candidate-${id}.fake`,
      resolveCandidateId: () => undefined,
      createDocumentId: (file) => `${file}?preview`,
      isDocumentId: (id, file) => id === `${file}?preview`,
      createEntry: () => '',
    },
    ...overrides,
  }
}

describe('framework delegation', () => {
  let root: string
  let server: ViteDevServer
  let base: string

  async function start(framework: DesignerFramework, options: { components?: string; ai?: object } = {}) {
    server = await createServer({
      root,
      logLevel: 'silent',
      plugins: [designer({ framework, documents: 'Page.fake', ...options })],
      server: { host: '127.0.0.1', port: 0 },
    })
    await server.listen()
    const address = server.httpServer!.address()
    if (!address || typeof address === 'string') throw new Error('Vite did not bind a TCP port')
    base = `http://127.0.0.1:${address.port}`
  }

  async function authorizedHeaders(): Promise<Record<string, string>> {
    const session = await fetch(`${base}/__designer/api/session`, { method: 'POST' }).then((response) => response.json()) as { token: string }
    return { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' }
  }

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'vue-designer-framework-'))
    await writeFile(path.join(root, 'Page.fake'), source)
  })

  afterEach(async () => {
    await server?.close()
    await rm(root, { recursive: true, force: true })
  })

  it('delegates document parsing and reports effective client capabilities', async () => {
    const framework = fakeFramework()
    await start(framework)
    const config = await fetch(`${base}/__designer/api/config`).then((response) => response.json()) as Record<string, any>
    expect(config.framework).toMatchObject({ id: 'fake', capabilities: { styles: false, components: false, ai: false } })

    const headers = await authorizedHeaders()
    const response = await fetch(`${base}/__designer/api/document?path=Page.fake`, { headers })
    expect(response.status).toBe(200)
    expect(framework.parse).toHaveBeenCalledWith(expect.objectContaining({ path: 'Page.fake', source }))
  })

  it('applies source operations, reparses their output, and rejects invalid results before preview', async () => {
    const framework = fakeFramework()
    await start(framework)
    const headers = await authorizedHeaders()
    const response = await fetch(`${base}/__designer/api/source-candidate`, {
      method: 'POST', headers,
      body: JSON.stringify({ path: 'Page.fake', source, operation: { type: 'set-text', nodeId: 'node-0', value: 'next' } }),
    })
    const result = await response.json() as Record<string, any>
    expect(response.status).toBe(200)
    expect(result).toMatchObject({ source: `${source}:mutated`, selectionOffset: 4 })
    expect(framework.applySourceOperation).toHaveBeenCalledOnce()
    expect(framework.parse).toHaveBeenLastCalledWith(expect.objectContaining({ source: `${source}:mutated` }))

    vi.mocked(framework.applySourceOperation).mockReturnValueOnce({ source: 'INVALID' })
    const invalid = await fetch(`${base}/__designer/api/source-candidate`, {
      method: 'POST', headers,
      body: JSON.stringify({ path: 'Page.fake', source, operation: { type: 'remove-node', nodeId: 'node-0' } }),
    })
    expect(invalid.status).toBe(422)
  })

  it('distinguishes rejected operations from adapter defects', async () => {
    const framework = fakeFramework()
    await start(framework)
    const headers = await authorizedHeaders()
    vi.mocked(framework.applySourceOperation).mockImplementationOnce(() => { throw new DesignerOperationError('Unsupported operation') })
    const rejected = await fetch(`${base}/__designer/api/source-candidate`, {
      method: 'POST', headers,
      body: JSON.stringify({ path: 'Page.fake', source, operation: { type: 'remove-node', nodeId: 'node-0' } }),
    })
    expect(rejected.status).toBe(422)

    vi.mocked(framework.applySourceOperation).mockImplementationOnce(() => { throw new Error('adapter defect') })
    const defect = await fetch(`${base}/__designer/api/source-candidate`, {
      method: 'POST', headers,
      body: JSON.stringify({ path: 'Page.fake', source, operation: { type: 'remove-node', nodeId: 'node-0' } }),
    })
    expect(defect.status).toBe(500)
  })

  it('reparses before save and never writes invalid or failed adapter output', async () => {
    const framework = fakeFramework()
    await start(framework)
    const headers = await authorizedHeaders()
    const document = await fetch(`${base}/__designer/api/document?path=Page.fake`, { headers }).then((response) => response.json()) as { revision: string }

    for (const proposed of ['INVALID', 'THROW']) {
      const response = await fetch(`${base}/__designer/api/document?path=Page.fake`, {
        method: 'PUT', headers, body: JSON.stringify({ source: proposed, revision: document.revision }),
      })
      expect(response.status).toBe(proposed === 'INVALID' ? 422 : 500)
      expect(await readFile(path.join(root, 'Page.fake'), 'utf8')).toBe(source)
    }
  })

  it('returns controlled responses for unsupported optional capabilities', async () => {
    await start(fakeFramework())
    const headers = await authorizedHeaders()
    expect((await fetch(`${base}/__designer/api/components`, { headers })).status).toBe(404)
    expect((await fetch(`${base}/__designer/api/styles`, { method: 'POST', headers, body: '{}' })).status).toBe(404)
    expect((await fetch(`${base}/__designer/api/style-candidate`, { method: 'POST', headers, body: '{}' })).status).toBe(404)
    expect((await fetch(`${base}/__designer/api/ai`, { method: 'POST', headers, body: '{}' })).status).toBe(404)
  })
})

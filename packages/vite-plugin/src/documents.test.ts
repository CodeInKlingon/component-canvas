import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import type { ResolvedConfig } from 'vite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import designer, {
  createDocumentMatcher,
  documentRoots,
  resolveNewDocumentPath,
  type DesignerFramework,
} from './index'

const framework: DesignerFramework = {
  id: 'fake',
  client: {
    id: 'fake', sourceLanguage: 'text', fileExtension: '.fake', documentLabel: 'Fake document',
    capabilities: { styles: true, components: false, ai: false },
  },
  parse: (context) => ({
    tree: context.source.includes('invalid') ? [] : [{
      id: 'node-0', kind: 'element', label: 'main', range: { start: 0, end: context.source.length }, editable: true,
      capabilities: { canContainChildren: true }, attributes: [], children: [],
    }],
    diagnostics: context.source.includes('invalid') ? [{ message: 'Invalid', severity: 'error' }] : [],
  }),
  applySourceOperation: (context) => ({ source: context.source }),
  instrument: (context) => ({ code: context.code, map: null }),
  preview: {
    createCandidateId: (file, id) => `${file}?candidate=${id}`,
    resolveCandidateId: () => undefined,
    createDocumentId: (file) => `${file}?preview`,
    isDocumentId: (id, file) => id === `${file}?preview`,
    createEntry: () => '',
  },
  styles: {
    getRules: (context, nodeId) => [{ selector: `.${nodeId}`, declarations: [], insertOffset: context.source.length }],
    applyOperation: (context) => context.source,
  },
  createDocument: ({ name }) => `<main>${name}</main>\n`,
}

type TestPlugin = {
  config(config: { root: string }, env: { command: 'build' | 'serve'; mode: string }): unknown
  configResolved(config: ResolvedConfig): void
  buildStart(): Promise<void>
  generateBundle(this: { emitFile(file: { fileName: string; source: string }): void }): Promise<void>
  configureServer(server: unknown): void
}

function createPlugin(documents: string | string[] = 'src/pages/**/*.fake'): TestPlugin {
  return (designer({ framework, documents }) as unknown[])[0] as TestPlugin
}

describe('document patterns', () => {
  it('derives creatable roots from the static base of each pattern', () => {
    expect(documentRoots(['src/pages/**/*.vue', 'src/screens/*.vue', 'Home.vue'])).toEqual(['', 'src/pages', 'src/screens'])
  })

  it('matches included paths and honours negated patterns', () => {
    const matches = createDocumentMatcher(['src/pages/**/*.vue', '!src/pages/drafts/**'])
    expect(matches('src/pages/Home.vue')).toBe(true)
    expect(matches('src/pages/nested/Home.vue')).toBe(true)
    expect(matches('src/pages/drafts/Home.vue')).toBe(false)
    expect(matches('src/components/Button.vue')).toBe(false)
  })
})

describe('resolveNewDocumentPath', () => {
  const root = path.resolve('/project')
  const patterns = ['src/pages/**/*.vue']
  const resolve = (directory: string, name: string) => resolveNewDocumentPath(root, patterns, { directory, name }, '.vue')

  it('resolves a confined path that matches the document patterns', () => {
    expect(resolve('src/pages/marketing', 'Pricing')).toEqual({
      path: 'src/pages/marketing/Pricing.vue',
      absolutePath: path.resolve(root, 'src/pages/marketing/Pricing.vue'),
    })
    expect(resolve('./src/pages/', ' Pricing ')).toMatchObject({ path: 'src/pages/Pricing.vue' })
  })

  it('rejects unsafe names', () => {
    for (const name of ['', '../Pricing', 'Pricing.vue', 'a/b', '-Pricing', 'Pri cing']) {
      expect(resolve('src/pages', name)).toHaveProperty('error')
    }
  })

  it('rejects folders outside the project', () => {
    for (const directory of ['..', '../outside', 'src/../../outside', '/etc', 'C:/Windows', 'C:\\Windows']) {
      expect(resolve(directory, 'Pricing')).toEqual({ error: 'The folder must be inside the project' })
    }
  })

  it('rejects paths that the document patterns would not discover', () => {
    expect(resolve('src/components', 'Pricing')).toEqual({ error: 'src/components/Pricing.vue does not match the configured document patterns' })
  })
})

describe('designer modes', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'vue-designer-'))
    await mkdir(path.join(root, 'src/pages/nested'), { recursive: true })
    await writeFile(path.join(root, 'src/pages/Home.fake'), '<main>Home</main>')
    await writeFile(path.join(root, 'src/pages/nested/About.fake'), '<main>About</main>')
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  function resolvedConfig(): ResolvedConfig {
    return { root, mode: 'production', logger: { error() {}, warn() {} } } as unknown as ResolvedConfig
  }

  it('replaces the build inputs with the designer and preview pages', () => {
    const config = createPlugin().config({ root }, { command: 'build', mode: 'production' }) as {
      build: { target: string; rollupOptions: { input: Record<string, string> } }
    }
    expect(config.build.target).toBe('es2022')
    expect(config.build.rollupOptions.input).toEqual({
      index: path.join(root, 'index.html').replaceAll('\\', '/'),
      preview: path.join(root, '__designer/preview.html').replaceAll('\\', '/'),
    })
  })

  it('leaves the dev server config untouched', () => {
    expect(createPlugin().config({ root }, { command: 'serve', mode: 'development' })).toEqual({})
  })

  it('emits read-only data for every document in a build', async () => {
    const plugin = createPlugin()
    plugin.config({ root }, { command: 'build', mode: 'production' })
    plugin.configResolved(resolvedConfig())
    await plugin.buildStart()
    const files = new Map<string, unknown>()
    await plugin.generateBundle.call({ emitFile: (file) => files.set(file.fileName, JSON.parse(file.source)) })

    expect([...files.keys()].sort()).toEqual([
      '__designer/data/config.json',
      '__designer/data/documents.json',
      '__designer/data/documents/src/pages/Home.fake.json',
      '__designer/data/documents/src/pages/nested/About.fake.json',
    ])
    expect(files.get('__designer/data/config.json')).toMatchObject({
      mode: 'readonly',
      previewOrigin: '',
      documentRoots: ['src/pages'],
      documentPatterns: ['src/pages/**/*.fake'],
      framework: { capabilities: { ai: false } },
    })
    expect(files.get('__designer/data/documents/src/pages/Home.fake.json')).toMatchObject({
      path: 'src/pages/Home.fake',
      source: '<main>Home</main>',
      tree: [{ id: 'node-0' }],
      styleRules: { 'node-0': [{ selector: '.node-0' }] },
    })
  })

  it('scopes document styles to the preview module in a build', async () => {
    const plugin = createPlugin() as TestPlugin & { moduleParsed(info: { meta: Record<string, any> }): void }
    plugin.config({ root }, { command: 'build', mode: 'production' })
    plugin.configResolved(resolvedConfig())
    await plugin.buildStart()
    const home = path.join(root, 'src/pages/Home.fake').replaceAll('\\', '/')
    const documentStyle = { meta: { vite: { cssScopeTo: [home, 'default'] } } }
    const otherStyle = { meta: { vite: { cssScopeTo: [`${root}/src/Other.fake`, 'default'] } } }
    plugin.moduleParsed(documentStyle)
    plugin.moduleParsed(otherStyle)
    expect(documentStyle.meta.vite.cssScopeTo).toEqual([`${home}?preview`, 'default'])
    expect(otherStyle.meta.vite.cssScopeTo).toEqual([`${root}/src/Other.fake`, 'default'])
  })

  describe('create endpoint', () => {
    let middleware: (request: unknown, response: unknown, next: () => void) => Promise<void>

    beforeEach(() => {
      const plugin = createPlugin()
      plugin.config({ root }, { command: 'serve', mode: 'development' })
      plugin.configResolved(resolvedConfig())
      plugin.configureServer({
        httpServer: null,
        watcher: { on() {} },
        config: resolvedConfig(),
        ws: { send() {} },
        middlewares: { use: (handler: typeof middleware) => { middleware = handler } },
      })
    })

    async function call(method: string, url: string, body?: unknown, token?: string) {
      const request = Object.assign(Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]), {
        method, url, headers: token ? { authorization: `Bearer ${token}` } : {},
      })
      return new Promise<{ status: number; body: any }>((resolve, reject) => {
        const response = {
          statusCode: 200,
          headers: {} as Record<string, string>,
          setHeader(name: string, value: string) { this.headers[name] = value },
          end(data?: string) { resolve({ status: this.statusCode, body: data ? JSON.parse(data) : undefined }) },
        }
        middleware(request, response, () => reject(new Error('Unhandled request'))).catch(reject)
      })
    }

    async function create(body: unknown) {
      const session = await call('POST', '/__designer/api/session')
      return call('POST', '/__designer/api/documents', body, session.body.token)
    }

    it('requires a capability', async () => {
      expect((await call('POST', '/__designer/api/documents', { directory: 'src/pages', name: 'Pricing' })).status).toBe(401)
    })

    it('creates a starter document that is then discovered', async () => {
      const result = await create({ directory: 'src/pages/nested', name: 'Pricing' })
      expect(result.status).toBe(201)
      expect(result.body).toMatchObject({ path: 'src/pages/nested/Pricing.fake', name: 'Pricing' })
      expect(await readFile(path.join(root, 'src/pages/nested/Pricing.fake'), 'utf8')).toBe('<main>Pricing</main>\n')
      const session = await call('POST', '/__designer/api/session')
      const documents = await call('GET', '/__designer/api/documents', undefined, session.body.token)
      expect(documents.body.map((document: { path: string }) => document.path)).toContain('src/pages/nested/Pricing.fake')
    })

    it('never overwrites an existing document', async () => {
      const result = await create({ directory: 'src/pages', name: 'Home' })
      expect(result).toEqual({ status: 409, body: { error: 'src/pages/Home.fake already exists' } })
      expect(await readFile(path.join(root, 'src/pages/Home.fake'), 'utf8')).toBe('<main>Home</main>')
    })

    it('rejects traversal and paths outside the document patterns', async () => {
      expect((await create({ directory: '../outside', name: 'Pricing' })).status).toBe(400)
      expect((await create({ directory: 'src/components', name: 'Pricing' })).status).toBe(400)
      expect((await create({ directory: 'src/pages', name: '../Pricing' })).status).toBe(400)
    })

    it('serves the designer in place of the host app', async () => {
      const page = await new Promise<{ status: number; body: string; headers: Record<string, string> }>((resolve) => {
        const response = {
          statusCode: 200,
          headers: {} as Record<string, string>,
          setHeader(name: string, value: string) { this.headers[name] = value },
          end(data = '') { resolve({ status: this.statusCode, body: data, headers: this.headers }) },
        }
        void middleware({ method: 'GET', url: '/', headers: {} }, response, () => {})
      })
      expect(page.status).toBe(200)
      expect(page.body).toContain('<meta name="vue-designer-mode" content="edit">')
      expect(page.body).toContain('/__designer/client.js')
    })
  })
})

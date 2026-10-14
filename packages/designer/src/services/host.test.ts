import { describe, expect, it } from 'vitest'
import { createStaticHost, ReadOnlyError, staticDocumentFile } from './host'

function fakeFetch(files: Record<string, unknown>, requests: string[] = []): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input)
    requests.push(url)
    return url in files
      ? new Response(JSON.stringify(files[url]), { status: 200 })
      : new Response('Not found', { status: 404 })
  }) as typeof fetch
}

describe('static host', () => {
  const document = {
    path: 'src/pages/a b/Home.vue', name: 'Home', source: '<template />', revision: 'r1',
    tree: [], diagnostics: [], styleRules: { 'node-0': [{ selector: '.home', declarations: [], insertOffset: 0 }] },
  }

  it('reads emitted documents and precomputed style rules under the base path', async () => {
    const requests: string[] = []
    const host = createStaticHost('/designs/', fakeFetch({
      '/designs/__designer/data/documents/src/pages/a%20b/Home.vue.json': document,
    }, requests))
    expect(host.mode).toBe('readonly')
    expect(await host.getDocument(document.path)).toEqual(document)
    expect(await host.getStyleRules({ path: document.path, source: '' }, 'node-0')).toEqual(document.styleRules['node-0'])
    expect(await host.getStyleRules({ path: document.path, source: '' }, 'node-1')).toEqual([])
    expect(requests).toHaveLength(1)
  })

  it('rejects every mutating request and cannot create documents', async () => {
    const requests: string[] = []
    const host = createStaticHost('/', fakeFetch({}, requests))
    await expect(host.request('/__designer/api/source-candidate', { method: 'POST' })).rejects.toBeInstanceOf(ReadOnlyError)
    expect(host.createDocument).toBeUndefined()
    expect(requests).toEqual([])
  })

  it('treats a missing component manifest as no components', async () => {
    expect(await createStaticHost('/', fakeFetch({})).listComponents()).toEqual([])
  })

  it('builds preview URLs without candidates', () => {
    const url = createStaticHost('/designs/').previewUrl({
      previewOrigin: '', path: 'src/pages/Home.vue', session: 's1', version: 2, candidateId: 'ignored',
    })
    expect(url).toBe('/designs/__designer/preview.html?path=src%2Fpages%2FHome.vue&version=2&session=s1')
  })

  it('encodes each path segment of emitted document files', () => {
    expect(staticDocumentFile('src/pages/Price#1.vue')).toBe('documents/src/pages/Price%231.vue.json')
  })
})

import { describe, expect, it } from 'vitest'
import designer, { type DesignerFramework } from './index'

const framework: DesignerFramework = {
  id: 'fake',
  client: {
    id: 'fake', sourceLanguage: 'text', fileExtension: '.fake', documentLabel: 'Fake document',
    capabilities: { styles: false, components: false, ai: false },
  },
  parse: () => ({ tree: [], diagnostics: [] }),
  applySourceOperation: (context) => ({ source: context.source }),
  instrument: (context) => ({ code: context.code, map: null }),
  preview: {
    createCandidateId: (path, id) => `${path}?candidate=${id}`,
    resolveCandidateId: () => undefined,
    createDocumentId: (path) => `${path}?preview`,
    isDocumentId: (id, path) => id === `${path}?preview`,
    createEntry: () => '',
  },
}

describe('designer', () => {
  it('creates a named pre plugin around an injected framework', () => {
    const plugins = designer({ framework, documents: 'src/**/*.fake' }) as unknown[]
    const plugin = plugins[0] as { name: string; enforce: string }
    expect(plugin.name).toBe('vue-designer')
    expect(plugin.enforce).toBe('pre')
  })

  it('requires explicit framework support', () => {
    expect(() => designer({ documents: 'src/**/*' } as never)).toThrow('framework')
  })
})

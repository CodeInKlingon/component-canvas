import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

async function text(relativeUrl: string): Promise<string> {
  return readFile(new URL(relativeUrl, import.meta.url), 'utf8')
}

describe('framework package boundary', () => {
  it('keeps Vite core free of static Vue support dependencies', async () => {
    const [manifest, source] = await Promise.all([
      text('../package.json'),
      text('./index.ts'),
    ])
    expect(manifest).not.toContain('@vue-designer/vue')
    expect(manifest).not.toContain('vue-component-meta')
    expect(source).not.toContain('@vue-designer/vue')
    expect(source).not.toContain('@vue/compiler')
    expect(source).not.toContain('parseDesignerDocument')
  })

  it('keeps shared and designer free of edited-document Vue runtime code', async () => {
    const [sharedManifest, sharedSource, designerSource] = await Promise.all([
      text('../../shared/package.json'),
      text('../../shared/src/index.ts'),
      text('../../designer/src/App.vue'),
    ])
    expect(sharedManifest).not.toContain('@vue/compiler')
    expect(sharedManifest).not.toContain('postcss')
    expect(sharedSource).not.toContain("from './parse")
    expect(designerSource).not.toContain('parseDesignerDocument')
    expect(designerSource).not.toContain('@vue-designer/vue')
  })

  it('uses Vue support as the example project\'s only Vue compiler plugin', async () => {
    const [manifest, config] = await Promise.all([
      text('../../../examples/basic/package.json'),
      text('../../../examples/basic/vite.config.ts'),
    ])
    expect(manifest).toContain('@vue-designer/vue')
    expect(manifest).not.toContain('@vitejs/plugin-vue')
    expect(config).toContain('framework: vue()')
    expect(config).not.toContain("from '@vitejs/plugin-vue'")
  })
})

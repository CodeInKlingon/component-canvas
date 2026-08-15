import { describe, expect, it } from 'vitest'
import vue, { createCandidateFileId, createPreviewDocumentId, resolveCandidateFileId } from './index'

describe('Vue preview identities', () => {
  it('keeps candidate identity in Vue subrequests', () => {
    const id = createCandidateFileId('C:/project/src/Page.vue', 'candidate-123')
    expect(id).toBe('C:/project/src/Page.vue.vue-designer-candidate-candidate-123.vue')
    expect(resolveCandidateFileId(id)).toEqual({ candidateId: 'candidate-123', root: true })
    expect(resolveCandidateFileId(`${id}?vue&type=style&index=0&lang.css`))
      .toEqual({ candidateId: 'candidate-123', root: false })
    expect(resolveCandidateFileId('C:/project/src/Page.vue?vue&type=style')).toBeUndefined()
  })

  it('uses a separate module identity for saved previews', () => {
    expect(createPreviewDocumentId('C:/project/src/Page.vue'))
      .toBe('C:/project/src/Page.vue?vue-designer-preview')
    expect(vue().preview.isDocumentId(
      'C:/project/src/Page.vue?vue-designer-preview',
      'C:\\project\\src\\Page.vue',
    )).toBe(true)
  })

  it('defines Vue runtime feature flags for transforms and dependency optimization', () => {
    const config = vue().config
    expect(config.define).toEqual({
      __VUE_OPTIONS_API__: 'true',
      __VUE_PROD_DEVTOOLS__: 'false',
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
    })
    expect(config.optimizeDeps?.esbuildOptions?.define).toEqual(config.define)
  })

  it('generates Vue mounting, host setup, diagnostics, readiness, and disposal behavior', () => {
    const entry = vue().preview.createEntry({ documentImport: '/Page.vue', appImport: '/designer-app.ts' })
    expect(entry).toContain("import { createApp, h } from 'vue'")
    expect(entry).toContain('import("/Page.vue")')
    expect(entry).toContain('import("/designer-app.ts")')
    expect(entry.indexOf('await setup.setup(app)')).toBeLessThan(entry.indexOf("app.mount('#app')"))
    expect(entry).toContain("send({ type: 'diagnostic'")
    expect(entry).toContain("send({ type: 'ready' })")
    expect(entry).toContain('app.unmount()')
  })
})

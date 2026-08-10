import { describe, expect, it } from 'vitest'
import vueDesigner, { candidateIdFromFile, createCandidateFileId, createPreviewDocumentId } from './index'

describe('vueDesigner', () => {
  it('creates a named pre plugin', () => {
    const plugin = vueDesigner({ documents: 'src/**/*.vue' })
    expect(plugin.name).toBe('vue-designer')
    expect(plugin.enforce).toBe('pre')
  })

  it('keeps candidate identity in Vue style subrequests', () => {
    const id = createCandidateFileId('C:/project/src/Page.vue', 'candidate-123')
    expect(id).toBe('C:/project/src/Page.vue.vue-designer-candidate-candidate-123.vue')
    expect(candidateIdFromFile(`${id}?vue&type=style&index=0&lang.css`)).toBe('candidate-123')
    expect(candidateIdFromFile('C:/project/src/Page.vue?vue&type=style')).toBeUndefined()
  })

  it('uses a separate module identity for saved-document previews', () => {
    expect(createPreviewDocumentId('C:/project/src/Page.vue')).toBe('C:/project/src/Page.vue?vue-designer-preview')
  })
})

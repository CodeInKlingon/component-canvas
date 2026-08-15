import { describe, expect, it } from 'vitest'
import { parseDesignerDocument } from './parse'
import { applyStyleOperation, getDesignerStyleRules } from './style'

describe('Vue SFC style support', () => {
  it('discovers matching rules across multiple scoped and unscoped blocks', () => {
    const source = `<template><main class="page">Text</main></template>
<style>.page { color: red; }</style>
<style scoped>.page { padding: 1rem; }</style>`
    const node = parseDesignerDocument(source).tree[0]!
    expect(getDesignerStyleRules(source, node.id)).toEqual([
      expect.objectContaining({ selector: '.page', declarations: [expect.objectContaining({ property: 'color', value: 'red' })] }),
      expect.objectContaining({ selector: '.page', declarations: [expect.objectContaining({ property: 'padding', value: '1rem' })] }),
    ])
  })

  it('adds a scoped style block when the document has none', () => {
    const source = '<template><main>Text</main></template>'
    const node = parseDesignerDocument(source).tree[0]!
    const result = applyStyleOperation(source, { nodeId: node.id, selector: '.page', property: 'color', value: 'red' })
    expect(result).toContain('<main class="page">')
    expect(result).toContain('<style scoped>')
    expect(parseDesignerDocument(result).diagnostics).toEqual([])
  })

  it('surfaces PostCSS parse failures and rejects dynamic class mutations', () => {
    const malformed = '<template><main class="page" /></template><style>.page { color: </style>'
    const malformedNode = parseDesignerDocument(malformed).tree[0]!
    expect(() => getDesignerStyleRules(malformed, malformedNode.id)).toThrow()

    const dynamic = '<template><main :class="classes" /></template>'
    const dynamicNode = parseDesignerDocument(dynamic).tree[0]!
    expect(() => applyStyleOperation(dynamic, {
      nodeId: dynamicNode.id, selector: '.page', property: 'color', value: 'red',
    })).toThrow('Dynamic classes')
  })
})

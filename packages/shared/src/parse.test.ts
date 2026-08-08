import { describe, expect, it } from 'vitest'
import { instrumentDesignerNodes, parseDesignerDocument } from './parse'

describe('parseDesignerDocument', () => {
  it('builds a tree and locks structural directives', () => {
    const source = `<template><main><Card title="One">Hello</Card><p v-for="item in items">{{ item }}</p></main></template>`
    const result = parseDesignerDocument(source)

    expect(result.diagnostics).toEqual([])
    expect(result.tree[0]).toMatchObject({ id: 'node-0', kind: 'element', label: 'main' })
    expect(result.tree[0]?.children[0]).toMatchObject({ kind: 'component', label: 'Card' })
    expect(result.tree[0]?.children[0]?.children[0]).toMatchObject({ kind: 'text', label: 'Hello' })
    expect(result.tree[0]?.children[1]).toMatchObject({ editable: false })
  })

  it('adds ephemeral attributes without changing text content', () => {
    const source = `<template>\n  <main><Card>Hello</Card></main>\n</template>`
    expect(instrumentDesignerNodes(source)).toContain('<main data-vue-designer-id="node-0">')
    expect(instrumentDesignerNodes(source)).toContain('<Card data-vue-designer-id="node-1">Hello</Card>')
  })
})

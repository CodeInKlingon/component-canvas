import { describe, expect, it } from 'vitest'
import { applySourceOperation, instrumentDesignerNodes, parseDesignerDocument } from './parse'

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

  it('updates text and supported attributes by source range', () => {
    const source = `<template><Card title="One" :count="3">Hello</Card></template>`
    const parsed = parseDesignerDocument(source)
    const card = parsed.tree[0]!
    const text = card.children[0]!

    const withTitle = applySourceOperation(source, {
      type: 'set-attribute', nodeId: card.id, name: 'title', value: 'Two',
    })
    expect(withTitle).toContain('title="Two"')
    expect(applySourceOperation(source, {
      type: 'set-attribute', nodeId: card.id, name: 'count', value: '4',
    })).toContain(':count="4"')
    expect(applySourceOperation(withTitle, {
      type: 'set-text', nodeId: text.id, value: 'Updated & safe',
    })).toContain('Updated &amp; safe')
  })

  it('preserves arbitrary expressions as read-only attributes', () => {
    const source = `<template><Card :value="items[currentIndex]" /></template>`
    const attribute = parseDesignerDocument(source).tree[0]?.attributes[0]
    expect(attribute).toMatchObject({ kind: 'expression', editable: false })
  })

  it('adds ephemeral attributes without changing text content', () => {
    const source = `<template>\n  <main><Card>Hello</Card></main>\n</template>`
    expect(instrumentDesignerNodes(source)).toContain('<main data-vue-designer-id="node-0">')
    expect(instrumentDesignerNodes(source)).toContain('<Card data-vue-designer-id="node-1">Hello</Card>')
  })
})

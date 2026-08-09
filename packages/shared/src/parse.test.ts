import { describe, expect, it } from 'vitest'
import { applySourceOperation, instrumentDesignerNodes, parseDesignerDocument } from './parse'
import { applyStyleOperation, getDesignerStyleRules } from './style'

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

  it('adds and removes inferred prop attributes', () => {
    const source = `<template><Counter /></template>`
    const counter = parseDesignerDocument(source).tree[0]!
    const added = applySourceOperation(source, {
      type: 'set-attribute', nodeId: counter.id, name: 'count', value: 3, binding: true,
    })
    expect(added).toContain('<Counter :count="3" />')
    expect(applySourceOperation(added, {
      type: 'set-attribute', nodeId: counter.id, name: 'count', value: null,
    })).toBe(source)
  })

  it('inserts a component and its import into an editable parent', () => {
    const source = `<script setup>\n</script>\n<template>\n  <main>Existing</main>\n</template>`
    const main = parseDesignerDocument(source).tree[0]!
    const result = applySourceOperation(source, {
      type: 'insert-component',
      parentId: main.id,
      name: 'NoticeBadge',
      importSource: '../components/NoticeBadge.vue',
      defaultContent: 'New',
    })

    expect(result).toContain("import NoticeBadge from '../components/NoticeBadge.vue'")
    expect(result).toContain('    <NoticeBadge>New</NoticeBadge>\n  </main>')
    expect(parseDesignerDocument(result).diagnostics).toEqual([])

    const insertedAgain = applySourceOperation(result, {
      type: 'insert-component',
      parentId: parseDesignerDocument(result).tree[0]!.id,
      name: 'NoticeBadge',
      importSource: '../components/NoticeBadge.vue',
    })
    expect(insertedAgain.match(/import NoticeBadge/g)).toHaveLength(1)
  })

  it('rejects insertion into locked structural nodes', () => {
    const source = `<template><section v-for="item in items"><span>Item</span></section></template>`
    const section = parseDesignerDocument(source).tree[0]!
    expect(section.children[0]).toMatchObject({ editable: false })
    expect(() => applySourceOperation(source, {
      type: 'insert-component',
      parentId: section.id,
      name: 'Card',
      importSource: './Card.vue',
    })).toThrow('editable elements')
  })

  it('duplicates, moves, and removes sibling elements', () => {
    const source = `<template>\n  <main>\n    <section>A</section>\n    <section>B</section>\n  </main>\n</template>`
    const sections = parseDesignerDocument(source).tree[0]!.children
    const duplicated = applySourceOperation(source, { type: 'duplicate-node', nodeId: sections[0]!.id })
    expect(duplicated.match(/<section>A<\/section>/g)).toHaveLength(2)

    const moved = applySourceOperation(source, {
      type: 'move-node',
      nodeId: sections[1]!.id,
      targetId: sections[0]!.id,
      position: 'before',
    })
    expect(moved.indexOf('<section>B')).toBeLessThan(moved.indexOf('<section>A'))
    expect(parseDesignerDocument(moved).diagnostics).toEqual([])

    const removed = applySourceOperation(source, { type: 'remove-node', nodeId: sections[0]!.id })
    expect(removed).not.toContain('<section>A</section>')
    expect(removed).toContain('<section>B</section>')
  })

  it('moves nodes inside containers and rejects descendant cycles', () => {
    const source = `<template>\n  <main>\n    <aside><span>Child</span></aside>\n    <section>Move me</section>\n  </main>\n</template>`
    const main = parseDesignerDocument(source).tree[0]!
    const aside = main.children[0]!
    const section = main.children[1]!
    const moved = applySourceOperation(source, {
      type: 'move-node', nodeId: section.id, targetId: aside.id, position: 'inside',
    })
    expect(moved).toContain('<aside><span>Child</span>\n      <section>Move me</section>')
    expect(moved).not.toMatch(/<section>Move me<\/section>\n\s*\n/)
    expect(() => applySourceOperation(source, {
      type: 'move-node', nodeId: aside.id, targetId: aside.children[0]!.id, position: 'inside',
    })).toThrow('descendants')
  })

  it('does nothing when appending the current last child to its parent', () => {
    const source = `<template>\n  <section>\n    <Card name="first" />\n    <Card name="last" />\n  </section>\n</template>`
    const section = parseDesignerDocument(source).tree[0]!
    const last = section.children.at(-1)!
    expect(applySourceOperation(source, {
      type: 'move-node', nodeId: last.id, targetId: section.id, position: 'inside',
    })).toBe(source)
  })

  it('represents named slot templates as editable tree containers', () => {
    const source = `<template><Card><template #header><h2>Title</h2></template><p>Body</p></Card></template>`
    const card = parseDesignerDocument(source).tree[0]!
    expect(card.children[0]).toMatchObject({ label: 'slot:header', editable: true })
    expect(card.children[0]?.attributes[0]).toMatchObject({ name: 'slot', value: 'header', editable: false })
    expect(card.children[0]?.children[0]).toMatchObject({ label: 'h2' })
  })

  it('reads, updates, adds, and removes local CSS declarations', () => {
    const source = `<template><main class="page">Content</main></template>\n<style scoped>\n.page {\n  display: flex;\n}\n</style>`
    const main = parseDesignerDocument(source).tree[0]!
    expect(getDesignerStyleRules(source, main.id)[0]).toMatchObject({
      selector: '.page', declarations: [{ property: 'display', value: 'flex' }],
    })
    const updated = applyStyleOperation(source, { nodeId: main.id, selector: '.page', property: 'display', value: 'grid' })
    expect(updated).toContain('display: grid;')
    const added = applyStyleOperation(updated, { nodeId: main.id, selector: '.page', property: 'gap', value: '12px' })
    expect(added).toContain('gap: 12px;')
    expect(applyStyleOperation(added, { nodeId: main.id, selector: '.page', property: 'display', value: null })).not.toContain('display:')
  })

  it('creates a local class and scoped style block when needed', () => {
    const source = `<template><section>Content</section></template>`
    const section = parseDesignerDocument(source).tree[0]!
    const result = applyStyleOperation(source, { nodeId: section.id, selector: '.designer-node-0', property: 'padding', value: '16px' })
    expect(result).toContain('class="designer-node-0"')
    expect(result).toContain('<style scoped>')
    expect(result).toContain('padding: 16px;')
  })

  it('adds ephemeral attributes without changing text content', () => {
    const source = `<template>\n  <main><Card>Hello</Card></main>\n</template>`
    expect(instrumentDesignerNodes(source)).toContain('<main data-vue-designer-id="node-0">')
    expect(instrumentDesignerNodes(source)).toContain('<Card data-vue-designer-id="node-1">Hello</Card>')
  })
})

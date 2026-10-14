import { describe, expect, it } from 'vitest'
import vue, { createVueDocument, parseDesignerDocument } from './index'

describe('createVueDocument', () => {
  it('creates an editable starter SFC titled from the document name', () => {
    const source = createVueDocument('PricingPage')
    const parsed = parseDesignerDocument(source)
    expect(parsed.diagnostics).toEqual([])
    expect(parsed.tree[0]).toMatchObject({ label: 'main', editable: true })
    expect(source).toContain('<h1>Pricing Page</h1>')
    expect(source).toContain('<style scoped>')
  })

  it('is exposed through the framework contract', () => {
    expect(vue().createDocument({ name: 'about-us' })).toContain('<h1>about us</h1>')
  })
})

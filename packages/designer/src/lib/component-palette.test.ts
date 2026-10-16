import { describe, expect, it } from 'vitest'
import type { DesignerComponentMetadata } from '@component-canvas/shared'
import { createInsertComponentOperation, findComponentForTag, groupComponents, relativeImport } from './component-palette'

function component(overrides: Partial<DesignerComponentMetadata>): DesignerComponentMetadata {
  return {
    id: 'components:Card', name: 'Card', tag: 'Card', label: 'Card', category: 'Components',
    library: { id: 'components', label: 'Components' },
    import: { kind: 'file', from: 'src/components/Card.vue', imported: 'default', local: 'Card' },
    metaLoaded: false, props: [], events: [], slots: [],
    ...overrides,
  }
}

describe('component palette', () => {
  it('matches tags regardless of casing and prefers an exact tag match', () => {
    const local = component({})
    const library = component({ id: 'ui:VBtn', name: 'VBtn', tag: 'v-btn', library: { id: 'ui', label: 'UI' } })
    const other = component({ id: 'other:VBtn', name: 'VBtn', tag: 'VBtn', library: { id: 'other', label: 'Other' } })
    expect(findComponentForTag([local, library], 'card')).toBe(local)
    expect(findComponentForTag([local, other, library], 'v-btn')).toBe(library)
    expect(findComponentForTag([local, other, library], 'VBtn')).toBe(other)
    expect(findComponentForTag([local], 'missing-thing')).toBeNull()
  })

  it('groups components by library and filters by search terms', () => {
    const card = component({})
    const button = component({ id: 'ui:VBtn', name: 'VBtn', tag: 'v-btn', label: 'Button', library: { id: 'ui', label: 'UI' } })
    expect(groupComponents([card, button]).map((group) => [group.label, group.components.length])).toEqual([['Components', 1], ['UI', 1]])
    expect(groupComponents([card, button], 'ui butt')).toEqual([{ id: 'ui', label: 'UI', components: [button] }])
  })

  it('creates insert operations for file, package, and import-free components', () => {
    expect(relativeImport('src/pages/Home.vue', 'src/components/Card.vue')).toBe('../components/Card.vue')
    expect(createInsertComponentOperation(component({ defaultContent: 'Hi' }), 'src/pages/Home.vue', 'node-1', 'inside')).toEqual({
      type: 'insert-component', parentId: 'node-1', tag: 'Card', defaultContent: 'Hi', position: 'inside',
      import: { from: '../components/Card.vue', imported: 'default', local: 'Card' },
    })
    expect(createInsertComponentOperation(component({
      tag: 'v-btn', import: { kind: 'package', from: 'vuetify/components', imported: 'VBtn', local: 'VBtn' },
    }), 'src/pages/Home.vue', 'node-1', 'after').import).toEqual({ from: 'vuetify/components', imported: 'VBtn', local: 'VBtn' })
    expect(createInsertComponentOperation(component({ import: null }), 'src/pages/Home.vue', 'node-1', 'inside').import).toBeUndefined()
  })
})

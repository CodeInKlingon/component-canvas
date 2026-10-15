import { describe, expect, it } from 'vitest'
import { availableToolIds, toolDefinition, toolIds } from './tool-registry'

const allCapabilities = { styles: true, components: true, ai: true }
const noCapabilities = { styles: false, components: false, ai: false }

describe('tool registry availability', () => {
  it('hides the components tool in read-only mode but keeps the others', () => {
    const editable = availableToolIds({ capabilities: allCapabilities, readOnly: false })
    expect([...editable].sort()).toEqual(['components', 'layers', 'props', 'source', 'style'])

    const readOnly = availableToolIds({ capabilities: allCapabilities, readOnly: true })
    expect(readOnly.has('components')).toBe(false)
    expect([...readOnly].sort()).toEqual(['layers', 'props', 'source', 'style'])
  })

  it('hides capability-gated tools', () => {
    const none = availableToolIds({ capabilities: noCapabilities, readOnly: false })
    expect(none.has('components')).toBe(false)
    expect(none.has('style')).toBe(false)

    const beforeFrameworkLoads = availableToolIds({ capabilities: null, readOnly: false })
    expect([...beforeFrameworkLoads].sort()).toEqual(['layers', 'props', 'source'])
  })

  it('looks tools up by id and keeps the default order', () => {
    expect(toolDefinition('style')?.label).toBe('Style')
    expect(toolDefinition('missing')).toBeUndefined()
    expect(toolIds).toEqual(['layers', 'components', 'props', 'style', 'source'])
  })
})

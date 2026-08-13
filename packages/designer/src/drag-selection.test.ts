import { describe, expect, it } from 'vitest'
import { captureDragSelection, findDragSelectionOffset } from './drag-selection'

describe('drag selection', () => {
  const source = '<main><p>First</p><p>Second</p></main>'

  it('captures only a selected dragged node', () => {
    expect(captureDragSelection('node-1', 'node-1', source, { start: 6, end: 18 })).toEqual({
      nodeId: 'node-1',
      source: '<p>First</p>',
      occurrence: 0,
    })
    expect(captureDragSelection('node-2', 'node-1', source, { start: 6, end: 18 })).toBeNull()
  })

  it('locates the selected node after a drop reorders the source', () => {
    const selection = captureDragSelection('node-1', 'node-1', source, { start: 6, end: 18 })!
    expect(findDragSelectionOffset('<main><p>Second</p><p>First</p></main>', selection)).toBe(19)
  })

  it('tracks the original occurrence when node source is duplicated', () => {
    const duplicateSource = '<main><p>Same</p><p>Same</p></main>'
    const selection = captureDragSelection('node-2', 'node-2', duplicateSource, { start: 17, end: 28 })!
    expect(selection.occurrence).toBe(1)
    expect(findDragSelectionOffset(duplicateSource, selection)).toBe(17)
  })
})

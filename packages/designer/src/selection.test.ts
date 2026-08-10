import { describe, expect, it } from 'vitest'
import type { DesignerNode } from '@vue-designer/shared'
import { findNodeAtOffset, findNodeAtPath, findNodePath, findRenderedSelection } from './selection'

function node(id: string, start: number, end: number, children: DesignerNode[] = []): DesignerNode {
  return { id, kind: 'element', label: id, range: { start, end }, editable: true, attributes: [], children }
}

describe('selection reconciliation', () => {
  const tree = [node('root', 10, 100, [node('first', 20, 30), node('second', 40, 80, [node('text', 50, 60)])])]

  it('finds the deepest node containing a source offset', () => {
    expect(findNodeAtOffset(tree, 55)?.id).toBe('text')
    expect(findNodeAtOffset(tree, 35)?.id).toBe('root')
    expect(findNodeAtOffset(tree, 5)).toBeNull()
  })

  it('restores the same structural position after IDs change', () => {
    const path = findNodePath(tree, 'text')
    const reparsed = [node('new-root', 12, 102, [node('new-first', 22, 32), node('new-second', 42, 82, [node('new-text', 52, 62)])])]
    expect(findNodeAtPath(reparsed, path)?.id).toBe('new-text')
  })

  it('maps text selection to its nearest rendered ancestor', () => {
    const text = { ...node('copy', 50, 60), kind: 'text' as const, value: 'Copy' }
    const renderedTree = [node('root', 10, 100, [node('button', 40, 80, [text])])]

    expect(findRenderedSelection(renderedTree, 'copy')?.id).toBe('button')
    expect(findRenderedSelection(renderedTree, 'button')?.id).toBe('button')
    expect(findRenderedSelection(renderedTree, 'missing')).toBeNull()
  })
})

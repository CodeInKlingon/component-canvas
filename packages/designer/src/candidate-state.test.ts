import { describe, expect, it } from 'vitest'
import type { DesignerNode } from '@vue-designer/shared'
import { isCurrentCandidateRequest, resolveCandidateSelection } from './candidate-state'

function node(id: string, start: number, end: number, children: DesignerNode[] = []): DesignerNode {
  return {
    id, kind: 'element', label: id, range: { start, end }, editable: true,
    capabilities: { canContainChildren: true }, attributes: [], children,
  }
}

describe('candidate response state', () => {
  it('accepts only the latest response for the unchanged source and document', () => {
    expect(isCurrentCandidateRequest(2, 2, 'source', 'source', 'Page.fake', 'Page.fake')).toBe(true)
    expect(isCurrentCandidateRequest(1, 2, 'source', 'source', 'Page.fake', 'Page.fake')).toBe(false)
    expect(isCurrentCandidateRequest(2, 2, 'source', 'changed', 'Page.fake', 'Page.fake')).toBe(false)
    expect(isCurrentCandidateRequest(2, 2, 'source', 'source', 'Page.fake', 'Other.fake')).toBe(false)
  })

  it('prefers a returned selection offset, then identity, then structural path', () => {
    const tree = [node('new-root', 0, 100, [node('new-first', 10, 30), node('same-id', 40, 60)])]
    expect(resolveCandidateSelection(tree, 15, 'same-id', [0, 1])).toBe('new-first')
    expect(resolveCandidateSelection(tree, null, 'same-id', [0, 0])).toBe('same-id')
    expect(resolveCandidateSelection(tree, null, 'missing', [0, 0])).toBe('new-first')
    expect(resolveCandidateSelection(tree, null, 'missing', [9])).toBeNull()
  })
})

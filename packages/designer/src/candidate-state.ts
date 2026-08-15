import type { DesignerNode } from '@vue-designer/shared'
import { findNode, findNodeAtOffset, findNodeAtPath } from './selection'

export function isCurrentCandidateRequest(
  request: number,
  latestRequest: number,
  requestSource: string,
  currentSource: string,
  requestPath: string,
  currentPath: string | undefined,
): boolean {
  return request === latestRequest && requestSource === currentSource && requestPath === currentPath
}

export function resolveCandidateSelection(
  tree: DesignerNode[],
  selectionOffset: number | null | undefined,
  selectedNodeId: string | null,
  selectedPath: number[] | null,
): string | null {
  return (selectionOffset == null ? null : findNodeAtOffset(tree, selectionOffset)?.id)
    ?? findNode(tree, selectedNodeId)?.id
    ?? findNodeAtPath(tree, selectedPath)?.id
    ?? null
}

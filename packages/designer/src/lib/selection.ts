import type { DesignerNode } from '@component-canvas/shared'

export function findNode(nodes: DesignerNode[], id: string | null): DesignerNode | null {
  if (!id) return null
  for (const node of nodes) {
    if (node.id === id) return node
    const child = findNode(node.children, id)
    if (child) return child
  }
  return null
}

export function findNodePath(nodes: DesignerNode[], id: string | null): number[] | null {
  if (!id) return null
  for (const [index, node] of nodes.entries()) {
    if (node.id === id) return [index]
    const childPath = findNodePath(node.children, id)
    if (childPath) return [index, ...childPath]
  }
  return null
}

export function findNodeAtPath(nodes: DesignerNode[], path: number[] | null): DesignerNode | null {
  if (!path) return null
  let siblings = nodes
  let node: DesignerNode | undefined
  for (const index of path) {
    node = siblings[index]
    if (!node) return null
    siblings = node.children
  }
  return node ?? null
}

export function findNodeAtOffset(nodes: DesignerNode[], offset: number): DesignerNode | null {
  for (const node of nodes) {
    if (node.range.start <= offset && offset <= node.range.end) {
      return findNodeAtOffset(node.children, offset) ?? node
    }
  }
  return null
}

export function findRenderedSelection(nodes: DesignerNode[], targetId: string, renderedAncestor: DesignerNode | null = null): DesignerNode | null {
  for (const node of nodes) {
    const nextAncestor = node.kind === 'text' ? renderedAncestor : node
    if (node.id === targetId) return nextAncestor
    const match = findRenderedSelection(node.children, targetId, nextAncestor)
    if (match) return match
  }
  return null
}

export function reconcileCollapsedTree(previous: DesignerNode[], next: DesignerNode[], collapsed: ReadonlySet<string>): Set<string> {
  const reconciled = new Set<string>()
  for (const id of collapsed) {
    const path = findNodePath(previous, id)
    const node = path ? findNodeAtPath(next, path) : null
    if (node && node.children.length) reconciled.add(node.id)
  }
  return reconciled
}

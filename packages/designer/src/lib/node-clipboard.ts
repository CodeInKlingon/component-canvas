import type { DesignerNode } from '@vue-designer/shared'

export const nodeClipboardMime = 'application/x-vue-designer-node+json'

export interface NodeClipboardPayload {
  kind: 'vue-designer-node'
  version: 1
  nodeKind: DesignerNode['kind']
  source: string
}

export function serializeNodeClipboard(node: DesignerNode, documentSource: string): string {
  return JSON.stringify({
    kind: 'vue-designer-node',
    version: 1,
    nodeKind: node.kind,
    source: documentSource.slice(node.range.start, node.range.end),
  } satisfies NodeClipboardPayload)
}

export function parseNodeClipboard(value: string): NodeClipboardPayload | null {
  try {
    const payload = JSON.parse(value) as Record<string, unknown>
    if (payload.kind !== 'vue-designer-node' || payload.version !== 1) return null
    if (!['element', 'component', 'text'].includes(String(payload.nodeKind))) return null
    if (typeof payload.source !== 'string' || !payload.source.trim() || payload.source.length > 1_000_000) return null
    return payload as unknown as NodeClipboardPayload
  } catch {
    return null
  }
}

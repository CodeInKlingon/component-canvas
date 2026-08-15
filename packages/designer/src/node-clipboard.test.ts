import { describe, expect, it } from 'vitest'
import type { DesignerNode } from '@vue-designer/shared'
import { parseNodeClipboard, serializeNodeClipboard } from './node-clipboard'

describe('node clipboard payloads', () => {
  it('serializes the exact selected node source', () => {
    const source = '<template><Card :count="count"><strong>Title</strong></Card></template>'
    const node: DesignerNode = {
      id: 'node-0',
      kind: 'component',
      label: 'Card',
      range: { start: source.indexOf('<Card'), end: source.indexOf('</template>') },
      editable: true,
      capabilities: { canContainChildren: true },
      attributes: [],
      children: [],
    }
    expect(parseNodeClipboard(serializeNodeClipboard(node, source))).toEqual({
      kind: 'vue-designer-node', version: 1, nodeKind: 'component',
      source: '<Card :count="count"><strong>Title</strong></Card>',
    })
  })

  it('rejects malformed and unsupported payloads', () => {
    expect(parseNodeClipboard('not json')).toBeNull()
    expect(parseNodeClipboard(JSON.stringify({ kind: 'vue-designer-node', version: 2, nodeKind: 'element', source: '<p />' }))).toBeNull()
    expect(parseNodeClipboard(JSON.stringify({ kind: 'vue-designer-node', version: 1, nodeKind: 'unknown', source: '<p />' }))).toBeNull()
  })
})

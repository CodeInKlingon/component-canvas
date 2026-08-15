import { NodeTypes, parse as parseTemplate, type TemplateChildNode } from '@vue/compiler-dom'
import { parse as parseSfc } from '@vue/compiler-sfc'
import type {
  DesignerAttribute,
  DesignerDiagnostic,
  DesignerNode,
  DesignerSourceOperation,
  DesignerSourceOperationResult,
  ParsedDesignerDocument,
} from '@vue-designer/shared'

interface ParseState {
  nextId: number
  templateOffset: number
  insertions: Array<{ offset: number; text: string }>
}

const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])

function meaningfulText(content: string): string {
  return content.replace(/\s+/g, ' ').trim()
}

function convertChildren(children: TemplateChildNode[], state: ParseState, ancestorLock?: string): DesignerNode[] {
  const result: DesignerNode[] = []

  for (const child of children) {
    if (child.type === NodeTypes.TEXT) {
      const text = meaningfulText(child.content)
      if (!text) continue
      result.push({
        id: `node-${state.nextId++}`,
        kind: 'text',
        label: text.length > 32 ? `${text.slice(0, 29)}...` : text,
        value: text,
        range: {
          start: state.templateOffset + child.loc.start.offset,
          end: state.templateOffset + child.loc.end.offset,
        },
        editable: !ancestorLock,
        capabilities: { canContainChildren: false },
        lockedReason: ancestorLock,
        attributes: [],
        children: [],
      })
      continue
    }

    if (child.type !== NodeTypes.ELEMENT) continue

    const id = `node-${state.nextId++}`
    const structuralDirective = child.props.find((prop) =>
      prop.type === NodeTypes.DIRECTIVE && ['for', 'if', 'else-if', 'else'].includes(prop.name),
    )
    const lockedReason = ancestorLock ?? (structuralDirective
      ? `Structural directive v-${structuralDirective.name} is not visually editable yet`
      : undefined)
    const slotDirective = child.props.find((prop) => prop.type === NodeTypes.DIRECTIVE && prop.name === 'slot')
    const slotName = slotDirective?.type === NodeTypes.DIRECTIVE && slotDirective.arg?.type === NodeTypes.SIMPLE_EXPRESSION
      ? slotDirective.arg.content
      : undefined
    const attributes: DesignerAttribute[] = child.props.map((prop) => {
      const range = {
        start: state.templateOffset + prop.loc.start.offset,
        end: state.templateOffset + prop.loc.end.offset,
      }
      if (prop.type === NodeTypes.ATTRIBUTE) {
        return {
          name: prop.name,
          value: prop.value?.content ?? '',
          kind: 'static' as const,
          editable: !lockedReason,
          range,
        }
      }

      const argument = prop.arg?.type === NodeTypes.SIMPLE_EXPRESSION ? prop.arg.content : undefined
      const name = prop.name === 'slot' ? 'slot' : argument ?? `v-${prop.name}`
      const value = prop.exp?.type === NodeTypes.SIMPLE_EXPRESSION ? prop.exp.content : ''
      const literal = prop.name === 'bind' && /^(?:true|false|null|-?\d+(?:\.\d+)?|'[^']*'|"[^"]*")$/.test(value)
      return {
        name,
        value: prop.name === 'slot' ? argument ?? 'default' : value,
        kind: literal ? 'literal-binding' as const : 'expression' as const,
        editable: literal && !lockedReason,
        range,
      }
    })
    state.insertions.push({
      offset: state.templateOffset + child.loc.start.offset + 1 + child.tag.length,
      text: ` data-vue-designer-id="${id}"`,
    })

    result.push({
      id,
      kind: child.tagType === 1 ? 'component' : 'element',
      label: slotName ? `slot:${slotName}` : child.tag,
      range: {
        start: state.templateOffset + child.loc.start.offset,
        end: state.templateOffset + child.loc.end.offset,
      },
      editable: !lockedReason,
      capabilities: { canContainChildren: !lockedReason && !voidTags.has(child.tag.toLowerCase()) },
      lockedReason,
      attributes,
      children: convertChildren(child.children, state, lockedReason),
    })
  }

  return result
}

function parse(source: string): { parsed: ParsedDesignerDocument; state?: ParseState } {
  const result = parseSfc(source, { sourceMap: false })
  const diagnostics: DesignerDiagnostic[] = result.errors.map((error) => ({
    message: typeof error === 'string' ? error : error.message,
    severity: 'error',
  }))
  const template = result.descriptor.template
  if (!template || diagnostics.length) return { parsed: { tree: [], diagnostics } }

  try {
    const root = parseTemplate(template.content, { comments: true })
    const state: ParseState = {
      nextId: 0,
      templateOffset: template.loc.start.offset,
      insertions: [],
    }
    return { parsed: { tree: convertChildren(root.children, state), diagnostics }, state }
  } catch (error) {
    diagnostics.push({
      message: error instanceof Error ? error.message : 'Unable to parse Vue template',
      severity: 'error',
    })
    return { parsed: { tree: [], diagnostics } }
  }
}

export function parseDesignerDocument(source: string): ParsedDesignerDocument {
  return parse(source).parsed
}

export function instrumentDesignerNodes(source: string): string {
  const result = parse(source)
  if (!result.state || result.parsed.diagnostics.some((item) => item.severity === 'error')) return source

  let instrumented = source
  for (const insertion of result.state.insertions.sort((a, b) => b.offset - a.offset)) {
    instrumented = `${instrumented.slice(0, insertion.offset)}${insertion.text}${instrumented.slice(insertion.offset)}`
  }
  return instrumented
}

function findNode(nodes: DesignerNode[], nodeId: string): DesignerNode | undefined {
  for (const node of nodes) {
    if (node.id === nodeId) return node
    const child = findNode(node.children, nodeId)
    if (child) return child
  }
}

function lineIndent(source: string, offset: number): string {
  const start = source.lastIndexOf('\n', offset - 1) + 1
  return source.slice(start, offset).match(/^\s*/)?.[0] ?? ''
}

function removalRange(source: string, node: DesignerNode): { start: number; end: number } {
  const lineStart = source.lastIndexOf('\n', node.range.start - 1) + 1
  const prefix = source.slice(lineStart, node.range.start)
  let start = /^\s*$/.test(prefix) ? lineStart : node.range.start
  let end = node.range.end
  const lineEnd = source.indexOf('\n', end)
  if (lineEnd >= 0 && /^\s*$/.test(source.slice(end, lineEnd))) end = lineEnd + 1
  if (start === 0 && end < source.length && source[end] === '\n') end++
  return { start, end }
}

function insertionPoint(source: string, target: DesignerNode, position: 'before' | 'inside' | 'after') {
  if (position === 'before') {
    const offset = removalRange(source, target).start
    return { offset, replaceEnd: offset, indent: lineIndent(source, target.range.start) }
  }
  if (position === 'after') {
    const offset = removalRange(source, target).end
    return { offset, replaceEnd: offset, indent: lineIndent(source, target.range.start) }
  }

  if (target.kind === 'text') throw new Error('Text nodes cannot contain children')
  if (target.kind === 'element' && voidTags.has(target.label)) throw new Error('The target cannot contain children')
  const closingTagStart = closingTagOffset(source, target)
  if (closingTagStart < target.range.start) throw new Error('The target cannot contain children')
  let offset = closingTagStart
  while (offset > target.range.start && /\s/.test(source[offset - 1] ?? '')) offset--
  return { offset, replaceEnd: closingTagStart, indent: `${lineIndent(source, target.range.start)}  `, closingIndent: lineIndent(source, target.range.start) }
}

function closingTagOffset(source: string, node: DesignerNode): number {
  const tag = source.slice(node.range.start, node.range.end).match(/^<([^\s/>]+)/)?.[1]
  return tag ? source.lastIndexOf(`</${tag}`, node.range.end) : -1
}

function escapeText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function escapeAttribute(value: string): string {
  return escapeText(value).replaceAll('"', '&quot;')
}

export function applySourceOperation(source: string, operation: DesignerSourceOperation): string {
  return applySourceOperationWithResult(source, operation).source
}

export function applySourceOperationWithResult(source: string, operation: DesignerSourceOperation): DesignerSourceOperationResult {
  const parsed = parseDesignerDocument(source)
  if (parsed.diagnostics.some((item) => item.severity === 'error')) throw new Error('Cannot edit an invalid document')
  const targetId = operation.type === 'insert-component' || operation.type === 'insert-native'
    ? operation.parentId
    : operation.type === 'insert-node' ? operation.targetId
    : operation.nodeId
  const node = findNode(parsed.tree, targetId)
  if (!node) throw new Error('Selected node no longer exists')

  if (operation.type === 'remove-node') {
    if (!node.editable) throw new Error('Locked nodes cannot be removed')
    const range = removalRange(source, node)
    return { source: `${source.slice(0, range.start)}${source.slice(range.end)}` }
  }

  if (operation.type === 'duplicate-node') {
    if (!node.editable) throw new Error('Locked nodes cannot be duplicated')
    const range = removalRange(source, node)
    const snippet = source.slice(node.range.start, node.range.end)
    const indent = lineIndent(source, node.range.start)
    return {
      source: `${source.slice(0, range.end)}${indent}${snippet}\n${source.slice(range.end)}`,
      selectionOffset: range.end + indent.length,
    }
  }

  if (operation.type === 'insert-node') {
    if (!node.editable) throw new Error('Nodes can only be pasted at editable targets')
    if (!operation.source.trim()) throw new Error('The clipboard node is empty')
    const insertion = insertionPoint(source, node, operation.position)
    const prefix = operation.position === 'inside' ? `\n${insertion.indent}` : insertion.indent
    const suffix = operation.position === 'inside' ? `\n${insertion.closingIndent ?? ''}` : '\n'
    const result = `${source.slice(0, insertion.offset)}${prefix}${operation.source}${suffix}${source.slice(insertion.replaceEnd)}`
    const reparsed = parseDesignerDocument(result)
    const parseError = reparsed.diagnostics.find((item) => item.severity === 'error')
    if (parseError) throw new Error(parseError.message)
    return { source: result, selectionOffset: insertion.offset + prefix.length }
  }

  if (operation.type === 'move-node') {
    const target = findNode(parsed.tree, operation.targetId)
    if (!target) throw new Error('Drop target no longer exists')
    if (!node.editable || !target.editable) throw new Error('Locked nodes cannot be moved')
    if (node.id === target.id) throw new Error('A node cannot be moved onto itself')
    if (target.range.start >= node.range.start && target.range.end <= node.range.end) {
      throw new Error('A node cannot be moved into its own descendants')
    }
    if (operation.position === 'inside' && target.children.at(-1)?.id === node.id) {
      return { source }
    }

    const remove = removalRange(source, node)
    const insertion = insertionPoint(source, target, operation.position)
    const snippet = source.slice(node.range.start, node.range.end)
    let withoutNode = `${source.slice(0, remove.start)}${source.slice(remove.end)}`
    let offset = insertion.offset
    let afterOffset = insertion.replaceEnd
    if (offset > remove.end) offset -= remove.end - remove.start
    if (afterOffset > remove.end) afterOffset -= remove.end - remove.start
    const before = withoutNode.slice(0, offset)
    const after = withoutNode.slice(afterOffset)
    const separator = operation.position === 'inside'
      ? `\n${insertion.indent}${snippet}\n${insertion.closingIndent ?? ''}`
      : `${insertion.indent}${snippet}\n`
    return { source: `${before}${separator}${after}` }
  }

  if (operation.type === 'insert-component') {
    const position = operation.position ?? 'inside'
    if (!node.editable || (position === 'inside' && node.kind === 'text')) throw new Error('Components can only be inserted at editable elements')
    if (position === 'inside' && node.kind === 'element' && voidTags.has(node.label)) throw new Error('The selected element cannot contain children')
    const insertion = insertionPoint(source, node, position)
    const content = operation.defaultContent ?? operation.name
    const markup = `<${operation.name}>${escapeText(content)}</${operation.name}>`
    const prefix = position === 'inside' ? `\n${insertion.indent}` : insertion.indent
    const suffix = position === 'inside' ? `\n${insertion.closingIndent ?? ''}` : '\n'
    let result = `${source.slice(0, insertion.offset)}${prefix}${markup}${suffix}${source.slice(insertion.replaceEnd)}`

    const sfc = parseSfc(result, { sourceMap: false }).descriptor
    const importPattern = new RegExp(`\\bimport\\s+${operation.name}\\b`)
    if (!importPattern.test(sfc.scriptSetup?.content ?? '')) {
      const importStatement = `import ${operation.name} from '${operation.importSource}'\n`
      if (sfc.scriptSetup) {
        const insertAt = sfc.scriptSetup.loc.start.offset + sfc.scriptSetup.content.length
        result = `${result.slice(0, insertAt)}${importStatement}${result.slice(insertAt)}`
      } else {
        const templateStart = result.indexOf('<template')
        result = `${result.slice(0, templateStart)}<script setup>\n${importStatement}</script>\n\n${result.slice(templateStart)}`
      }
    }
    return { source: result }
  }

  if (operation.type === 'insert-native') {
    const position = operation.position ?? 'inside'
    if (!node.editable || (position === 'inside' && node.kind === 'text')) throw new Error('Native elements can only be inserted at editable elements')
    if (position === 'inside' && node.kind === 'element' && voidTags.has(node.label)) throw new Error('The selected element cannot contain children')
    if (!/^[a-z][a-z0-9-]*$/.test(operation.tag)) throw new Error('Invalid native element tag')
    if ((operation.contentModel === 'void') !== voidTags.has(operation.tag)) {
      throw new Error('Native element content model does not match its tag')
    }

    const attributes = Object.entries(operation.attributes ?? {}).map(([name, value]) => {
      if (!/^[a-zA-Z_:][\w:.-]*$/.test(name)) throw new Error('Invalid native element attribute')
      if (typeof value === 'string') return ` ${name}="${escapeAttribute(value)}"`
      return ` :${name}="${escapeAttribute(JSON.stringify(value))}"`
    }).join('')
    const children = operation.defaultChildren
      ?? (operation.defaultContent === undefined ? '' : escapeText(operation.defaultContent))
    if (operation.contentModel === 'void' && children) throw new Error('Void elements cannot have children')
    const markup = operation.contentModel === 'void'
      ? `<${operation.tag}${attributes}>`
      : `<${operation.tag}${attributes}>${children}</${operation.tag}>`

    const insertion = insertionPoint(source, node, position)
    const prefix = position === 'inside' ? `\n${insertion.indent}` : insertion.indent
    const suffix = position === 'inside' ? `\n${insertion.closingIndent ?? ''}` : '\n'
    const result = `${source.slice(0, insertion.offset)}${prefix}${markup}${suffix}${source.slice(insertion.replaceEnd)}`
    const reparsed = parseDesignerDocument(result)
    const parseError = reparsed.diagnostics.find((item) => item.severity === 'error')
    if (parseError) throw new Error(parseError.message)
    return { source: result }
  }

  if (operation.type === 'set-text') {
    if (node.kind !== 'text') throw new Error('The selected node is not text')
    return { source: `${source.slice(0, node.range.start)}${escapeText(operation.value)}${source.slice(node.range.end)}` }
  }

  const attribute = node.attributes.find((item) => item.name === operation.name)
  if (attribute && !attribute.editable) throw new Error('The selected attribute is not editable')
  if (operation.value === null) {
    if (!attribute) return { source }
    let start = attribute.range.start
    if (/\s/.test(source[start - 1] ?? '')) start--
    return { source: `${source.slice(0, start)}${source.slice(attribute.range.end)}` }
  }

  const binding = operation.binding || attribute?.kind === 'literal-binding'
  const serialized = typeof operation.value === 'string'
    ? operation.value
    : JSON.stringify(operation.value)
  const replacement = binding
    ? `:${operation.name}="${escapeAttribute(serialized)}"`
    : `${operation.name}="${escapeAttribute(serialized)}"`
  if (!attribute) {
    const insertAt = node.range.start + 1 + node.label.length
    return { source: `${source.slice(0, insertAt)} ${replacement}${source.slice(insertAt)}` }
  }
  return { source: `${source.slice(0, attribute.range.start)}${replacement}${source.slice(attribute.range.end)}` }
}

import { NodeTypes, parse as parseTemplate, type TemplateChildNode } from '@vue/compiler-dom'
import { parse as parseSfc } from '@vue/compiler-sfc'
import type { DesignerAttribute, DesignerDiagnostic, DesignerNode, DesignerSourceOperation } from './index'

export interface ParsedDesignerDocument {
  tree: DesignerNode[]
  diagnostics: DesignerDiagnostic[]
}

interface ParseState {
  nextId: number
  templateOffset: number
  insertions: Array<{ offset: number; text: string }>
}

function meaningfulText(content: string): string {
  return content.replace(/\s+/g, ' ').trim()
}

function convertChildren(children: TemplateChildNode[], state: ParseState): DesignerNode[] {
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
        editable: true,
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
    const lockedReason = structuralDirective
      ? `Structural directive v-${structuralDirective.name} is not visually editable yet`
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
          editable: true,
          range,
        }
      }

      const name = prop.arg?.type === NodeTypes.SIMPLE_EXPRESSION ? prop.arg.content : `v-${prop.name}`
      const value = prop.exp?.type === NodeTypes.SIMPLE_EXPRESSION ? prop.exp.content : ''
      const literal = prop.name === 'bind' && /^(?:true|false|null|-?\d+(?:\.\d+)?|'[^']*'|"[^"]*")$/.test(value)
      return {
        name,
        value,
        kind: literal ? 'literal-binding' as const : 'expression' as const,
        editable: literal,
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
      label: child.tag,
      range: {
        start: state.templateOffset + child.loc.start.offset,
        end: state.templateOffset + child.loc.end.offset,
      },
      editable: !lockedReason,
      lockedReason,
      attributes,
      children: convertChildren(child.children, state),
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

function escapeText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function escapeAttribute(value: string): string {
  return escapeText(value).replaceAll('"', '&quot;')
}

export function applySourceOperation(source: string, operation: DesignerSourceOperation): string {
  const parsed = parseDesignerDocument(source)
  if (parsed.diagnostics.some((item) => item.severity === 'error')) throw new Error('Cannot edit an invalid document')
  const targetId = operation.type === 'insert-component' ? operation.parentId : operation.nodeId
  const node = findNode(parsed.tree, targetId)
  if (!node) throw new Error('Selected node no longer exists')

  if (operation.type === 'insert-component') {
    if (node.kind === 'text' || !node.editable) throw new Error('Components can only be inserted into editable elements')
    const closingTagStart = source.lastIndexOf('</', node.range.end)
    if (closingTagStart < node.range.start) throw new Error('The selected element cannot contain children')

    let insertionStart = closingTagStart
    while (insertionStart > node.range.start && /\s/.test(source[insertionStart - 1] ?? '')) insertionStart--

    const lineStart = source.lastIndexOf('\n', node.range.start) + 1
    const parentIndent = source.slice(lineStart, node.range.start).match(/^\s*/)?.[0] ?? ''
    const childIndent = `${parentIndent}  `
    const content = operation.defaultContent ?? operation.name
    let result = `${source.slice(0, insertionStart)}\n${childIndent}<${operation.name}>${escapeText(content)}</${operation.name}>\n${parentIndent}${source.slice(closingTagStart)}`

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
    return result
  }

  if (operation.type === 'set-text') {
    if (node.kind !== 'text') throw new Error('The selected node is not text')
    return `${source.slice(0, node.range.start)}${escapeText(operation.value)}${source.slice(node.range.end)}`
  }

  const attribute = node.attributes.find((item) => item.name === operation.name)
  if (!attribute || !attribute.editable) throw new Error('The selected attribute is not editable')
  const replacement = attribute.kind === 'static'
    ? `${attribute.name}="${escapeAttribute(operation.value)}"`
    : `:${attribute.name}="${escapeAttribute(operation.value)}"`
  return `${source.slice(0, attribute.range.start)}${replacement}${source.slice(attribute.range.end)}`
}

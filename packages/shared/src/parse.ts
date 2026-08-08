import { NodeTypes, parse as parseTemplate, type TemplateChildNode } from '@vue/compiler-dom'
import { parse as parseSfc } from '@vue/compiler-sfc'
import type { DesignerDiagnostic, DesignerNode } from './index'

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
        range: {
          start: state.templateOffset + child.loc.start.offset,
          end: state.templateOffset + child.loc.end.offset,
        },
        editable: true,
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

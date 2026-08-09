import { parse as parseSfc } from '@vue/compiler-sfc'
import postcss, { type Declaration, type Rule } from 'postcss'
import type { DesignerNode, DesignerStyleOperation, DesignerStyleRule } from './index'
import { applySourceOperation, parseDesignerDocument } from './parse.ts'

function findNode(nodes: DesignerNode[], nodeId: string): DesignerNode | undefined {
  for (const node of nodes) {
    if (node.id === nodeId) return node
    const child = findNode(node.children, nodeId)
    if (child) return child
  }
}

function staticClasses(node: DesignerNode): string[] {
  return node.attributes.find((attribute) => attribute.name === 'class' && attribute.kind === 'static')
    ?.value.split(/\s+/).filter(Boolean) ?? []
}

export function getDesignerStyleRules(source: string, nodeId: string): DesignerStyleRule[] {
  const node = findNode(parseDesignerDocument(source).tree, nodeId)
  if (!node) return []
  const selectors = new Set(staticClasses(node).map((name) => `.${name}`))
  if (!selectors.size) return []
  const descriptor = parseSfc(source, { sourceMap: false }).descriptor
  const result: DesignerStyleRule[] = []
  for (const style of descriptor.styles) {
    const root = postcss.parse(style.content)
    root.walkRules((rule: Rule) => {
      const matched = rule.selectors.find((selector) => selectors.has(selector.trim()))
      if (!matched || rule.source?.end?.offset === undefined) return
      const declarations = rule.nodes.filter((child): child is Declaration => child.type === 'decl').flatMap((declaration) =>
        declaration.source?.start?.offset !== undefined && declaration.source.end?.offset !== undefined ? [{
          property: declaration.prop,
          value: declaration.value,
          range: {
            start: style.loc.start.offset + declaration.source.start.offset,
            end: style.loc.start.offset + declaration.source.end.offset,
          },
        }] : [])
      result.push({ selector: matched.trim(), declarations, insertOffset: style.loc.start.offset + rule.source.end.offset - 1 })
    })
  }
  return result
}

export function applyStyleOperation(source: string, operation: DesignerStyleOperation): string {
  const node = findNode(parseDesignerDocument(source).tree, operation.nodeId)
  if (!node || node.kind === 'text' || !node.editable) throw new Error('The selected node cannot be styled')
  const className = operation.selector.startsWith('.') ? operation.selector.slice(1) : operation.selector
  const classes = staticClasses(node)
  if (!classes.includes(className)) {
    const classAttribute = node.attributes.find((attribute) => attribute.name === 'class')
    if (classAttribute && classAttribute.kind !== 'static') throw new Error('Dynamic classes are source-only')
    const withClass = applySourceOperation(source, {
      type: 'set-attribute', nodeId: node.id, name: 'class', value: [...classes, className].join(' '),
    })
    return applyStyleOperation(withClass, operation)
  }
  const rule = getDesignerStyleRules(source, node.id).find((item) => item.selector === operation.selector)
  const declaration = rule?.declarations.find((item) => item.property === operation.property)
  if (declaration) {
    if (!operation.value) {
      let start = declaration.range.start
      while (start > 0 && /[ \t]/.test(source[start - 1] ?? '')) start--
      let end = declaration.range.end
      if (source[end] === ';') end++
      if (source[end] === '\n') end++
      return `${source.slice(0, start)}${source.slice(end)}`
    }
    return `${source.slice(0, declaration.range.start)}${operation.property}: ${operation.value};${source.slice(declaration.range.end)}`
  }
  if (!operation.value) return source
  if (rule) return `${source.slice(0, rule.insertOffset)}\n  ${operation.property}: ${operation.value};${source.slice(rule.insertOffset)}`
  const descriptor = parseSfc(source, { sourceMap: false }).descriptor
  const style = descriptor.styles[0]
  if (style) {
    const insertAt = style.loc.start.offset + style.content.length
    return `${source.slice(0, insertAt)}\n${operation.selector} {\n  ${operation.property}: ${operation.value};\n}\n${source.slice(insertAt)}`
  }
  return `${source}\n\n<style scoped>\n${operation.selector} {\n  ${operation.property}: ${operation.value};\n}\n</style>\n`
}

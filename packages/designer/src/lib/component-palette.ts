import { camelize, capitalize } from 'vue'
import type { DesignerComponentMetadata, DesignerSourceOperation } from '@component-canvas/shared'

export interface ComponentGroup {
  id: string
  label: string
  components: DesignerComponentMetadata[]
}

/** Resolves a template tag in either casing to its component definition. */
export function findComponentForTag(components: DesignerComponentMetadata[], tag: string): DesignerComponentMetadata | null {
  const name = capitalize(camelize(tag))
  const matches = components.filter((component) => component.name === name)
  return matches.find((component) => component.tag === tag) ?? matches[0] ?? null
}

export function groupComponents(components: DesignerComponentMetadata[], query = ''): ComponentGroup[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const groups = new Map<string, ComponentGroup>()
  for (const component of components) {
    const haystack = `${component.label} ${component.name} ${component.tag} ${component.category} ${component.library.label}`.toLowerCase()
    if (!terms.every((term) => haystack.includes(term))) continue
    let group = groups.get(component.library.id)
    if (!group) {
      group = { id: component.library.id, label: component.library.label, components: [] }
      groups.set(group.id, group)
    }
    group.components.push(component)
  }
  return [...groups.values()]
}

export function relativeImport(documentPath: string, componentPath: string): string {
  const from = documentPath.split('/').slice(0, -1)
  const to = componentPath.split('/')
  while (from[0] && from[0] === to[0]) {
    from.shift()
    to.shift()
  }
  const relative = `${from.map(() => '..').join('/')}${from.length && to.length ? '/' : ''}${to.join('/')}`
  return relative.startsWith('.') ? relative : `./${relative}`
}

export function createInsertComponentOperation(
  component: DesignerComponentMetadata,
  documentPath: string,
  parentId: string,
  position: 'inside' | 'after',
): Extract<DesignerSourceOperation, { type: 'insert-component' }> {
  const specifier = component.import
  return {
    type: 'insert-component',
    parentId,
    tag: component.tag,
    import: specifier
      ? {
          from: specifier.kind === 'file' ? relativeImport(documentPath, specifier.from) : specifier.from,
          imported: specifier.imported,
          local: specifier.local,
        }
      : undefined,
    defaultContent: component.defaultContent,
    position,
  }
}

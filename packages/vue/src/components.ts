import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { camelize, capitalize, hyphenate } from '@vue/shared'
import fg from 'fast-glob'
import { createChecker, type ComponentMetaChecker, type PropertyMetaSchema } from 'vue-component-meta'
import type { DesignerComponentImport, DesignerComponentMetadata, DesignerPropMetadata } from '@vue-designer/shared'

export type VueComponentTagCase = 'pascal' | 'kebab'

/**
 * - `explicit`: insert an import into the document's `<script setup>`.
 * - `auto`: the host resolves the component at compile time, for example with unplugin-vue-components.
 * - `global`: the component is registered with `app.component()` in the designer app setup.
 */
export type VueComponentImportMode = 'explicit' | 'auto' | 'global'

interface VueComponentSourceBase {
  /** Stable identifier used in override keys and component ids. Derived from the source when omitted. */
  id?: string
  label?: string
  category?: string
  tagCase?: VueComponentTagCase
  import?: VueComponentImportMode
}

export interface VueLocalComponentSource extends VueComponentSourceBase {
  glob: string | string[]
  exclude?: string[]
  /** Prefix component names with their directory path relative to the glob base. */
  namespace?: 'none' | 'directory'
}

export interface VueLibraryComponentSource extends VueComponentSourceBase {
  /** Package specifier, such as `vuetify/components`. */
  library: string
  /** Export name patterns to keep. `*` matches any characters. */
  include?: string[]
  exclude?: string[]
  /** Explicit component names. When omitted, component exports of `library` are discovered. */
  components?: string[]
  /** Module that default-exports an explicitly listed component, such as `primevue/button`. */
  from?: (name: string) => string
}

export type VueComponentSource = string | VueLocalComponentSource | VueLibraryComponentSource

export interface VueComponentOverride {
  label?: string
  category?: string
  defaultContent?: string
  hidden?: boolean
  /** Set to false to skip type-based metadata extraction. */
  meta?: false
  props?: Record<string, { control?: DesignerPropMetadata['control']; options?: string[] }>
}

export interface VueComponentsOptions {
  tagCase?: VueComponentTagCase
  import?: VueComponentImportMode
  sources: VueComponentSource[]
  /** Keyed by component name, or by `<source id>:<name>` to target one source. */
  overrides?: Record<string, VueComponentOverride>
}

export interface VueComponentsContext {
  root: string
  options: VueComponentsOptions | VueComponentSource[]
}

interface ComponentEntry {
  metadata: DesignerComponentMetadata
  /** File or probe module and export analysed by vue-component-meta. */
  meta?: { file: string; exportName: string }
  override: VueComponentOverride
}

interface NormalizedSource {
  id: string
  label: string
  category?: string
  tagCase: VueComponentTagCase
  importMode: VueComponentImportMode
  source: VueLocalComponentSource | VueLibraryComponentSource
}

const pascalName = /^[A-Z][A-Za-z0-9]*$/
const controls = new Set<DesignerPropMetadata['control']>(['text', 'number', 'checkbox', 'select', 'color'])

export function toPascalName(value: string): string {
  return capitalize(camelize(value.replace(/[^A-Za-z0-9-]+/g, '-')))
}

export function componentTag(name: string, tagCase: VueComponentTagCase): string {
  return tagCase === 'kebab' ? hyphenate(name) : name
}

function humanize(name: string): string {
  const words = hyphenate(name).split('-').filter(Boolean)
  return words.map((word, index) => index ? word : capitalize(word)).join(' ')
}

function wildcard(pattern: string): RegExp {
  return new RegExp(`^${pattern.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`)
}

function matchesAny(name: string, patterns: string[] | undefined): boolean {
  return !!patterns?.some((pattern) => wildcard(pattern).test(name))
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'components'
}

/** Directory prefix of a glob up to its first dynamic segment. */
function globBase(pattern: string): string {
  const segments = pattern.replaceAll('\\', '/').split('/')
  const index = segments.findIndex((segment) => /[*?{}[\]()!]/.test(segment))
  return segments.slice(0, index < 0 ? -1 : index).join('/')
}

function normalizeSources(options: VueComponentsContext['options']): { sources: NormalizedSource[]; overrides: Record<string, VueComponentOverride> } {
  const config: VueComponentsOptions = Array.isArray(options) ? { sources: options } : options
  if (!config || !Array.isArray(config.sources)) throw new Error('designer components must define a sources array')
  const ids = new Set<string>()
  const sources = config.sources.map((input, index): NormalizedSource => {
    const source = typeof input === 'string' ? { glob: input } : input
    const isLocal = 'glob' in source
    const isLibrary = 'library' in source
    if (isLocal === isLibrary) throw new Error(`Component source ${index + 1} must define exactly one of glob or library`)
    const label = source.label ?? (isLibrary ? source.library : 'Components')
    let id = source.id ?? slug(isLibrary ? source.library : label)
    if (source.id && ids.has(id)) throw new Error(`Duplicate component source id ${id}`)
    for (let suffix = 2; ids.has(id); suffix++) id = `${source.id ?? slug(isLibrary ? source.library : label)}-${suffix}`
    ids.add(id)
    const tagCase = source.tagCase ?? config.tagCase ?? 'pascal'
    const importMode = source.import ?? config.import ?? 'explicit'
    if (!['pascal', 'kebab'].includes(tagCase)) throw new Error(`Component source ${id} has an invalid tagCase`)
    if (!['explicit', 'auto', 'global'].includes(importMode)) throw new Error(`Component source ${id} has an invalid import mode`)
    return { id, label, category: source.category, tagCase, importMode, source }
  })
  return { sources, overrides: config.overrides ?? {} }
}

function literalOptions(schema: PropertyMetaSchema): string[] {
  if (typeof schema === 'string') return []
  if (schema.kind === 'literal') return [schema.value.replace(/^(['"])(.*)\1$/, '$2')]
  if (schema.kind === 'enum') {
    return (schema.schema ?? []).flatMap((value) => typeof value === 'string'
      ? [value.replace(/^(['"])(.*)\1$/, '$2')]
      : literalOptions(value))
  }
  return []
}

function inferControl(type: string, schema: PropertyMetaSchema): {
  control: 'text' | 'number' | 'checkbox' | 'select'
  options?: string[]
} {
  const options = literalOptions(schema).filter((value) => value !== 'undefined')
  if (/(^|\W)boolean(\W|$)/.test(type)) return { control: 'checkbox' }
  if (/(^|\W)number(\W|$)/.test(type)) return { control: 'number' }
  if (options.length > 1) return { control: 'select', options }
  return { control: 'text' }
}

export function createVueComponents() {
  let checker: ComponentMetaChecker | undefined
  let checkerRoot = ''
  let list: Promise<Map<string, ComponentEntry>> | undefined
  const metaCache = new Map<string, Promise<DesignerComponentMetadata>>()
  const probes = new Set<string>()

  function getChecker(root: string): ComponentMetaChecker {
    if (!checker || checkerRoot !== root) {
      checker = createChecker(path.resolve(root, 'tsconfig.json'), { schema: true })
      checkerRoot = root
    }
    return checker
  }

  function probe(root: string, text: string): string {
    // Probe modules exist only in the checker's memory; nothing is written to disk.
    const file = path.join(root, `__vue-designer-probe-${createHash('sha256').update(text).digest('hex').slice(0, 12)}.ts`).replaceAll('\\', '/')
    if (!probes.has(file)) {
      getChecker(root).updateFile(file, text)
      probes.add(file)
    }
    return file
  }

  function isComponentExport(file: string, exportName: string): boolean {
    if (!pascalName.test(exportName)) return false
    try {
      // 1 = class (DefineComponent), 2 = function (functional component)
      return getChecker(checkerRoot).getComponentMeta(file, exportName).type !== 0
    } catch {
      return false
    }
  }

  async function discoverLocal(root: string, source: NormalizedSource & { source: VueLocalComponentSource }): Promise<Array<Omit<ComponentEntry, 'override'> & { file: string }>> {
    const patterns = Array.isArray(source.source.glob) ? source.source.glob : [source.source.glob]
    const results = []
    for (const pattern of patterns) {
      const base = path.resolve(root, globBase(pattern))
      const files = await fg(pattern, { cwd: root, absolute: true, onlyFiles: true, ignore: source.source.exclude })
      for (const file of files.sort()) {
        const relativeToBase = path.relative(base, file).replaceAll('\\', '/')
        const directories = relativeToBase.split('/').slice(0, -1)
        const basename = path.basename(file, path.extname(file))
        const name = toPascalName(source.source.namespace === 'directory' ? [...directories, basename].join('-') : basename)
        const rootRelative = path.relative(root, file).replaceAll('\\', '/')
        results.push({
          file: rootRelative,
          metadata: createMetadata(source, name, {
            category: source.category ?? (directories[0] ? humanize(toPascalName(directories[0])) : source.label),
            import: { kind: 'file', from: rootRelative, imported: 'default', local: name },
          }),
          meta: { file: path.resolve(file).replaceAll('\\', '/'), exportName: 'default' },
        })
      }
    }
    return results
  }

  function discoverLibrary(root: string, source: NormalizedSource & { source: VueLibraryComponentSource }): Array<Omit<ComponentEntry, 'override'>> {
    const library = source.source.library
    const category = source.category ?? source.label
    if (source.source.components) {
      const from = source.source.from
      const names = source.source.components
      const file = probe(root, names.map((name, index) => from
        ? `import __component${index} from ${JSON.stringify(from(name))}\nexport const ${name} = __component${index}\n`
        : `import { ${name} as __component${index} } from ${JSON.stringify(library)}\nexport const ${name} = __component${index}\n`).join(''))
      return names.map((name) => {
        if (!pascalName.test(name)) throw new Error(`Component ${name} in ${source.id} must be PascalCase`)
        return {
          metadata: createMetadata(source, name, {
            category,
            import: from
              ? { kind: 'package', from: from(name), imported: 'default', local: name }
              : { kind: 'package', from: library, imported: name, local: name },
          }),
          meta: { file, exportName: name },
        }
      })
    }

    const names = getChecker(root).getExportNames(probe(root, `export * from ${JSON.stringify(library)}\n`))
      .filter((name) => (!source.source.include || matchesAny(name, source.source.include)) && !matchesAny(name, source.source.exclude))
      .filter((name) => pascalName.test(name))
      .sort()
    const file = probe(root, `import * as __library from ${JSON.stringify(library)}\n${names.map((name) => `export const ${name} = __library.${name}\n`).join('')}`)
    return names.filter((name) => isComponentExport(file, name)).map((name) => ({
      metadata: createMetadata(source, name, {
        category,
        import: { kind: 'package', from: library, imported: name, local: name },
      }),
      meta: { file, exportName: name },
    }))
  }

  function createMetadata(source: NormalizedSource, name: string, details: { category: string; import: DesignerComponentImport }): DesignerComponentMetadata {
    return {
      id: `${source.id}:${name}`,
      name,
      tag: componentTag(name, source.tagCase),
      label: humanize(name),
      category: details.category,
      library: { id: source.id, label: source.label },
      import: source.importMode === 'explicit' ? details.import : null,
      metaLoaded: false,
      props: [],
      events: [],
      slots: [],
    }
  }

  async function discover(context: VueComponentsContext): Promise<Map<string, ComponentEntry>> {
    const { sources, overrides } = normalizeSources(context.options)
    getChecker(context.root)
    const entries = new Map<string, ComponentEntry>()
    for (const source of sources) {
      const discovered = 'glob' in source.source
        ? await discoverLocal(context.root, source as NormalizedSource & { source: VueLocalComponentSource })
        : discoverLibrary(context.root, source as NormalizedSource & { source: VueLibraryComponentSource })
      for (const entry of discovered) {
        const { metadata } = entry
        const override = { ...overrides[metadata.name], ...overrides[metadata.id] }
        if (override.hidden) continue
        if (entries.has(metadata.id)) throw new Error(`Component ${metadata.name} is defined more than once in ${source.id}`)
        entries.set(metadata.id, {
          metadata: {
            ...metadata,
            label: override.label ?? metadata.label,
            category: override.category ?? metadata.category,
            defaultContent: override.defaultContent,
          },
          meta: override.meta === false ? undefined : entry.meta,
          override,
        })
      }
    }
    return entries
  }

  function extract(entry: ComponentEntry): DesignerComponentMetadata {
    if (!entry.meta) return { ...entry.metadata, metaLoaded: true }
    try {
      const inferred = getChecker(checkerRoot).getComponentMeta(entry.meta.file, entry.meta.exportName)
      const overrides = entry.override.props ?? {}
      return {
        ...entry.metadata,
        metaLoaded: true,
        props: inferred.props.filter((prop) => !prop.global).map((prop) => {
          const inferredControl = inferControl(prop.type, prop.schema)
          const override = overrides[prop.name] ?? {}
          return {
            name: prop.name,
            type: prop.type,
            description: prop.description,
            required: prop.required,
            default: prop.default,
            control: override.control && controls.has(override.control) ? override.control : inferredControl.control,
            options: Array.isArray(override.options)
              ? override.options.filter((value): value is string => typeof value === 'string')
              : inferredControl.options,
          }
        }),
        events: inferred.events.map((event) => ({ name: event.name, description: event.description })),
        slots: inferred.slots.map((slot) => ({ name: slot.name, description: slot.description })),
      }
    } catch (cause) {
      return { ...entry.metadata, metaLoaded: true, metaError: cause instanceof Error ? cause.message : String(cause) }
    }
  }

  function load(context: VueComponentsContext): Promise<Map<string, ComponentEntry>> {
    list ??= discover(context).catch((cause: unknown) => {
      list = undefined
      throw cause
    })
    return list
  }

  return {
    async list(context: VueComponentsContext): Promise<DesignerComponentMetadata[]> {
      return [...(await load(context)).values()].map((entry) => entry.metadata)
    },
    async meta(context: VueComponentsContext, id: string): Promise<DesignerComponentMetadata | undefined> {
      const entry = (await load(context)).get(id)
      if (!entry) return
      let cached = metaCache.get(id)
      if (!cached) {
        cached = Promise.resolve().then(() => extract(entry))
        metaCache.set(id, cached)
      }
      return cached
    },
    /** Returns true when the component list may have changed. */
    async fileChanged(context: VueComponentsContext, event: 'add' | 'change' | 'unlink', file: string): Promise<boolean> {
      const normalized = path.resolve(file).replaceAll('\\', '/')
      if (path.basename(normalized) === 'package.json' || path.basename(normalized) === 'tsconfig.json') {
        list = undefined
        metaCache.clear()
        probes.clear()
        checker = undefined
        return true
      }
      if (!/\.(vue|ts|tsx|js|jsx)$/.test(normalized)) return false
      if (checker) {
        if (event === 'unlink') checker.deleteFile(normalized)
        else if (event === 'add' || checker.getProgram()?.getSourceFile(normalized)) {
          checker.updateFile(normalized, await fs.readFile(normalized, 'utf8').catch(() => ''))
        }
      }
      // Type information can flow between files, so drop extracted metadata for any script change.
      metaCache.clear()
      if (event === 'change') return false
      if (!normalized.endsWith('.vue')) return false
      list = undefined
      return true
    },
  }
}

import path from 'node:path'
import vuePlugin, { type Options as VuePluginOptions } from '@vitejs/plugin-vue'
import { createChecker, type ComponentMetaChecker, type PropertyMetaSchema } from 'vue-component-meta'
import { DesignerOperationError } from '@vue-designer/shared'
import type {
  DesignerAiRequest,
  DesignerComponentMetadata,
  DesignerFrameworkClientMetadata,
  DesignerSourceOperation,
  DesignerStyleOperation,
} from '@vue-designer/shared'
import type { ResolvedConfig, ViteDevServer } from 'vite'
import { applySourceOperationWithResult, instrumentDesignerNodes, parseDesignerDocument } from './parse.js'
import { applyStyleOperation, getDesignerStyleRules } from './style.js'

export interface VueDesignerOptions extends VuePluginOptions {}

const candidateMarker = '.vue-designer-candidate-'
let componentChecker: ComponentMetaChecker | undefined

export function createCandidateFileId(absolutePath: string, candidateId: string): string {
  return `${absolutePath}${candidateMarker}${candidateId}.vue`
}

export function resolveCandidateFileId(id: string): { candidateId: string; root: boolean } | undefined {
  const [file, query] = id.split('?', 2)
  const marker = file?.lastIndexOf(candidateMarker) ?? -1
  if (marker < 0 || !file?.endsWith('.vue')) return
  return {
    candidateId: file.slice(marker + candidateMarker.length, -4),
    root: !query,
  }
}

export function createPreviewDocumentId(absolutePath: string): string {
  return `${absolutePath}?vue-designer-preview`
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

export function extractVueSource(result: string): string {
  const matches = [...result.matchAll(/```vue\s*\r?\n([\s\S]*?)\r?\n```/g)]
  if (matches.length !== 1 || !matches[0]?.[1]) {
    throw new Error('Cursor did not return exactly one Vue source block')
  }
  return matches[0][1]
}

export default function vue(options: VueDesignerOptions = {}) {
  const featureFlags = {
    __VUE_OPTIONS_API__: 'true',
    __VUE_PROD_DEVTOOLS__: 'false',
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
  }
  const client: DesignerFrameworkClientMetadata = {
    id: 'vue',
    sourceLanguage: 'vue',
    fileExtension: '.vue',
    documentLabel: 'Vue SFC',
    capabilities: { styles: true, components: true, ai: true },
  }

  return {
    id: 'vue',
    client,
    vite: vuePlugin(options),
    config: {
      define: featureFlags,
      optimizeDeps: {
        esbuildOptions: {
          define: featureFlags,
        },
      },
    },
    parse(context: { source: string }) {
      return parseDesignerDocument(context.source)
    },
    applySourceOperation(context: { source: string }, operation: DesignerSourceOperation) {
      try {
        return applySourceOperationWithResult(context.source, operation)
      } catch (cause) {
        throw new DesignerOperationError(cause instanceof Error ? cause.message : 'Unable to apply source operation')
      }
    },
    instrument(context: { code: string }) {
      return { code: instrumentDesignerNodes(context.code), map: null }
    },
    preview: {
      createCandidateId: createCandidateFileId,
      resolveCandidateId: resolveCandidateFileId,
      createDocumentId: createPreviewDocumentId,
      isDocumentId(id: string, absolutePath: string) {
        return id === createPreviewDocumentId(absolutePath)
      },
      createEntry(context: { documentImport: string; appImport?: string }) {
        return `
import { createApp, h } from 'vue'
let Document
let setup
try {
  [Document, setup] = await Promise.all([
    import(${JSON.stringify(context.documentImport)}).then((module) => module.default),
    ${context.appImport ? `import(${JSON.stringify(context.appImport)}).then((module) => module.default)` : 'Promise.resolve(null)'},
  ])
} catch (error) {
  send({ type: 'diagnostic', level: 'error', ...describe(error) })
  throw error
}
const app = createApp({ render: () => h(Document) })
app.config.errorHandler = (error) => send({ type: 'diagnostic', level: 'error', ...describe(error) })
try {
  if (setup?.setup) await setup.setup(app)
  app.mount('#app')
  send({ type: 'ready' })
} catch (error) {
  send({ type: 'diagnostic', level: 'error', ...describe(error) })
}
if (import.meta.hot) import.meta.hot.dispose(() => app.unmount())
`
      },
    },
    styles: {
      getRules(context: { source: string }, nodeId: string) {
        return getDesignerStyleRules(context.source, nodeId)
      },
      applyOperation(context: { source: string }, operation: DesignerStyleOperation) {
        try {
          return applyStyleOperation(context.source, operation)
        } catch (cause) {
          throw new DesignerOperationError(cause instanceof Error ? cause.message : 'Unable to apply style operation')
        }
      },
    },
    components: {
      async load(context: { config: ResolvedConfig; server: ViteDevServer; registryPath: string }): Promise<DesignerComponentMetadata[]> {
        const module = await context.server.ssrLoadModule(context.registryPath)
        const registry = module.default as Record<string, Record<string, unknown>>
        return Object.entries(registry).map(([name, entry]) => {
          if (typeof entry.source !== 'string') throw new Error(`Component ${name} must define a source module`)
          const absoluteSource = path.resolve(path.dirname(context.registryPath), entry.source)
          componentChecker ??= createChecker(path.resolve(context.config.root, 'tsconfig.json'), { schema: true })
          const inferred = componentChecker.getComponentMeta(absoluteSource)
          const overrides = entry.props && typeof entry.props === 'object'
            ? entry.props as Record<string, Record<string, unknown>>
            : {}
          return {
            name,
            label: typeof entry.label === 'string' ? entry.label : name,
            category: typeof entry.category === 'string' ? entry.category : 'Components',
            source: path.relative(context.config.root, absoluteSource).replaceAll('\\', '/'),
            defaultContent: typeof entry.defaultContent === 'string' ? entry.defaultContent : undefined,
            props: inferred.props.filter((prop) => !prop.global).map((prop) => {
              const inferredControl = inferControl(prop.type, prop.schema)
              const override = overrides[prop.name] ?? {}
              const control = ['text', 'number', 'checkbox', 'select', 'color'].includes(String(override.control))
                ? override.control as DesignerComponentMetadata['props'][number]['control']
                : inferredControl.control
              return {
                name: prop.name,
                type: prop.type,
                description: prop.description,
                required: prop.required,
                default: prop.default,
                control,
                options: Array.isArray(override.options)
                  ? override.options.filter((value): value is string => typeof value === 'string')
                  : inferredControl.options,
              }
            }),
            events: inferred.events.map((event) => ({ name: event.name, description: event.description })),
            slots: inferred.slots.map((slot) => ({ name: slot.name, description: slot.description })),
          }
        })
      },
    },
    ai: {
      createPrompt(request: DesignerAiRequest) {
        return `You are editing a Vue Single-File Component in a visual designer.
Apply the user's request to the complete current source below. Focus on the selected source, but make any related changes elsewhere in the SFC that are required for a correct implementation.
Use the read, glob, and grep tools when project context would help. Do not modify files, describe the change, or return a patch. Preserve unrelated code and formatting. Return exactly one complete Vue SFC in a single \`\`\`vue code fence with no text outside it.

Document: ${request.path}
Selected node id: ${request.selection.nodeId}
Selected source range: ${request.selection.range.start}-${request.selection.range.end}
User request:
${request.prompt}

Selected source:
<selected-source>
${request.selection.source}
</selected-source>

Complete current SFC:
<current-source>
${request.source}
</current-source>`
      },
      extractSource: extractVueSource,
      invalidSourceMessage(message: string) {
        return `Cursor returned invalid Vue source: ${message}`
      },
    },
  }
}

export { applySourceOperationWithResult, instrumentDesignerNodes, parseDesignerDocument } from './parse.js'
export { applyStyleOperation, getDesignerStyleRules } from './style.js'

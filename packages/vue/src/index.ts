import vuePlugin, { type Options as VuePluginOptions } from '@vitejs/plugin-vue'
import { DesignerOperationError } from '@vue-designer/shared'
import type {
  DesignerAiRequest,
  DesignerFrameworkClientMetadata,
  DesignerSourceOperation,
  DesignerStyleOperation,
} from '@vue-designer/shared'
import type { ResolvedConfig, ViteDevServer } from 'vite'
import { createVueComponents, type VueComponentSource, type VueComponentsOptions } from './components.js'
import { applySourceOperationWithResult, instrumentDesignerNodes, parseDesignerDocument } from './parse.js'
import { applyStyleOperation, getDesignerStyleRules } from './style.js'

export interface VueDesignerOptions extends VuePluginOptions {}

interface VueComponentsHookContext {
  config: ResolvedConfig
  server: ViteDevServer
  options: VueComponentsOptions | VueComponentSource[]
}

const candidateMarker = '.vue-designer-candidate-'

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
  const components = createVueComponents()
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
        return id.replaceAll('\\', '/') === createPreviewDocumentId(absolutePath).replaceAll('\\', '/')
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
      list(context: VueComponentsHookContext) {
        return components.list({ root: context.config.root, options: context.options })
      },
      meta(context: VueComponentsHookContext, id: string) {
        return components.meta({ root: context.config.root, options: context.options }, id)
      },
      fileChanged(context: VueComponentsHookContext, event: 'add' | 'change' | 'unlink', file: string) {
        return components.fileChanged({ root: context.config.root, options: context.options }, event, file)
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
export {
  componentTag,
  toPascalName,
  type VueComponentImportMode,
  type VueComponentOverride,
  type VueComponentSource,
  type VueComponentsOptions,
  type VueComponentTagCase,
  type VueLibraryComponentSource,
  type VueLocalComponentSource,
} from './components.js'

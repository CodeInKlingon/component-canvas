import type { DesignerAiModel, DesignerAiModelParameterValue } from '@component-canvas/shared'

export interface CursorAiOptions {
  apiKey?: string
  model?: string
  params?: DesignerAiModelParameterValue[]
}

export const defaultAiModel = 'composer-2.5'

function requireApiKey(options: CursorAiOptions): string {
  const apiKey = options.apiKey ?? process.env.CURSOR_API_KEY
  if (!apiKey) throw new Error('CURSOR_API_KEY is required to use AI editing')
  return apiKey
}

/** Loads the optional Cursor SDK on demand so non-AI consumers never import it. */
async function cursorSdk(): Promise<typeof import('@cursor/sdk')> {
  try {
    return await import('@cursor/sdk')
  } catch (cause) {
    throw new Error(
      "AI editing requires the optional '@cursor/sdk' package. Install it to use the `ai` option.",
      { cause },
    )
  }
}

export async function listAiModels(options: CursorAiOptions): Promise<DesignerAiModel[]> {
  const { Cursor } = await cursorSdk()
  const models = await Cursor.models.list({ apiKey: requireApiKey(options) })
  return models.map(({ id, displayName, description, parameters = [], variants = [] }) => ({
    id,
    displayName,
    description,
    parameters: parameters.map((parameter) => ({
      id: parameter.id,
      displayName: parameter.displayName,
      values: parameter.values.map(({ value, displayName }) => ({ value, displayName })),
    })),
    defaultParams: (variants.find((variant) => variant.isDefault)?.params ?? [])
      .filter((param) => parameters.some((parameter) => parameter.id === param.id))
      .map(({ id, value }) => ({ id, value })),
  }))
}

export function invalidAiModelParams(model: DesignerAiModel, params: DesignerAiModelParameterValue[]): string | undefined {
  const seen = new Set<string>()
  for (const param of params) {
    const parameter = model.parameters.find((item) => item.id === param.id)
    if (!parameter) return `${model.displayName} does not support the "${param.id}" setting`
    if (seen.has(param.id)) return `The "${param.id}" setting was provided more than once`
    if (!parameter.values.some((item) => item.value === param.value)) return `"${param.value}" is not a valid ${parameter.displayName ?? param.id} for ${model.displayName}`
    seen.add(param.id)
  }
}

export async function runAiPrompt(
  prompt: string,
  root: string,
  options: CursorAiOptions,
): Promise<string> {
  const { Agent } = await cursorSdk()
  const result = await Agent.prompt(prompt, {
    apiKey: requireApiKey(options),
    model: { id: options.model ?? defaultAiModel, params: options.params?.length ? options.params : undefined },
    tools: ['read', 'glob', 'grep'],
    local: { cwd: root },
  })

  if (result.status !== 'finished') throw new Error(result.error?.message ?? 'Cursor agent did not finish')
  return result.result ?? ''
}

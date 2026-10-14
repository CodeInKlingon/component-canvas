import type { DesignerAiModel, DesignerAiModelParameterValue } from '@vue-designer/shared'

export interface AiModelPreference {
  model: string
  params: DesignerAiModelParameterValue[]
}

const storageKey = 'vue-designer:ai-model'

export function readAiModelPreference(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): AiModelPreference | null {
  try {
    const value: unknown = JSON.parse(storage?.getItem(storageKey) ?? 'null')
    if (!value || typeof value !== 'object') return null
    const { model, params } = value as Record<string, unknown>
    if (typeof model !== 'string' || !Array.isArray(params)) return null
    return {
      model,
      params: params.filter((param): param is DesignerAiModelParameterValue => !!param && typeof param === 'object'
        && typeof (param as Record<string, unknown>).id === 'string'
        && typeof (param as Record<string, unknown>).value === 'string'),
    }
  } catch {
    return null
  }
}

export function writeAiModelPreference(preference: AiModelPreference, storage: Pick<Storage, 'setItem'> | undefined = globalThis.localStorage): void {
  try {
    storage?.setItem(storageKey, JSON.stringify(preference))
  } catch {
    // Storage can be unavailable or full; the selection still works for this session.
  }
}

export function resolveAiModelId(models: DesignerAiModel[], defaultModel: string, ...preferred: Array<string | undefined>): string {
  return preferred.find((id) => !!id && models.some((model) => model.id === id)) ?? defaultModel
}

/** Model defaults, overridden by stored values the model still accepts. '' means "let Cursor decide". */
export function resolveAiModelParams(model: DesignerAiModel | undefined, preference: AiModelPreference | null): Record<string, string> {
  return Object.fromEntries((model?.parameters ?? []).map((parameter) => {
    const stored = preference?.model === model?.id
      ? preference?.params.find((param) => param.id === parameter.id)?.value
      : undefined
    const value = stored !== undefined && (stored === '' || parameter.values.some((option) => option.value === stored))
      ? stored
      : model?.defaultParams.find((param) => param.id === parameter.id)?.value ?? ''
    return [parameter.id, value]
  }))
}

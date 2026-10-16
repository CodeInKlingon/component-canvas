import { describe, expect, it } from 'vitest'
import type { DesignerAiModel } from '@component-canvas/shared'
import { readAiModelPreference, resolveAiModelId, resolveAiModelParams, writeAiModelPreference } from './ai-model-preference'

const models: DesignerAiModel[] = [
  {
    id: 'model-a',
    displayName: 'Model A',
    parameters: [
      { id: 'effort', values: [{ value: 'low' }, { value: 'high' }] },
      { id: 'fast', values: [{ value: 'true' }, { value: 'false' }] },
    ],
    defaultParams: [{ id: 'effort', value: 'low' }],
  },
  { id: 'model-b', displayName: 'Model B', parameters: [], defaultParams: [] },
]

function memoryStorage(initial?: string) {
  const values = new Map<string, string>(initial === undefined ? [] : [['vue-designer:ai-model', initial]])
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  }
}

describe('AI model preference', () => {
  it('round-trips through storage and ignores malformed values', () => {
    const storage = memoryStorage()
    writeAiModelPreference({ model: 'model-a', params: [{ id: 'effort', value: 'high' }] }, storage)
    expect(readAiModelPreference(storage)).toEqual({ model: 'model-a', params: [{ id: 'effort', value: 'high' }] })
    expect(readAiModelPreference(memoryStorage('{not json'))).toBeNull()
    expect(readAiModelPreference(memoryStorage('{"model":3,"params":[]}'))).toBeNull()
    expect(readAiModelPreference(memoryStorage('{"model":"model-a","params":[{"id":"effort"},{"id":"fast","value":"true"}]}')))
      .toEqual({ model: 'model-a', params: [{ id: 'fast', value: 'true' }] })
  })

  it('tolerates storage that throws', () => {
    const broken = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } }
    expect(readAiModelPreference(broken)).toBeNull()
    expect(() => writeAiModelPreference({ model: 'model-a', params: [] }, broken)).not.toThrow()
  })

  it('uses the first preferred model the API still lists', () => {
    expect(resolveAiModelId(models, 'model-a', 'gone', 'model-b')).toBe('model-b')
    expect(resolveAiModelId(models, 'model-a', '', undefined, 'gone')).toBe('model-a')
  })

  it('restores stored params the model still accepts and falls back to defaults otherwise', () => {
    expect(resolveAiModelParams(models[0], { model: 'model-a', params: [{ id: 'effort', value: 'high' }, { id: 'fast', value: 'true' }] }))
      .toEqual({ effort: 'high', fast: 'true' })
    expect(resolveAiModelParams(models[0], { model: 'model-a', params: [{ id: 'effort', value: 'max' }, { id: 'fast', value: '' }] }))
      .toEqual({ effort: 'low', fast: '' })
    expect(resolveAiModelParams(models[0], { model: 'model-b', params: [{ id: 'effort', value: 'high' }] }))
      .toEqual({ effort: 'low', fast: '' })
    expect(resolveAiModelParams(undefined, null)).toEqual({})
  })
})

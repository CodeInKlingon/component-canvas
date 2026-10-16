import { describe, expect, it } from 'vitest'
import type { DesignerAiModel } from '@component-canvas/shared'
import { invalidAiModelParams } from './ai.js'

const model: DesignerAiModel = {
  id: 'model-a',
  displayName: 'Model A',
  parameters: [{ id: 'effort', displayName: 'Effort', values: [{ value: 'low' }, { value: 'high' }] }],
  defaultParams: [],
}

describe('invalidAiModelParams', () => {
  it('accepts values listed by the model', () => {
    expect(invalidAiModelParams(model, [])).toBeUndefined()
    expect(invalidAiModelParams(model, [{ id: 'effort', value: 'high' }])).toBeUndefined()
  })

  it('rejects unknown settings, unknown values, and duplicates', () => {
    expect(invalidAiModelParams(model, [{ id: 'speed', value: 'fast' }])).toMatch('does not support')
    expect(invalidAiModelParams(model, [{ id: 'effort', value: 'max' }])).toMatch('not a valid Effort')
    expect(invalidAiModelParams(model, [{ id: 'effort', value: 'low' }, { id: 'effort', value: 'high' }])).toMatch('more than once')
  })
})

import { describe, expect, it } from 'vitest'
import { isEditorToPreviewMessage, isPreviewToEditorMessage } from './index'

describe('preview protocol validation', () => {
  it('requires a session on every message', () => {
    expect(isPreviewToEditorMessage({ channel: 'vue-designer', type: 'ready' })).toBe(false)
    expect(isEditorToPreviewMessage({ channel: 'vue-designer', type: 'select', nodeId: 'node' })).toBe(false)
  })

  it('accepts valid diagnostics and rejects malformed payloads', () => {
    expect(isPreviewToEditorMessage({ channel: 'vue-designer', session: 'session', type: 'diagnostic', level: 'error', message: 'Failed' })).toBe(true)
    expect(isPreviewToEditorMessage({ channel: 'vue-designer', session: 'session', type: 'diagnostic', level: 'fatal', message: 'Failed' })).toBe(false)
    expect(isEditorToPreviewMessage({ channel: 'vue-designer', session: 'session', type: 'apply-style', nodeId: 'node', property: 'color', value: 3 })).toBe(false)
  })
})

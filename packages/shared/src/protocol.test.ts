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

  it('validates finite viewport coordinates', () => {
    expect(isPreviewToEditorMessage({ channel: 'vue-designer', session: 'session', type: 'viewport-state', scrollX: 4, scrollY: 120 })).toBe(true)
    expect(isPreviewToEditorMessage({ channel: 'vue-designer', session: 'session', type: 'viewport-state', scrollX: 0, scrollY: Infinity })).toBe(false)
    expect(isEditorToPreviewMessage({ channel: 'vue-designer', session: 'session', type: 'restore-viewport', scrollX: 4, scrollY: 120 })).toBe(true)
  })

  it('validates preview pan key state', () => {
    expect(isPreviewToEditorMessage({ channel: 'vue-designer', session: 'session', type: 'pan-key-state', pressed: true })).toBe(true)
    expect(isPreviewToEditorMessage({ channel: 'vue-designer', session: 'session', type: 'pan-key-state', pressed: 'true' })).toBe(false)
  })

  it('accepts AI prompt actions only for a selected node', () => {
    expect(isPreviewToEditorMessage({ channel: 'vue-designer', session: 'session', type: 'ai-prompt', nodeId: 'node-1' })).toBe(true)
    expect(isPreviewToEditorMessage({ channel: 'vue-designer', session: 'session', type: 'ai-prompt', nodeId: null })).toBe(false)
  })

  it('validates canvas context menu coordinates', () => {
    expect(isPreviewToEditorMessage({ channel: 'vue-designer', session: 'session', type: 'context-menu', nodeId: 'node-1', clientX: 12, clientY: 30 })).toBe(true)
    expect(isPreviewToEditorMessage({ channel: 'vue-designer', session: 'session', type: 'context-menu', nodeId: 'node-1', clientX: Infinity, clientY: 30 })).toBe(false)
  })
})

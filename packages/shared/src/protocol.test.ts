import { describe, expect, it } from 'vitest'
import { isDesignerSourceOperation, isEditorToPreviewMessage, isPreviewToEditorMessage } from './index'

describe('source operation validation', () => {
  it('accepts every supported operation shape', () => {
    expect(isDesignerSourceOperation({ type: 'set-text', nodeId: 'node-1', value: 'Text' })).toBe(true)
    expect(isDesignerSourceOperation({ type: 'set-attribute', nodeId: 'node-1', name: 'count', value: 2, binding: true })).toBe(true)
    expect(isDesignerSourceOperation({ type: 'insert-component', parentId: 'node-1', name: 'Card', importSource: './Card.vue', position: 'inside' })).toBe(true)
    expect(isDesignerSourceOperation({ type: 'insert-native', parentId: 'node-1', tag: 'input', contentModel: 'void', attributes: { disabled: true } })).toBe(true)
    expect(isDesignerSourceOperation({ type: 'remove-node', nodeId: 'node-1' })).toBe(true)
    expect(isDesignerSourceOperation({ type: 'duplicate-node', nodeId: 'node-1' })).toBe(true)
    expect(isDesignerSourceOperation({ type: 'insert-node', targetId: 'node-1', position: 'after', source: '<p />' })).toBe(true)
    expect(isDesignerSourceOperation({ type: 'move-node', nodeId: 'node-1', targetId: 'node-2', position: 'before' })).toBe(true)
  })

  it('rejects malformed nested values and discriminants', () => {
    expect(isDesignerSourceOperation({ type: 'set-attribute', nodeId: 'node-1', name: 'count', value: [] })).toBe(false)
    expect(isDesignerSourceOperation({ type: 'insert-native', parentId: 'node-1', tag: 'div', contentModel: 'other' })).toBe(false)
    expect(isDesignerSourceOperation({ type: 'insert-native', parentId: 'node-1', tag: 'div', contentModel: 'normal', attributes: { id: null } })).toBe(false)
    expect(isDesignerSourceOperation({ type: 'move-node', nodeId: 'node-1', targetId: 'node-2', position: 'around' })).toBe(false)
    expect(isDesignerSourceOperation({ type: 'unknown' })).toBe(false)
  })
})

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

  it('validates canvas scroll routing messages', () => {
    expect(isEditorToPreviewMessage({ channel: 'vue-designer', session: 'session', type: 'canvas-input-mode', enabled: true, selectionEnabled: true })).toBe(true)
    expect(isEditorToPreviewMessage({ channel: 'vue-designer', session: 'session', type: 'canvas-input-mode', enabled: true, selectionEnabled: 'true' })).toBe(false)
    expect(isPreviewToEditorMessage({ channel: 'vue-designer', session: 'session', type: 'canvas-wheel', deltaX: 4, deltaY: -12, clientX: 10, clientY: 20, zoom: false })).toBe(true)
    expect(isPreviewToEditorMessage({ channel: 'vue-designer', session: 'session', type: 'canvas-wheel', deltaX: 0, deltaY: Infinity, clientX: 10, clientY: 20, zoom: false })).toBe(false)
    expect(isEditorToPreviewMessage({ channel: 'vue-designer', session: 'session', type: 'select-at-point', clientX: 10, clientY: 20 })).toBe(true)
    expect(isEditorToPreviewMessage({ channel: 'vue-designer', session: 'session', type: 'select-at-point', clientX: Infinity, clientY: 20 })).toBe(false)
  })

  it('accepts AI prompt actions only for a selected node', () => {
    expect(isPreviewToEditorMessage({ channel: 'vue-designer', session: 'session', type: 'select', nodeId: null })).toBe(true)
    expect(isPreviewToEditorMessage({ channel: 'vue-designer', session: 'session', type: 'ai-prompt', nodeId: 'node-1' })).toBe(true)
    expect(isPreviewToEditorMessage({ channel: 'vue-designer', session: 'session', type: 'ai-prompt', nodeId: null })).toBe(false)
  })

  it('validates canvas context menu coordinates', () => {
    expect(isPreviewToEditorMessage({ channel: 'vue-designer', session: 'session', type: 'context-menu', nodeId: 'node-1', clientX: 12, clientY: 30 })).toBe(true)
    expect(isPreviewToEditorMessage({ channel: 'vue-designer', session: 'session', type: 'context-menu', nodeId: 'node-1', clientX: Infinity, clientY: 30 })).toBe(false)
  })
})

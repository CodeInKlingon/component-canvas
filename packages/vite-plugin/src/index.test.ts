import { describe, expect, it } from 'vitest'
import vueDesigner from './index'

describe('vueDesigner', () => {
  it('creates a named pre plugin', () => {
    const plugin = vueDesigner({ documents: 'src/**/*.vue' })
    expect(plugin.name).toBe('vue-designer')
    expect(plugin.enforce).toBe('pre')
  })
})

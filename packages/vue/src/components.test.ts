import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { componentTag, createVueComponents, toPascalName } from './components'

const root = fileURLToPath(new URL('../test/fixtures/components', import.meta.url))

describe('component naming', () => {
  it('derives PascalCase names and cased tags', () => {
    expect(toPascalName('text-input')).toBe('TextInput')
    expect(toPascalName('forms-TextInput')).toBe('FormsTextInput')
    expect(toPascalName('AppButton')).toBe('AppButton')
    expect(componentTag('VBtn', 'kebab')).toBe('v-btn')
    expect(componentTag('VBtn', 'pascal')).toBe('VBtn')
  })
})

describe('component discovery', () => {
  it('discovers local components from globs with derived names, categories, and imports', async () => {
    const components = createVueComponents()
    const list = await components.list({ root, options: ['src/components/**/*.vue'] })
    expect(list.map((component) => [component.id, component.tag, component.label, component.category])).toEqual([
      ['components:AppButton', 'AppButton', 'App button', 'Components'],
      ['components:TextInput', 'TextInput', 'Text input', 'Forms'],
    ])
    expect(list[0]).toMatchObject({
      import: { kind: 'file', from: 'src/components/AppButton.vue', imported: 'default', local: 'AppButton' },
      metaLoaded: false,
    })
  })

  it('applies namespaces, casing, import modes, and overrides', async () => {
    const components = createVueComponents()
    const list = await components.list({
      root,
      options: {
        tagCase: 'kebab',
        import: 'global',
        sources: [{ glob: 'src/components/**/*.vue', id: 'app', label: 'App', namespace: 'directory' }],
        overrides: {
          AppButton: { label: 'Button', category: 'Actions', defaultContent: 'Click' },
          'app:FormsTextInput': { hidden: true },
        },
      },
    })
    expect(list).toEqual([expect.objectContaining({
      id: 'app:AppButton', tag: 'app-button', label: 'Button', category: 'Actions',
      defaultContent: 'Click', import: null, library: { id: 'app', label: 'App' },
    })])
  })

  it('loads local metadata on demand and merges prop overrides', async () => {
    const components = createVueComponents()
    const context = { root, options: { sources: ['src/components/*.vue'], overrides: { AppButton: { props: { label: { control: 'color' as const } } } } } }
    const meta = await components.meta(context, 'components:AppButton')
    expect(meta?.metaLoaded).toBe(true)
    expect(meta?.props).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'label', control: 'color', required: true }),
      expect.objectContaining({ name: 'tone', control: 'select', options: ['primary', 'quiet'] }),
    ]))
    expect(meta?.events.map((event) => event.name)).toEqual(['press'])
    expect(meta?.slots.map((slot) => slot.name)).toEqual(['default'])
    expect(await components.meta(context, 'components:Missing')).toBeUndefined()
  })

  it('discovers component exports from a library barrel', async () => {
    const components = createVueComponents()
    const context = { root, options: [{ library: 'fake-ui', label: 'Fake UI', tagCase: 'kebab' as const, exclude: ['FInternal'] }] }
    const list = await components.list(context)
    expect(list.map((component) => [component.id, component.tag, component.import])).toEqual([
      ['fake-ui:FButton', 'f-button', { kind: 'package', from: 'fake-ui', imported: 'FButton', local: 'FButton' }],
      ['fake-ui:FCard', 'f-card', { kind: 'package', from: 'fake-ui', imported: 'FCard', local: 'FCard' }],
    ])
    const meta = await components.meta(context, 'fake-ui:FButton')
    expect(meta?.metaError).toBeUndefined()
    expect(meta?.props).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'size', control: 'select', options: ['small', 'large'] }),
      expect.objectContaining({ name: 'disabled', control: 'checkbox' }),
    ]))
  })

  it('resolves explicitly listed components from per-component modules', async () => {
    const components = createVueComponents()
    const context = { root, options: [{ library: 'fake-ui', id: 'per-file', components: ['Badge'], from: (name: string) => `fake-ui/${name.toLowerCase()}` }] }
    const [badge] = await components.list(context)
    expect(badge).toMatchObject({ id: 'per-file:Badge', import: { kind: 'package', from: 'fake-ui/badge', imported: 'default', local: 'Badge' } })
    const meta = await components.meta(context, 'per-file:Badge')
    expect(meta?.props).toEqual([expect.objectContaining({ name: 'value', control: 'number', required: true })])
  })

  it('rejects invalid source definitions', async () => {
    const components = createVueComponents()
    await expect(components.list({ root, options: [{ glob: 'a', library: 'b' } as never] })).rejects.toThrow('exactly one of glob or library')
    await expect(components.list({ root, options: { sources: [{ glob: 'a', tagCase: 'snake' as never }] } })).rejects.toThrow('invalid tagCase')
    await expect(components.list({ root, options: [{ library: 'fake-ui', components: ['badge'] }] })).rejects.toThrow('PascalCase')
  })
})

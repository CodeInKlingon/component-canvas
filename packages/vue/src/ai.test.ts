import { describe, expect, it } from 'vitest'
import vue, { extractVueSource } from './index'

describe('extractVueSource', () => {
  it('extracts one complete Vue code block', () => {
    expect(extractVueSource('```vue\n<template><main /></template>\n```'))
      .toBe('<template><main /></template>')
  })

  it('rejects prose and ambiguous output', () => {
    expect(() => extractVueSource('<template />')).toThrow('exactly one')
    expect(() => extractVueSource('```vue\n<a />\n```\n```vue\n<b />\n```')).toThrow('exactly one')
  })

  it('prompts for one complete Vue SFC while preserving selection context', () => {
    const prompt = vue().ai.createPrompt({
      path: 'src/Page.vue',
      source: '<template><main>Before</main></template>',
      prompt: 'Change the copy',
      selection: { nodeId: 'node-0', range: { start: 10, end: 29 }, source: '<main>Before</main>' },
    })
    expect(prompt).toContain('Vue Single-File Component')
    expect(prompt).toContain('exactly one complete Vue SFC')
    expect(prompt).toContain('src/Page.vue')
    expect(prompt).toContain('<main>Before</main>')
    expect(prompt).toContain('<template><main>Before</main></template>')
  })
})

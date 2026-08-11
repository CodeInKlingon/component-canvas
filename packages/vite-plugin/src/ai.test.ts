import { describe, expect, it } from 'vitest'
import { extractVueSource } from './ai'

describe('extractVueSource', () => {
  it('extracts one complete Vue code block', () => {
    expect(extractVueSource('```vue\n<template><main /></template>\n```'))
      .toBe('<template><main /></template>')
  })

  it('rejects prose and ambiguous output', () => {
    expect(() => extractVueSource('<template />')).toThrow('exactly one')
    expect(() => extractVueSource('```vue\n<a />\n```\n```vue\n<b />\n```')).toThrow('exactly one')
  })
})

import { describe, expect, it } from 'vitest'
import { creatableFolders, formatModified, groupDocuments } from './landing'

const documents = [
  { path: 'src/pages/marketing/Pricing.vue', name: 'Pricing' },
  { path: 'src/pages/Home.vue', name: 'Home' },
  { path: 'src/pages/About.vue', name: 'About' },
  { path: 'Root.vue', name: 'Root' },
]

describe('groupDocuments', () => {
  it('groups documents by folder relative to the nearest document root', () => {
    expect(groupDocuments(documents, ['', 'src/pages']).map((folder) => ({
      path: folder.path,
      root: folder.root,
      relative: folder.relative,
      names: folder.documents.map((document) => document.name),
    }))).toEqual([
      { path: '', root: '', relative: '', names: ['Root'] },
      { path: 'src/pages', root: 'src/pages', relative: '', names: ['About', 'Home'] },
      { path: 'src/pages/marketing', root: 'src/pages', relative: 'marketing', names: ['Pricing'] },
    ])
  })

  it('filters by name or path and drops empty folders', () => {
    expect(groupDocuments(documents, ['src/pages'], 'MARKET').map((folder) => folder.path)).toEqual(['src/pages/marketing'])
    expect(groupDocuments(documents, ['src/pages'], 'home').flatMap((folder) => folder.documents.map((document) => document.name))).toEqual(['Home'])
  })
})

describe('creatableFolders', () => {
  it('offers document roots and existing document folders', () => {
    expect(creatableFolders(documents, ['src/pages', 'src/screens'])).toEqual(['', 'src/pages', 'src/pages/marketing', 'src/screens'])
  })
})

describe('formatModified', () => {
  it('formats elapsed time relative to now', () => {
    const now = Date.UTC(2026, 0, 10)
    expect(formatModified(undefined, now)).toBe('')
    expect(formatModified(now - 10_000, now)).toBe('just now')
    expect(formatModified(now - 2 * 24 * 60 * 60 * 1000, now)).toMatch(/2 days ago/)
  })
})

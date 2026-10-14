import { describe, expect, it } from 'vitest'
import { parseRoute, routeHash } from './router'

describe('hash routes', () => {
  it('round-trips editor paths with encoded segments', () => {
    const route = { name: 'editor', path: 'src/pages/a b/Price#1.vue' } as const
    expect(routeHash(route)).toBe('#/edit/src/pages/a%20b/Price%231.vue')
    expect(parseRoute(routeHash(route))).toEqual(route)
  })

  it('falls back to the landing screen', () => {
    for (const hash of ['', '#', '#/', '#/edit/', '#/unknown', '#/edit/%E0%A4%A']) {
      expect(parseRoute(hash)).toEqual({ name: 'landing' })
    }
    expect(routeHash({ name: 'landing' })).toBe('#/')
  })
})

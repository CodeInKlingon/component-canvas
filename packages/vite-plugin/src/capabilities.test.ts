import { describe, expect, it } from 'vitest'
import { CapabilityStore } from './capabilities'

describe('CapabilityStore', () => {
  it('accepts issued bearer tokens until expiry', () => {
    const store = new CapabilityStore(100)
    const capability = store.issue(1_000)
    expect(store.accepts(`Bearer ${capability.token}`, 1_099)).toBe(true)
    expect(store.accepts(`Bearer ${capability.token}`, 1_100)).toBe(false)
  })

  it('rejects missing and unknown tokens', () => {
    const store = new CapabilityStore()
    expect(store.accepts(undefined)).toBe(false)
    expect(store.accepts('Bearer unknown')).toBe(false)
  })
})

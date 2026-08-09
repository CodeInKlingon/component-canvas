import { randomUUID } from 'node:crypto'

export class CapabilityStore {
  private readonly tokens = new Map<string, number>()
  private readonly lifetimeMs: number

  constructor(lifetimeMs = 15 * 60 * 1000) {
    this.lifetimeMs = lifetimeMs
  }

  issue(now = Date.now()): { token: string; expiresAt: number } {
    this.prune(now)
    const token = randomUUID()
    const expiresAt = now + this.lifetimeMs
    this.tokens.set(token, expiresAt)
    return { token, expiresAt }
  }

  accepts(header: string | undefined, now = Date.now()): boolean {
    if (!header?.startsWith('Bearer ')) return false
    const token = header.slice(7)
    const expiresAt = this.tokens.get(token)
    if (expiresAt === undefined || expiresAt <= now) {
      this.tokens.delete(token)
      return false
    }
    return true
  }

  private prune(now: number): void {
    for (const [token, expiresAt] of this.tokens) {
      if (expiresAt <= now) this.tokens.delete(token)
    }
  }
}

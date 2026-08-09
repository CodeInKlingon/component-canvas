import { describe, expect, it } from 'vitest'
import { offsetAt, positionAt } from './source-position'

describe('source positions', () => {
  const source = '<template>\n  <main>Text</main>\n</template>'

  it('converts offsets to zero-based editor positions', () => {
    expect(positionAt(source, source.indexOf('Text'))).toEqual({ line: 1, character: 8 })
    expect(positionAt(source, source.length)).toEqual({ line: 2, character: 11 })
  })

  it('round-trips positions and clamps invalid values', () => {
    const offset = source.indexOf('main')
    expect(offsetAt(source, positionAt(source, offset))).toBe(offset)
    expect(offsetAt(source, { line: 99, character: 99 })).toBe(source.length)
    expect(positionAt(source, -1)).toEqual({ line: 0, character: 0 })
  })
})

import { describe, expect, it } from 'vitest'
import { SourceHistory } from './history'

describe('SourceHistory', () => {
  it('supports undo, redo, and branch replacement', () => {
    const history = new SourceHistory()
    history.reset('one')
    history.push('two')
    history.push('three')
    expect(history.undo()).toBe('two')
    expect(history.undo()).toBe('one')
    expect(history.redo()).toBe('two')
    history.push('replacement')
    expect(history.canRedo).toBe(false)
    expect(history.undo()).toBe('two')
  })

  it('ignores duplicate consecutive source', () => {
    const history = new SourceHistory()
    history.reset('same')
    history.push('same')
    expect(history.canUndo).toBe(false)
  })
})

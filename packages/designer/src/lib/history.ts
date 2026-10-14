export class SourceHistory {
  private entries: string[] = []
  private index = -1

  reset(source: string): void {
    this.entries = [source]
    this.index = 0
  }

  push(source: string): void {
    if (source === this.current) return
    this.entries.splice(this.index + 1)
    this.entries.push(source)
    this.index = this.entries.length - 1
  }

  get current(): string {
    return this.entries[this.index] ?? ''
  }

  get canUndo(): boolean {
    return this.index > 0
  }

  get canRedo(): boolean {
    return this.index >= 0 && this.index < this.entries.length - 1
  }

  undo(): string | undefined {
    if (!this.canUndo) return
    return this.entries[--this.index]
  }

  redo(): string | undefined {
    if (!this.canRedo) return
    return this.entries[++this.index]
  }
}

export interface SourcePosition {
  line: number
  character: number
}

export function positionAt(source: string, offset: number): SourcePosition {
  const before = source.slice(0, Math.max(0, Math.min(offset, source.length)))
  const lines = before.split('\n')
  return { line: lines.length - 1, character: lines.at(-1)?.length ?? 0 }
}

export function offsetAt(source: string, position: SourcePosition): number {
  const lines = source.split('\n')
  const targetLine = Math.max(0, Math.min(position.line, lines.length - 1))
  let offset = 0
  for (let line = 0; line < targetLine; line += 1) offset += (lines[line]?.length ?? 0) + 1
  return offset + Math.min(lines[targetLine]?.length ?? 0, Math.max(0, position.character))
}

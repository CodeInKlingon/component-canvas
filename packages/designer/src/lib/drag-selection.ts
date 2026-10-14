export interface DragSelection {
  nodeId: string
  source: string
  occurrence: number
}

export function captureDragSelection(
  selectedNodeId: string | null,
  draggedNodeId: string,
  source: string,
  range: { start: number; end: number },
): DragSelection | null {
  if (selectedNodeId !== draggedNodeId) return null
  const selectedSource = source.slice(range.start, range.end)
  let occurrence = 0
  let offset = source.indexOf(selectedSource)
  while (offset !== -1 && offset < range.start) {
    occurrence += 1
    offset = source.indexOf(selectedSource, offset + selectedSource.length)
  }
  return { nodeId: draggedNodeId, source: selectedSource, occurrence }
}

export function findDragSelectionOffset(source: string, selection: DragSelection): number | null {
  let offset = -selection.source.length
  for (let index = 0; index <= selection.occurrence; index++) {
    offset = source.indexOf(selection.source, offset + selection.source.length)
    if (offset === -1) return null
  }
  return offset
}

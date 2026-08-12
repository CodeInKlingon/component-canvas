# 13: Selection Preserved While Dragging

**Status:** Planned

## User Outcome

A user can drag nodes around the document without losing the current selection or causing selection flicker while the drag is in progress.

## Scope

- Keep the active selection stable when a selected node starts dragging.
- Preserve selection across drag hover updates, drop target changes, and drag cancelation.
- Avoid transient selection changes from overriding the intended source selection state.
- Keep the existing drag-and-drop node reordering behavior unchanged.

## Acceptance Criteria

- Dragging a selected node keeps it selected during the entire drag gesture.
- Hovering over other drop targets does not replace the active selection.
- Cancelling a drag restores the prior selection state.
- Completing a drag preserves the moved node as selected when it remains visible.
- Dragging still updates valid drop targets and reorders nodes correctly.

## Verification

- Add interaction tests for drag start, hover, cancel, and drop selection behavior.
- Browser-test dragging a selected node within the tree and on the canvas.
- Verify selection remains stable through reordering and undo/redo.

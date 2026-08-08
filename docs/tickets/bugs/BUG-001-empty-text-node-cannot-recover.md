# BUG-001: Empty Text Node Cannot Recover

**Status:** Open

**Found in:** Ticket 02

## Summary

Clearing all content from the text-content inspector removes the meaningful text node from the parsed designer tree. The inspector then loses its selected node, so the user cannot type replacement text into the same field.

## Reproduction

1. Select a text node in the Layers tree.
2. Focus `Content > Text content` in the right inspector.
3. Remove all text.
4. Attempt to type replacement text.

## Expected

The empty text position remains selected and accepts replacement content.

## Actual

The parser omits whitespace-only text nodes, selection is lost, and the text field disappears or stops updating the intended range.

## Likely Direction

Source operations need a persistent selection anchor independent of the current meaningful-node projection. Empty editable text positions may require placeholder nodes in memory without writing placeholders to the SFC.

## Acceptance Criteria

- Clearing a text field keeps the inspector active.
- New text can be entered immediately afterward.
- No placeholder metadata is persisted to source.
- Undo/redo can eventually represent the clear and restore operations independently.

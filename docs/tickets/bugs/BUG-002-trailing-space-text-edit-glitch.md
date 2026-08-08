# BUG-002: Trailing Space Text Edit Glitch

**Status:** Open

**Found in:** Ticket 02

## Summary

Typing a space at the end of text in the right inspector causes the field and parsed tree to disagree, producing cursor or value glitches.

## Reproduction

1. Select a text node in the Layers tree.
2. Place the cursor at the end of `Content > Text content`.
3. Press Space.
4. Continue typing or inspect the cursor/value after transient preview reconciliation.

## Expected

The trailing space remains in the input and the cursor remains after it while the user continues editing.

## Actual

Text normalization trims the parsed value during candidate reconciliation, causing the controlled textarea to replace its value and disturb the cursor.

## Likely Direction

Preserve exact source text separately from the display label. Avoid replacing the controlled field from reparsed normalized text while it is actively being edited.

## Acceptance Criteria

- Leading, trailing, and repeated spaces can be entered without cursor movement.
- Tree labels may normalize whitespace, but inspector values preserve exact content.
- Preview and saved source represent Vue whitespace behavior predictably.

# 04: Structure And Slots

**Status:** Complete

**Completed:** 2026-08-09

## User Outcome

A user rearranges a page through its tree or canvas while preserving valid Vue nesting and slot semantics.

## Scope

- Move and reorder siblings.
- Move nodes between compatible parents.
- Duplicate and remove nodes.
- Named and default slot representation.
- Slot-aware insertion targets.
- Locked-region boundary enforcement.

## Acceptance Criteria

- Reordering changes both preview and source.
- Named slot content remains in the correct slot.
- Duplicate creates independent valid source.
- Delete removes only the selected source range.
- Operations cannot cross unsupported structural boundaries.

## Verification

- Structural operation fixtures including whitespace, slots, and locked directives.
- Browser test reordering and deleting feature cards with undo deferred to ticket 07.

## Completion Notes

- Existing editable nodes are draggable in the Layers tree with before, inside, and after drop positions.
- Palette drops remain explicitly inside the highlighted container.
- The tree displays the intended move position while dragging.
- Cross-parent moves and sibling reordering use minimal source transactions and preserve readable indentation.
- Duplicate and Delete actions are available in the shared right inspector.
- Named slot templates appear as `slot:<name>` containers; ordinary component children represent the default slot.
- Locked structural nodes and all descendants reject edits and cross-boundary moves.
- Browser verification moved a feature card across parents, duplicated and removed a card, saved a move, and confirmed the resulting disk source before restoring the fixture.
- Unit tests cover reorder, nesting, duplication, removal, cycles, locked boundaries, source formatting, and named slots.

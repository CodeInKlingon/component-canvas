# 04: Structure And Slots

**Status:** Planned

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

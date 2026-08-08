# 06: Visual Styles

**Status:** Planned

## User Outcome

A user adjusts common layout and presentation properties and receives readable CSS in the Vue SFC.

## Scope

- Parse scoped and unscoped style blocks with PostCSS.
- Match selected nodes to editable class rules.
- Create or choose a local class when needed.
- Controls for spacing, dimensions, typography, colors, borders, flex, and grid.
- Display computed and inherited styles as read-only context.

## Acceptance Criteria

- Editing an existing declaration preserves unrelated CSS.
- Adding a declaration creates valid, readable CSS.
- New local classes are applied to the selected node.
- Scoped style behavior is preserved.
- Programmatic or ambiguous style sources are marked read-only.

## Verification

- CSS mutation fixtures covering formatting, media queries, and scoped blocks.
- Browser test changing hero spacing and feature grid gap.

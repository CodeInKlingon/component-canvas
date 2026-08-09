# 06: Visual Styles

**Status:** Complete

**Completed:** 2026-08-09

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

## Completion Notes

- PostCSS parsing and mutation run only in the Vite plugin; the browser receives serializable rules and declarations.
- The right inspector now has a Style tab for layout, spacing, typography, color, surface, flex/grid display, and common dimensions.
- Existing local class rules can be selected and edited with minimal declaration replacements.
- Unsetting a control removes its declaration without changing unrelated CSS.
- Elements without a static class receive a local designer class and scoped style rule on their first style edit.
- Computed values are reported by the preview separately from editable SFC declarations.
- Browser verification changed `.hero` spacing, created a class/rule for `nav`, saved both changes, and confirmed the disk source before restoring the fixture.
- Unit tests cover reading, replacing, adding, removing, and creating scoped styles.

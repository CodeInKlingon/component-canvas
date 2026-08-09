# 12: Advanced Style Inspector

**Status:** Planned

## User Outcome

A user can make detailed CSS adjustments through a clean, contextual inspector without being restricted to a small preset list or forced into source mode for ordinary styling work.

## Principles

- Show the controls most relevant to the selected element and its current CSS first.
- Use progressive disclosure instead of placing every CSS property on screen at once.
- Allow any valid CSS value even when a visual preset or specialized control does not cover it.
- Keep the Vue SFC and its existing CSS authoritative.
- Apply minimal declaration-level edits and preserve unrelated rules, comments, formatting, selectors, and at-rules.
- Clearly distinguish authored declarations from computed and inherited values.

## Contextual Controls

- Organize controls into collapsible sections such as Layout, Size, Spacing, Typography, Background, Border, Effects, Position, and Advanced.
- Keep active sections and authored properties prominent while unused advanced sections remain compact.
- When `display: flex` or `inline-flex` is active, expose flex direction, wrapping, main-axis alignment, cross-axis alignment, content alignment, row gap, and column gap.
- For children of a flex container, expose order, grow, shrink, basis, self-alignment, and shorthand-aware flex editing.
- When `display: grid` or `inline-grid` is active, expose template columns and rows, auto flow, auto tracks, alignment, and gaps.
- For children of a grid container, expose grid column, grid row, spans, placement, and self-alignment.
- Show position offsets and stacking controls when positioning makes them applicable.
- Show overflow-axis controls alongside dimensions and min/max constraints.
- Support common box-model, typography, color, background, border, radius, shadow, opacity, transform, transition, and cursor properties.
- Use segmented controls, toggles, pickers, linked-side editors, and numeric steppers where they improve clarity without preventing direct values.

## Flexible Values

- Every specialized control has a direct text-value path for valid CSS not represented by its presets.
- Numeric controls support appropriate units, unit changes, negative values where valid, and CSS-wide keywords.
- Preserve and accept CSS variables, `calc()`, `clamp()`, gradients, multiple shadows, custom functions, and browser-supported values.
- Do not replace an unfamiliar valid value merely because the visual control cannot parse it.
- Mark declarations backed by dynamic or otherwise unsafe-to-edit source as read-only with an explanation.

## Advanced Declarations

- Provide a searchable add-property control for supported CSS properties.
- Show all declarations authored in the selected editable rule, including declarations without a specialized control.
- Allow advanced declarations to be added, edited, disabled or removed, and reordered.
- Offer property-name and common-value suggestions without requiring the user to choose a suggestion.
- Surface invalid property names and values before applying a candidate source update.
- Provide a direct route to the relevant source range for selectors, values, or constructs the visual inspector cannot safely mutate.
- Avoid duplicating a declaration when it is already represented by a specialized control.

## Cascade And Targeting

- Show which editable class rule will receive the change before it is applied.
- Allow switching among matching editable local rules or creating a dedicated local class.
- Display overridden, inherited, and computed values as context without presenting them as directly authored values.
- Explain when specificity, `!important`, an inline style, a media query, or an external stylesheet wins over the edited declaration.
- Preserve scoped and unscoped style behavior.
- Do not silently edit external stylesheets or ambiguous selectors.

## Shorthands

- Read common shorthand and longhand declarations together without displaying contradictory controls.
- Prefer the smallest safe edit that preserves the author's existing shorthand style.
- Warn before an edit would necessarily expand or replace a shorthand and show the resulting declarations.
- Preserve unrelated components of multi-value declarations such as border, background, transform, transition, and shadow.

## Inspector Usability

- Sections are searchable by both property name and common design terms such as "horizontal alignment" or "rounded corners."
- Recently changed and currently authored properties remain easy to find.
- Controls have concise labels, value reset actions, and accessible descriptions where CSS behavior is not obvious.
- Keyboard editing, focus order, and increment/decrement behavior work without a mouse.
- Inspector density remains usable in the right panel at its minimum supported width.

## Acceptance Criteria

- Setting `display: flex` immediately reveals relevant container controls, including flex direction.
- Selecting a child of a flex or grid container reveals the relevant child controls.
- Changing a contextual control produces valid, readable CSS and updates the candidate preview before save.
- A user can enter a valid value not offered by a preset and the inspector preserves it exactly.
- A user can find, add, edit, reorder, disable or remove a declaration without opening source mode.
- Existing unfamiliar but valid CSS remains intact and visible in the Advanced section.
- Shorthand edits do not discard unrelated values.
- The inspector explains why an authored value is overridden or cannot be safely edited.
- Style edits participate in the existing source-level undo/redo history.
- Scoped rules, unsupported selectors, and external stylesheets retain their existing safety behavior.

## Verification

- Unit-test contextual control visibility for block, flex, grid, positioned, and child layout contexts.
- Unit-test arbitrary values, CSS variables, functions, units, CSS-wide keywords, and invalid candidates.
- Add mutation fixtures for shorthand/longhand combinations and multi-value declarations.
- Add fixtures containing scoped styles, media queries, pseudo-selectors, `!important`, comments, and unfamiliar valid properties.
- Component-test property search, section disclosure, advanced declaration editing, and keyboard operation.
- Browser-test configuring flex direction, wrapping, alignment, child growth, and gaps.
- Browser-test configuring grid tracks and child placement.
- Browser-test an arbitrary `clamp()` value and a CSS custom property reference.
- Browser-test cascade explanations and switching among editable target rules.
- Verify preview updates, save, reload, undo, and redo for both specialized and advanced controls.

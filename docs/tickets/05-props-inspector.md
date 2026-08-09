# 05: Props Inspector

**Status:** Complete

**Completed:** 2026-08-09

## User Outcome

A user selects a component and configures its props using appropriate controls supplied by the component registry.

## Scope

- Inspector controls for string, number, boolean, select, and color metadata.
- Static props, events, slots, defaults, required state, and JSDoc inference with `vue-component-meta` using the host project's `tsconfig.json`.
- Registry metadata overrides for editor-specific controls, labels, option ordering, categories, and example children.
- Attributes and literal bindings display.
- Clear locked state for arbitrary expressions.
- Defaults, required state, labels, and descriptions.

## Acceptance Criteria

- `AppButton.tone` renders as a select control.
- TypeScript literal unions infer select options without duplicating them in registry metadata.
- Boolean and numeric TypeScript props infer checkbox and number controls.
- Explicit registry metadata takes precedence over inferred metadata.
- Boolean and numeric values produce literal bindings.
- Removing an optional value removes its attribute safely.
- Unsupported expressions remain visible and unchanged.
- Inspector changes use the transient preview and save pipeline.

## Verification

- Metadata normalization and prop-source operation tests.
- Browser test changing the example button tone.

## Completion Notes

- `vue-component-meta` reads each registered component through the host project's `tsconfig.json`.
- The plugin serializes inferred props, defaults, required state, descriptions, events, and slots without exposing TypeScript objects to the browser.
- Literal string unions infer select controls; boolean and number props infer checkbox and number controls.
- Registry control and option overrides take precedence over inference; the example verifies a string prop overridden to a color control.
- The right inspector adds missing props, updates static or literal-bound props, and resets optional props by removing their source attribute.
- Arbitrary expression props remain visible and disabled.
- Browser verification changed and reset the inferred `AppButton.tone` select and inspected inferred number and boolean controls for `NoticeBadge`.
- The registry API reports `tone:select`, `count:number`, `subtle:checkbox`, and overridden `accent:color`.

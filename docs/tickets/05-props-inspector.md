# 05: Props Inspector

**Status:** Planned

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

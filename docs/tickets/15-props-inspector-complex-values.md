# 15: Props Inspector Complex Values

**Status:** Planned

## User Outcome

A user can edit props whose values are arrays, objects, or other complex expressions without the inspector misrepresenting them or forcing unsafe simplified controls.

## Scope

- Display array and object props with an appropriate editable representation instead of a misleading primitive control.
- Preserve expression-based props as explicit expressions when they cannot be safely reduced to literal inputs.
- Distinguish editable literals from locked or read-only expression source.
- Provide a safe route for editing complex values through source-aware controls when needed.
- Keep existing primitive prop controls unchanged for simple string, number, boolean, select, and color values.

## Acceptance Criteria

- Array and object prop values render in a control suited to their type or expression shape.
- Complex values remain visible even when they cannot be edited with a simple field.
- Expression-backed props are clearly identified as expressions.
- Editing a supported complex value updates the preview through the existing transient pipeline.
- Unsupported or unsafe expressions remain unchanged and clearly read-only.

## Verification

- Add tests for array, object, and expression prop metadata rendering.
- Add mutation tests for safe complex prop edits and locked expression display.
- Browser-test the inspector with a component that exposes array, object, and expression props.

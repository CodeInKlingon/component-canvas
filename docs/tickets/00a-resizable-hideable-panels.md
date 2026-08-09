# 00a: Resizable And Hideable Panels

**Status:** Planned

## User Outcome

A user can resize or hide the left and right panels to give the tree, canvas, inspector, or source editor the space needed for the current task.

## Scope

- Add draggable resize handles between the left sidebar, canvas, and right inspector.
- Allow the left and right panels to be collapsed and restored independently.
- Add visible collapse controls that do not depend on discovering the resize handle.
- Preserve panel widths and collapsed state across browser reloads.
- Reflow the canvas immediately while resizing or collapsing panels.
- Keep the top toolbar aligned and usable in every panel configuration.
- Restore useful defaults when persisted dimensions are no longer valid.

## Layout Behavior

- Left panel defaults to its current width and has practical minimum and maximum widths.
- Right panel defaults to its current width and can expand enough for source editing.
- The canvas consumes all remaining width.
- Dragging cannot make the canvas, tree, or inspector unusably narrow.
- Double-clicking a resize handle restores that panel's default width.
- Collapsed panels leave a compact restore control visible.
- Window resizing clamps saved widths without discarding the user's preferred values unnecessarily.
- Panel changes must not reload the preview iframe or lose the current selection.

## Interaction And Accessibility

- Resize handles use an appropriate column-resize cursor and clear hover/active states.
- Handles expose separator semantics with orientation, current value, minimum, and maximum values.
- Keyboard users can focus a handle and resize it with arrow keys.
- Larger keyboard steps are available with Shift plus an arrow key.
- Collapse and restore buttons have descriptive accessible labels and tooltips.
- Focus moves predictably when a panel containing the focused element is collapsed.

## Persistence

- Store layout preferences under a versioned designer-specific local-storage key.
- Persist left width, right width, left collapsed state, and right collapsed state.
- Treat malformed, stale, or out-of-range persisted values as defaults.
- Keep layout preferences local to the designer rather than writing them into the user's Vue project.

## Acceptance Criteria

- The left and right panels can be resized independently with pointer dragging.
- Both panels can be hidden and restored independently.
- Widths and collapsed states survive a full browser reload.
- Resizing preserves the active document, selected node, inspector tab, and unsaved source.
- Resizing or collapsing does not reload the canvas iframe.
- The canvas always fills the remaining available width.
- Keyboard resizing and collapse controls work without a mouse.
- Desktop Chromium remains usable at the minimum supported window width.

## Verification

- Unit-test persisted-layout parsing, defaults, and clamping.
- Component-test pointer and keyboard resize calculations.
- Browser-test resizing both panels and reloading the designer.
- Browser-test collapsing both panels and restoring them.
- Browser-test that iframe identity and unsaved source remain unchanged during layout operations.
- Browser-test behavior after narrowing and widening the browser window.

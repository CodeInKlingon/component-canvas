# 11: Editor UI Polish

**Status:** Planned

## User Outcome

A user gets a cohesive, accessible editor in clean dark and light themes and can adapt the workspace to the current task by resizing, hiding, and collapsing its major regions.

## Scope

- Establish complete dark and light editor themes using shared semantic design tokens.
- Add a theme control with light, dark, and system-preference modes.
- Apply the selected theme consistently to the toolbar, panels, tree, palettes, inspector, diagnostics, resize handles, and source editor.
- Keep the rendered document theme independent from the editor chrome theme.
- Add draggable resize handles between the left sidebar, canvas, and right inspector.
- Allow the left and right panels to be hidden and restored independently.
- Make the registered component palette and native element palette independently collapsible.
- Make document-tree elements with children independently collapsible.
- Add smooth canvas zooming and panning without changing the rendered document's configured viewport.
- Preserve theme, panel widths, panel visibility, and palette expansion state across reloads.
- Refine spacing, typography, borders, focus states, disabled states, hover states, and visual hierarchy without changing core workflows.
- Keep the desktop-first interface usable at the minimum supported Chromium window width.

## Theme Behavior

- Use semantic variables for backgrounds, elevated surfaces, borders, text, muted text, accent, selection, warning, error, and focus colors.
- Avoid separate ad hoc color declarations for light and dark mode.
- Default to the system preference until the user explicitly selects a mode.
- Respond to system theme changes while system mode is active.
- Apply the persisted preference before the editor becomes visible to avoid a theme flash.
- Keep syntax highlighting legible and coordinated with each editor theme.
- Meet practical WCAG contrast expectations for text, controls, focus indicators, and diagnostics.
- Do not inject editor theme styles into the preview document.

## Panel Behavior

- Left and right panels resize independently using visible draggable separators.
- Each panel has an explicit hide control that does not depend on discovering a resize handle.
- Hidden panels leave a compact, discoverable restore control.
- The canvas consumes all remaining space and reflows immediately.
- Practical minimum and maximum widths prevent the tree, canvas, inspector, or source editor from becoming unusable.
- Double-clicking a resize handle restores that panel's default width.
- Window resizing clamps effective dimensions without unnecessarily discarding the preferred saved widths.
- Resizing and hiding panels must not reload the preview iframe or lose document, selection, history, inspector, or unsaved-source state.

## Palette Behavior

- Registered Components and Native Elements have separate disclosure controls.
- Palette headings communicate their expanded state with accessible labels and `aria-expanded`.
- Collapsing a palette preserves its contents, drag behavior, and current document selection.
- Palette state persists independently from panel visibility.
- Collapsed palettes reduce to compact headings so the Layers tree remains easy to reach.
- Keyboard users can expand, collapse, and move focus through palette controls without a mouse.

## Tree Behavior

- Tree elements with children have a clear disclosure control separate from node selection.
- Collapsing an element hides all descendants without changing the Vue document or preview.
- Expanding an element restores its descendants in their existing order and selection state.
- Selecting an element by canvas or source interaction expands its ancestor chain so the selection is visible.
- Disclosure controls communicate their state with `aria-expanded` and work with pointer and keyboard input.
- Leaf elements do not display an inactive disclosure control.
- Expansion state is retained while editing and reparsing the current document when matching nodes can be reconciled.
- Expansion state is maintained separately for each open document during the editor session.

## Canvas Navigation

- Zoom continuously around the pointer position with a trackpad or modified mouse wheel.
- Pan smoothly with trackpad gestures, middle-button dragging, or Space plus primary-button dragging.
- Provide visible zoom-out, zoom-in, reset-to-100%, and fit-to-canvas controls with the current percentage.
- Use practical minimum and maximum zoom limits and clamp panning so the preview cannot become irretrievably lost.
- Keep zoom and pan as editor presentation state; they must not change the preview viewport size, responsive breakpoints, page source, or document CSS.
- Preserve accurate selection, hover, box-model overlays, drag targets, and drop coordinates at every zoom level.
- Keep zoom anchored during panel resizing and iframe refreshes without causing visible jumps.
- Reset and fit actions center the preview predictably, and a double-clickable shortcut may restore the default view.
- Keyboard users can zoom, reset, and fit the canvas without relying on pointer gestures.
- Prevent canvas gestures from interfering with normal scrolling and interaction inside the preview when pan or zoom mode is not active.
- Retain canvas navigation state per document during the editor session.

## Resize Accessibility

- Handles expose separator semantics, orientation, current value, minimum, and maximum values.
- Focused handles resize with arrow keys and use larger steps with Shift plus an arrow key.
- Pointer resizing uses an appropriate cursor and clear hover and active states.
- Collapse and restore controls have descriptive labels and tooltips.
- Focus moves predictably if a panel containing the focused control is hidden.

## Persistence

- Store preferences under a versioned designer-specific local-storage key.
- Persist theme mode, preferred left and right widths, panel visibility, and both palette disclosure states.
- Treat malformed, stale, and out-of-range values as defaults.
- Keep preferences local to the designer and out of the user's Vue project.

## Acceptance Criteria

- The complete editor is coherent and readable in dark and light themes.
- Light, dark, and system modes switch without reloading the document or preview.
- Theme selection survives a full browser reload without a visible incorrect-theme flash.
- Left and right panels can be resized, hidden, restored, and reset independently.
- Panel state survives reload and remains valid after narrowing and widening the window.
- Component and native palettes collapse and restore independently, with Layers remaining reachable.
- Tree elements can be collapsed and expanded without modifying source or losing selection.
- Canvas or source selection reveals a selected node hidden beneath collapsed ancestors.
- The canvas zooms smoothly around the pointer and pans with supported mouse and trackpad gestures.
- Zoom, reset, and fit controls work with pointer and keyboard input and report the active zoom percentage.
- Canvas navigation does not change the preview's responsive viewport, source, or CSS.
- Selection overlays and drag/drop targeting remain aligned while zoomed and panned.
- Panel resizing and preview refreshes preserve the current canvas view without visible jumps.
- All layout and palette controls work with pointer and keyboard input.
- Layout and theme changes preserve iframe identity, active document, selection, history, inspector tab, and unsaved source.
- The preview document is not visually modified by the editor's theme choice.
- Core controls have visible focus and sufficient contrast in both themes.

## Verification

- Unit-test preference parsing, versioning, defaults, migration, and dimension clamping.
- Component-test pointer and keyboard resizing calculations.
- Component-test palette disclosure and keyboard behavior.
- Component-test tree disclosure, leaf rendering, and keyboard behavior.
- Test that external selection expands the selected tree node's ancestor chain.
- Test that tree expansion survives a source reparse when nodes reconcile.
- Unit-test zoom bounds, pointer-anchored zoom calculations, panning bounds, reset, and fit calculations.
- Component-test canvas controls and keyboard shortcuts.
- Browser-test all theme modes, persistence, and system preference changes.
- Browser-test resizing, hiding, restoring, and resetting both panels.
- Browser-test collapsing both palettes and reaching the Layers tree.
- Browser-test mouse and trackpad-equivalent zooming and panning at minimum, intermediate, and maximum scales.
- Browser-test overlay alignment, element selection, and drag/drop while zoomed and panned.
- Browser-test that panel resizing and iframe refresh preserve canvas navigation state.
- Browser-test minimum-width behavior and persisted-width clamping.
- Verify iframe identity and unsaved source remain unchanged through every UI preference change.
- Run automated contrast checks for representative controls and diagnostic states in both themes.

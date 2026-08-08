# 01: Selectable Document Tree

**Status:** In progress

## User Outcome

A user opens a Vue document, sees its template hierarchy, and can select a rendered element from either the tree or canvas. Unsupported structures remain visible but locked with an explanation.

## Scope

- Parse SFC and template blocks with Vue compiler tooling.
- Return a serializable node tree with ephemeral IDs, source ranges, labels, and editability diagnostics.
- Instrument preview elements without changing saved source.
- Establish a schema-validated editor/preview message protocol.
- Synchronize selection from tree to preview and preview to tree.
- Draw a selection rectangle over the canvas.

## Out of Scope

- Source mutations.
- Drag and drop.
- Component prop controls.

## Acceptance Criteria

- Native elements and imported Vue components appear in source order.
- Text nodes with meaningful content appear in the tree.
- `v-for`, complex conditional structures, and unsupported expressions are marked locked.
- Clicking a tree node highlights its rendered element.
- Clicking a rendered element selects the matching tree node.
- Selection survives viewport changes.
- Parsing failures appear as diagnostics without crashing the editor.

## Verification

- Parser fixtures for elements, components, text, slots, and locked directives.
- Protocol validation unit tests.
- Browser test selecting the example hero and a feature card in both directions.

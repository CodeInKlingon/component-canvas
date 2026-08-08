# 03: Component Palette And Insertion

**Status:** Planned

## User Outcome

A user browses their configured component library and inserts a component into a valid location in the document.

## Scope

- Load and serialize `designer-components.ts` metadata.
- Searchable, categorized component palette.
- Native element primitives for common containers and text.
- Insert component imports and template nodes with minimal edits.
- Default props and example children from registry metadata.
- Canvas and tree insertion targets.

## Acceptance Criteria

- The example registry populates the palette.
- Inserting an unimported component adds one valid import.
- Inserting an existing component reuses its import.
- Candidate source renders before save.
- Invalid or locked insertion targets reject the operation visibly.

## Verification

- Registry serialization and import mutation tests.
- Browser test inserting an `AppButton` and saving it.

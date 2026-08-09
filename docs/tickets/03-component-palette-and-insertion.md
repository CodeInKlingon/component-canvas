# 03: Component Palette And Insertion

**Status:** Complete

**Completed:** 2026-08-08

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

## Completion Notes

- The configured registry is loaded through the host Vite pipeline and serialized without component implementations.
- Registry entries explicitly identify their source module for deterministic import generation.
- The left palette displays component labels and categories.
- Components can be inserted by clicking after selecting a container or by dragging onto a tree container.
- New imports are generated relative to the document; existing imports are reused.
- Locked and text targets reject insertion.
- Browser verification inserted an unimported `NoticeBadge`, rendered it in transient preview, and showed it in the tree and generated source.

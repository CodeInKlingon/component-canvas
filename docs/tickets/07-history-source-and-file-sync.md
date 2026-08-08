# 07: History, Source, And File Sync

**Status:** Planned

## User Outcome

A user moves freely between visual and source editing, can undo either kind of change, and never silently overwrites external edits.

## Scope

- Source-transaction undo and redo.
- Replace the textarea with a Vue-aware code editor.
- Source cursor and visual selection synchronization.
- External file watching and revision notifications.
- Conflict reload and explicit overwrite/merge choices.
- Optional recovery copies.

## Acceptance Criteria

- Visual and source changes share one ordered history.
- Undo/redo updates source, tree, inspector, and preview.
- External changes reload clean documents automatically.
- Dirty documents enter a conflict state without data loss.
- Formatting is explicit rather than automatic per operation.

## Verification

- Transaction and selection reconciliation tests.
- Browser test mixing source and visual changes, undoing, and simulating an external edit.

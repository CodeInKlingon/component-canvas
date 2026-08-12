# 14: Copy, Paste, and Duplicate Context Menus

**Status:** Planned

## User Outcome

A user can copy, paste, and duplicate nodes from the tree and canvas context menus, using the same safe source-level behavior as other document edits.

## Scope

- Add context menu actions for copy, paste, and duplicate on eligible nodes.
- Make copy and duplicate respect the current selection and node boundaries.
- Paste copied nodes into valid sibling or container locations.
- Preserve locked or unsupported source regions by disabling unsupported actions.
- Keep clipboard operations aligned with the existing document model and undo history.

## Acceptance Criteria

- Right-clicking an eligible node shows copy, paste, and duplicate actions where applicable.
- Copy places a transferable node payload on the clipboard.
- Paste inserts copied nodes into a valid location and updates selection to the new node.
- Duplicate creates a sibling copy using the existing source mutation pipeline.
- Context menu actions are hidden or disabled when the operation is invalid.
- Copy, paste, and duplicate participate in undo and redo.

## Verification

- Add unit or integration tests for clipboard payloads and duplicate source mutations.
- Browser-test copy, paste, and duplicate from tree and canvas context menus.
- Verify pasted and duplicated nodes preserve editable structure, props, and selection.

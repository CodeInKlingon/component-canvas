# 07a: Shiki Source View

**Status:** Planned

## User Outcome

A user can read and edit the authoritative Vue SFC with accurate, editor-quality syntax highlighting instead of a plain textarea.

## Scope

- Highlight Vue SFC source with [Shiki](https://shiki.style/).
- Load only the Vue/HTML, TypeScript, JavaScript, and CSS grammars needed by the designer.
- Match the designer's dark visual theme with an explicit Shiki theme.
- Preserve a real editable textarea or equivalent accessible input over the highlighted output.
- Keep text, selection, cursor, scrolling, and line wrapping synchronized between input and highlighted layers.
- Re-highlight valid and temporarily invalid source while typing without blocking input.
- Preserve the existing debounced transient preview and save pipeline.
- Display line numbers and the current cursor position.
- Keep source selection available for later source-to-canvas synchronization in ticket 07.

## Out of Scope

- Language-server completions.
- TypeScript diagnostics beyond the existing compiler pipeline.
- Code folding, minimap, multi-cursor editing, or a full VS Code-compatible editor.
- Automatic formatting on every edit.

## Acceptance Criteria

- `<template>`, `<script setup lang="ts">`, and `<style>` regions receive appropriate embedded-language highlighting.
- Highlighted output always represents the exact textarea value, including invalid intermediate source.
- Typing does not lose cursor position, selection, whitespace, or undo behavior.
- Horizontal and vertical scrolling remain synchronized.
- Highlighting is deferred or debounced so normal typing remains responsive on representative SFCs.
- The source remains editable with keyboard-only navigation and has an accessible label.
- `Ctrl/Cmd+S` continues to save through the current revision-checked workflow.
- Shiki and language grammars are lazy-loaded when the Source tab is first opened.
- No Node-only Shiki modules are included in the browser runtime.

## Verification

- Unit-test source-to-highlight scheduling and stale-result rejection.
- Component-test textarea/highlight scroll synchronization.
- Browser-test editing template text, TypeScript imports, and CSS while highlighting remains aligned.
- Browser-test temporarily invalid Vue syntax and recovery without losing the cursor.
- Verify the production bundle lazy-loads the Shiki chunk only after opening Source.

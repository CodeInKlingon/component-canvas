# 07a: Highlighted Source View

**Status:** Complete

## User Outcome

A user can read and edit the authoritative Vue SFC with accurate, editor-quality syntax highlighting instead of a plain textarea.

## Scope

- Edit Vue SFC source with [`@pierre/diffs/edit`](https://diffs.com/edit).
- Use its Vue-aware Shiki tokenization and explicit dark theme.
- Preserve its accessible contenteditable input, keyboard navigation, selection, scrolling, and line wrapping.
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
- Highlighted output always represents the exact editor value, including invalid intermediate source.
- Typing does not lose cursor position, selection, whitespace, or undo behavior.
- Horizontal and vertical scrolling remain stable while editing.
- Highlighting is deferred internally so normal typing remains responsive on representative SFCs.
- The source remains editable with keyboard-only navigation and has an accessible label.
- `Ctrl/Cmd+S` continues to save through the current revision-checked workflow.
- Pierre Edit and its language grammars are lazy-loaded when the Source tab is first opened.
- No Node-only editor modules are included in the browser runtime.

## Verification

- Unit-test source position and selection conversion.
- Browser-test editing template text, TypeScript imports, and CSS while highlighting remains aligned.
- Browser-test temporarily invalid Vue syntax and recovery without losing the cursor.
- Verify the production bundle lazy-loads the Pierre Edit chunk only after opening Source.

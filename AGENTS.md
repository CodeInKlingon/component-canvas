# Vue Designer

Vue Designer is a web-based WYSIWYG editor for arranging, configuring, and styling live Vue components. It integrates into an existing Vite project and keeps normal Vue Single-File Components (SFCs) as the canonical document format.

## Tech Stack

- TypeScript 5.8, ESM, and pnpm workspaces
- Vue 3.5 and Vite 6
- Vue compiler SFC/DOM packages for template parsing
- PostCSS for SFC style parsing and mutation
- `@pierre/diffs` for the source editor
- Vitest for unit and integration tests
- `vue-tsc` for Vue type checking
- Desktop Chromium as the initial browser target

## Workspace

- `packages/designer`: Vue editor UI, document tree, palettes, inspectors, history, source editor, and iframe canvas
- `packages/shared`: framework-neutral document model, protocol types and validation, SFC parsing, and minimal source/style mutations
- `packages/vite-plugin`: Vite integration, virtual preview modules, component metadata, guarded filesystem APIs, file watching, and preview isolation
- `packages/vue`: Vue SFC parsing, mutation, styles, preview mounting, metadata, AI language behavior, and Vue Vite integration
- `examples/basic`: sample Vue/Vite project used for development and browser verification
- `docs/tickets`: ordered feature slices and acceptance criteria

## Development And Verification

### Start The Dev Server

1. Run `pnpm install` when dependencies are not installed or the lockfile changed.
2. Run `pnpm dev` from the workspace root.
3. Keep the process running and use the local URL printed by Vite. Do not assume a port if Vite selects another one.

### Browser Connect MCP

- Use the `vscode-browser` MCP tools for interactive browser verification.
- Call `open_browser_page` first with the full local URL printed by Vite; the user may need to approve sharing the page in VS Code.
- Reuse the returned page ID for reads, clicks, typing, screenshots, and navigation instead of opening duplicate tabs.
- Prefer `read_page` for inspecting state and locating controls. Use screenshots for visual layout checks, not as the only functional verification.
- If a tool reports that the page is not shared, ask the user to enable sharing from the VS Code browser tab.
- Re-read the page after interactions that materially change editor or preview state.

### Browser Verification

- Browser-test user-visible changes against `examples/basic` after automated checks pass.
- Exercise the complete affected workflow, including candidate preview before save, save/reload when applicable, and undo/redo for source mutations.
- Verify editor interactions and the sandboxed preview independently; a rendered iframe alone does not prove editor state or protocol behavior is correct.
- Check both desktop and narrowed layouts for UI changes and light/dark themes when styling is affected.
- Watch for compiler, runtime, protocol, and console diagnostics during the workflow.
- Do not leave temporary fixture edits in the example project, and never overwrite unrelated user changes while restoring test setup.

### Automated Checks

- `pnpm test`: run all workspace Vitest suites.
- `pnpm typecheck`: run TypeScript and Vue type checking across the workspace.
- `pnpm build`: validate all package builds and the example production build.
- Run all three before considering a ticket complete. During iteration, use filtered package commands when useful, then finish with the root commands.

## Architecture

The host project's Vite pipeline remains responsible for aliases, plugins, dependencies, app setup, styles, and component implementations. The Vite plugin discovers configured documents and components, serves the editor, and compiles saved or transient candidate SFC source through that pipeline.

The designer parses each SFC into an editable tree with ephemeral node identities and source ranges. A visual action becomes a typed, minimal source-range edit; the complete SFC is reparsed and validated before candidate preview or save. Source-level transactions provide one undo/redo history across visual, style, and source editing.

Preview code runs in a sandboxed iframe on a separate loopback origin. Editor/preview communication uses schema-validated, session-bound `postMessage` messages. Short-lived capabilities protect host APIs, and the preview receives no filesystem credentials.

## Core Constraints

- The Vue SFC is authoritative; do not introduce a separate canonical JSON document.
- Use Vue compiler tooling and PostCSS rather than regex for structural source changes.
- Preserve unsupported syntax as locked source and never silently rewrite it.
- Keep mutations minimal and preserve unrelated formatting, comments, and code.
- Reparse and validate every candidate mutation before previewing or saving it.
- Keep unsaved edits transient until an explicit save.
- Require revision checks and root-confined paths for filesystem writes.
- Never execute project preview code in the editor window.
- Keep editor theme and canvas presentation state out of the rendered document and saved SFC.
- Treat normal DOM flow and CSS, not absolute-positioned artboards, as the layout model.

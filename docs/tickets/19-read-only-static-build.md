# 19: Read-Only Static Build

**Status:** Complete

**Completed:** 2026-10-14

## User Outcome

`vite build` produces a static, read-only designer in place of the host app. Anyone can browse designs, select nodes in the tree or canvas, and inspect source, props, and styles, but nothing can be changed.

## Scope

- In a client build the plugin replaces the inputs with two virtual pages: `index.html` (the designer, `vue-designer-mode` = `readonly`) and `__designer/preview.html`. The build targets `es2022` because preview entries use top-level await.
- The preview page loads the document named in its query through a lazy map of instrumented preview modules, using the same bridge as the dev preview.
- `generateBundle` emits `__designer/data/config.json`, `documents.json`, `documents/<path>.json` (parsed tree, source, revision, and style rules precomputed for every node), and `components.json` (component metadata including props).
- Scoped styles of documents are re-scoped to their preview module so Vite does not tree-shake them.
- The designer selects a static host from the page mode. The static host reads the emitted JSON and rejects every mutating request.
- The editor hides Save, undo/redo, the component palette, AI editing, duplicate/delete, and insert/paste menu items. Inspector controls are read-only or disabled, tree drag-and-drop is off, and the source view blocks edits while keeping selection and copy.

## Isolation Trade-Off

A static host has no second loopback origin, and an opaque-origin iframe cannot load same-host module scripts without CORS headers. Read-only previews therefore use `sandbox="allow-scripts allow-same-origin"`. This is acceptable because the build exposes no filesystem APIs, capabilities, or credentials. Previews still run in their own window and communicate only through the session-bound message protocol. The dev server keeps the separate-origin isolation from ticket 08.

## Notes

- The build replaces the host app's output. A project that also ships the real app needs a separate Vite config for its production build without the designer plugin.

## Acceptance Criteria

- [x] `pnpm build` produces `examples/basic/dist/index.html` (the designer) and `dist/__designer/data/*.json`.
- [x] The landing screen shows a Read-only badge and no New design action.
- [x] Previews render with their scoped styles, and tree and canvas selection work.
- [x] Props and styles are visible but cannot be changed. The context menu offers only Copy.
- [x] Typing, paste, undo, and save in the source view change nothing.
- [x] No requests are made to `/__designer/api` in the static build.

## Verification

- `packages/vite-plugin/src/documents.test.ts`: build inputs, emitted data, and style re-scoping.
- `packages/designer/src/host.test.ts`: static reads, precomputed style rules, rejected writes, base-path URLs.
- Browser verification of `vite preview` against `examples/basic` on 2026-10-14.

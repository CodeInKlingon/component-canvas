# 18: Designer Takeover And Landing Screen

**Status:** Complete

**Completed:** 2026-10-14

## User Outcome

Running the dev server opens the designer instead of the host app. A landing screen lists every design file matched by the plugin's `documents` patterns, grouped by folder, and creates new designs from a starter template.

## Scope

- Serve the designer shell at `/` and `/index.html`; `/__designer` redirects to `/`. The host app's entry page is not served while the designer is installed, but host modules still compile for previews.
- Hash routes: `#/` shows the landing screen and `#/edit/<path>` opens a design. Leaving a design with unsaved changes asks for confirmation, including browser back/forward.
- Landing screen: folders relative to the static base of each `documents` pattern, collapsible folder sections, cards with name, path, and last-modified time, search, refresh, and an empty state naming the configured patterns.
- `POST /__designer/api/documents` creates `{ directory, name }` using the framework's optional `createDocument` starter. The Vue adapter supplies a minimal SFC.
- A design switcher in the Layers panel and a "Designs" link in the editor topbar.

## Acceptance Criteria

- [x] `/` renders the designer and lists `src/pages/**/*.vue` in the example project.
- [x] New designs are validated by name, confined to the project root (including through symbolic links), required to match the `documents` patterns, and never overwrite an existing file.
- [x] A created design opens in the editor and appears in the landing list.
- [x] Candidate preview, save, undo/redo, and style edits continue to work for opened designs.
- [x] Cancelling the discard confirmation keeps the editor and its unsaved changes.
- [x] The landing screen works at phone width without horizontal scrolling.

## Verification

- `packages/vite-plugin/src/documents.test.ts`: pattern roots and matching, path confinement, create endpoint (capability, 201, 409, traversal, pattern mismatch), designer shell at `/`.
- `packages/designer/src/router.test.ts` and `landing.test.ts`: route encoding, folder grouping, creatable folders, relative times.
- `packages/vue/src/create-document.test.ts`: the starter SFC parses with no diagnostics.
- Browser verification against `examples/basic` on 2026-10-14.

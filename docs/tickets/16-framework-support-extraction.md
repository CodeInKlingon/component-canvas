# Framework Support Extraction

## Goal

Separate support for editing Vue documents from the framework-neutral designer and Vite infrastructure. Vue support will be supplied explicitly to the Vite plugin, allowing React, Solid, or Svelte support to be developed later as independent packages.

The editor may continue to be implemented in Vue. This ticket separates the framework used to implement the editor from the framework of the document being edited.

## Target API

```ts
import { defineConfig } from 'vite'
import designer from '@vue-designer/vite'
import vue from '@vue-designer/vue'

export default defineConfig({
  plugins: [
    designer({
      framework: vue(),
      documents: 'src/pages/**/*.vue',
      app: './src/designer-app.ts',
      components: './src/designer-components.ts',
    }),
  ],
})
```

The Vue support package owns and contributes the configured `@vitejs/plugin-vue` integration. Applications must not also register a duplicate Vue plugin.

## Target Packages

### `@vue-designer/shared`

Framework-neutral, serializable contracts only:

- Document trees, nodes, source ranges, and diagnostics
- Source and style operation contracts
- Candidate and mutation result contracts
- Editor/preview protocol types and validation
- Framework identity and client capability metadata

It must not depend on Vue compiler or Vue component metadata packages.

### `@vue-designer/designer`

- The editor UI, which may remain implemented in Vue
- Framework-neutral tree, source, history, selection, and canvas workflows
- No edited-document parser, compiler, or source mutator
- Controls enabled from server-provided framework and node capabilities

### `@vue-designer/vite`

- Framework-neutral Vite server integration
- Document discovery and root confinement
- Capabilities, revisions, atomic persistence, and file watching
- Candidate storage and lifecycle
- Preview-origin isolation, proxying, CSP, and generic preview bridge
- Framework-neutral API routing
- Delegation of document-specific behavior to the configured framework support

### `@vue-designer/vue`

- Vue SFC and template parsing
- Vue source operations and validation
- Vue template instrumentation
- Vue SFC style discovery and mutation
- Vue candidate module identities and subrequest handling
- Vue preview bootstrap and application setup
- Vue component metadata extraction
- Vue-specific AI prompting and response extraction
- `@vitejs/plugin-vue` integration and Vue runtime feature flags

## Framework Contract

Define the exact contract during implementation, keeping it no broader than required by current Vue behavior. Its responsibilities should resemble:

```ts
interface DesignerFramework {
  id: string
  client: DesignerFrameworkClientMetadata
  vite?: PluginOption

  parse(context: DocumentContext): ParsedDesignerDocument

  applySourceOperation(
    context: DocumentContext,
    operation: DesignerSourceOperation,
  ): DesignerSourceOperationResult

  instrument(context: TransformContext): TransformResult

  preview: {
    createCandidateId(context: CandidateContext): string
    resolveCandidateId(id: string): CandidateReference | undefined
    createDocumentId(path: string): string
    createEntry(context: PreviewContext): string
  }

  styles?: FrameworkStyleSupport
  components?: FrameworkComponentSupport
  ai?: FrameworkAiSupport
}
```

The adapter executes on the Vite server. Compiler ASTs and executable adapter functions must not cross into the editor. Only normalized trees, operations, diagnostics, mutation results, and capability metadata are sent to the browser.

## Implementation Plan

### 1. Establish Neutral Contracts

- Move parsed-document and mutation-result types into framework-neutral shared modules.
- Add framework identity, source language, file extension, document label, and capability metadata.
- Add runtime validation for source operation requests.
- Represent relevant edit and containment capabilities on normalized nodes, including whether a node can contain children.
- Keep absolute filesystem paths and compiler details server-only.

### 2. Move Browser Mutations To The Server

- Add `POST /__designer/api/source-candidate`.
- Accept the document path, current source, and a validated source operation.
- Apply the operation and reparse its result on the server.
- Return the new source, tree, diagnostics, candidate ID, and selection offset.
- Change `App.vue` to consume this response instead of calling Vue parser and mutator functions directly.
- Remove the local parse path used when candidate source equals saved source; reuse known document state or request server state instead.
- Preserve stale-request protection, history semantics, selection reconciliation, and undo/redo.
- Replace parser-backed designer test fixtures with literal normalized nodes where parser behavior is not under test.

This data-flow change should be completed before moving implementation files between packages so behavior and package extraction are not changed simultaneously.

### 3. Make The Editor Framework-Aware

- Replace hard-coded `document.vue`, Vue syntax highlighting, and `Vue SFC` labels with server-provided metadata.
- Use framework and node capabilities to show or disable structure, style, component, and AI controls.
- Remove edited-document Vue compiler code from the designer browser dependency graph.
- Keep the editor's own Vue runtime independent from document support.

### 4. Create `@vue-designer/vue`

- Add a new workspace package at `packages/vue`.
- Move `packages/shared/src/parse.ts` and its behavioral tests into it.
- Move Vue-specific SFC style discovery and mutation into it.
- Move `@vue/compiler-dom`, `@vue/compiler-sfc`, and applicable PostCSS dependencies to it.
- Export a `vue()` framework factory.
- Stop exporting Vue parser and mutator runtime functions from `@vue-designer/shared`.
- Do not add compatibility re-exports that preserve the unwanted shared-to-Vue dependency.

### 5. Delegate Vite Behavior

- Require `framework` in the `@vue-designer/vite` options.
- Delegate parsing, validation, source mutation, style behavior, and instrumentation to it.
- Let Vue support contribute `@vitejs/plugin-vue` while preserving host-configured compiler options.
- Move `.vue` candidate IDs, saved preview IDs, and Vue SFC subrequest handling to Vue support.
- Keep generic candidate storage, revisions, filesystem safeguards, API capabilities, and preview-origin proxying in Vite core.
- Test Vite core with a fake framework implementation to prove it has no runtime dependency on Vue support.

### 6. Extract Vue Preview Behavior

- Move Vue `createApp`, `h`, app setup, and disposal behavior into Vue support.
- Extract DOM selection, overlays, computed-style reporting, diagnostics transport, and `postMessage` handling into a framework-neutral preview bridge.
- Have Vue support generate an entry that imports and installs that bridge.
- Preserve host aliases, dependencies, plugins, global CSS, HMR, and application setup.
- Keep filesystem capabilities and API credentials out of the preview runtime.

### 7. Move Vue Metadata And AI

- Move `vue-component-meta` and Vue registry interpretation into Vue support.
- Move Vue-specific prompts, fenced `vue` source extraction, and generated-source validation into Vue support.
- Keep generic AI endpoint authorization and request handling in Vite core.
- Treat metadata, styles, and AI as optional framework capabilities.

### 8. Harden Validation And Persistence

- Parse and validate through the framework immediately before every save.
- Reject invalid or unsupported source without writing it.
- Continue revision checks, root confinement, and atomic file replacement.
- Reparse every framework-produced mutation before candidate storage or preview.
- Return validation failures as appropriate client errors and reserve server errors for plugin or adapter defects.

### 9. Update Examples And Documentation

- Change `examples/basic` to import `@vue-designer/vue` and pass `framework: vue()`.
- Remove standalone duplicate registration of `@vitejs/plugin-vue`.
- Document how Vue compiler options are supplied through Vue support.
- Document the framework contract and capability model only after the Vue extraction proves the required boundary.
- Do not implement speculative React, Solid, or Svelte abstractions in this ticket.

## Dependency Rules

The intended dependency direction is:

```text
@vue-designer/shared <- @vue-designer/designer
@vue-designer/shared <- @vue-designer/vite
@vue-designer/shared <- @vue-designer/vue

@vue-designer/vite receives @vue-designer/vue at configuration time
```

The following dependencies are prohibited:

- `@vue-designer/shared` to `@vue-designer/vue`
- `@vue-designer/designer` to the edited-document Vue compiler or adapter
- A static runtime import from `@vue-designer/vite` to `@vue-designer/vue`
- Vue compiler or `vue-component-meta` dependencies in framework-neutral packages

## Test Plan

### Shared

- Protocol and runtime request validation
- Serializable document and operation contracts
- Framework and node capability contracts
- No Vue syntax behavior tests

### Vue Support

- Preserve all current parsing, locking, mutation, instrumentation, and style tests.
- Cover malformed and incomplete SFCs.
- Cover script and script-setup combinations, TypeScript, comments, and unusual formatting.
- Cover candidate roots versus Vue template and style subrequests.
- Cover scoped styles, multiple style blocks, and style parse failures.
- Cover preview entry generation and app setup.
- Cover component metadata lifecycle and Vue AI response validation.

### Vite Core

- Use a fake framework to verify all delegation points.
- Verify unsupported optional capabilities produce controlled responses.
- Verify adapter failures cannot store candidates or write files.
- Verify save always reparses before writing.
- Verify preview and transform routing delegates only for owned documents and candidates.
- Verify capability, revision, path confinement, and preview-isolation behavior remains framework-neutral.

### Designer

- Visual operations use the source-candidate API.
- Returned source is recorded in history exactly once.
- Returned selection offsets restore the intended selection.
- Stale mutation responses cannot overwrite newer source.
- Diagnostics leave source and history coherent.
- Framework labels and source highlighting come from server metadata.
- Unsupported style, component, and AI controls are hidden or disabled.
- Node containment uses normalized capabilities rather than local Vue or HTML rules.

### End-To-End

- Open and parse a saved Vue document.
- Preview raw source and visual source candidates.
- Insert and configure native and registered components.
- Apply scoped style changes.
- Save, reload, and handle external file changes.
- Undo and redo source, visual, and style edits.
- Surface compiler and runtime diagnostics.
- Preserve preview isolation and host Vite behavior.

## Acceptance Criteria

- [ ] The example config explicitly imports Vue support and passes it as `framework: vue()`.
- [ ] `@vue-designer/vite` can be tested with a fake framework and has no static Vue support dependency.
- [ ] `@vue-designer/shared` has no Vue compiler dependencies or Vue parser/mutator exports.
- [ ] `@vue-designer/designer` does not parse or mutate edited Vue source locally.
- [ ] `@vue-designer/vue` owns Vue parsing, mutation, instrumentation, styles, preview mounting, metadata, and AI language behavior.
- [ ] Every candidate mutation and save is reparsed and validated by the configured framework.
- [ ] Unsupported framework capabilities are represented explicitly and handled safely by the editor.
- [ ] Existing Vue workflows retain their behavior, including candidate preview, save/reload, and undo/redo.
- [ ] `pnpm test`, `pnpm typecheck`, and `pnpm build` pass.
- [ ] Desktop and narrowed browser verification passes for the affected editor workflows.
- [ ] Light and dark themes remain functional where framework metadata or capability UI is visible.

## Out Of Scope

- Implementing React, Solid, or Svelte support
- Designing one universal AST or canonical JSON document
- Moving the editor UI away from Vue
- Supporting multiple document frameworks in one Vite plugin instance before a concrete use case requires it
- Adding backward-compatibility exports that preserve Vue dependencies in shared or Vite core

## Recommended Migration Order

1. Introduce neutral contracts and capability metadata.
2. Move visual source mutation behind the server API.
3. Make the editor consume framework metadata and remove its edited-document compiler dependency.
4. Create and populate `@vue-designer/vue`.
5. Inject the framework into Vite core and delegate language behavior.
6. Extract preview, metadata, style, and AI behavior.
7. Remove old Vue exports and dependencies.
8. Update the example and complete automated and browser regression verification.

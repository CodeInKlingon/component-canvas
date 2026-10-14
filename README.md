# Vue Designer

A web-based visual editor that keeps framework source files authoritative and renders them through the host project's Vite pipeline. Vue document support is provided by a separate adapter package.

## Configuration

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
      components: {
        sources: ['src/components/**/*.vue'],
      },
    }),
  ],
})
```

### Components

`components` lists where palette components come from. Names, imports, props, events, and slots are discovered automatically; `overrides` are optional.

```ts
components: {
  tagCase: 'pascal',     // default tag casing: 'pascal' | 'kebab'
  import: 'explicit',    // default import mode: 'explicit' | 'auto' | 'global'
  sources: [
    // Local files: names come from file names, imports are relative to the document
    'src/components/**/*.vue',
    { glob: 'src/forms/**/*.vue', label: 'Forms', namespace: 'directory' },
    // Library barrel: every component export is discovered from the package types
    { library: 'vuetify/components', label: 'Vuetify', tagCase: 'kebab', import: 'global', include: ['VBtn', 'VCard*'] },
    // Per-component modules
    { library: 'primevue', import: 'auto', components: ['Button', 'InputText'], from: (name) => `primevue/${name.toLowerCase()}` },
  ],
  overrides: {
    NoticeBadge: { category: 'Content', defaultContent: 'New', props: { accent: { control: 'color' } } },
    'vuetify:VBtn': { defaultContent: 'Click' },
  },
}
```

- `explicit` inserts an `import` into `<script setup>` and reuses an existing matching import. `auto` (for example unplugin-vue-components) and `global` (`app.component()` in the `app` setup) insert only the tag.
- `tagCase` controls the emitted tag. Existing tags resolve to their definitions in either casing.
- Override keys are a component name, or `<source id>:<name>` to target one source. Source ids default to the library name or a slug of the label.
- Metadata is extracted with `vue-component-meta` through the project's `tsconfig.json`; set `meta: false` in an override to skip it.

Vue support owns the `@vitejs/plugin-vue` integration. Do not register a second Vue plugin in the application. Pass normal plugin-vue options to `vue()`, for example `vue({ template: { compilerOptions: {} } })`.

`@vue-designer/vite` contains framework-neutral discovery, candidate lifecycle, persistence, API security, and preview isolation. `@vue-designer/vue` contains Vue SFC parsing, source and style mutation, instrumentation, preview mounting, component metadata, AI language behavior, and compiler integration.

## Development

```sh
pnpm install
pnpm dev
```

Open `http://localhost:5173/__designer/` to use the designer. The example application is available at the root URL.

## Current Capabilities

- Discovers configured documents in project directories
- Opens and edits SFC source
- Uses revision-checked, atomic file writes
- Renders saved documents in a sandboxed iframe
- Reports external file changes and Vite compilation errors

- Supports visual tree manipulation, component controls, scoped style editing, transient candidates, and unified undo/redo

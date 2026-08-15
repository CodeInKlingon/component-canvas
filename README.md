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
      components: './src/designer-components.ts',
    }),
  ],
})
```

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

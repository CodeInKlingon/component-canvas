# Vue Designer

A web-based visual editor for live Vue components. Vue single-file components remain the source of truth and are rendered through the host project's Vite pipeline.

## Development

```sh
pnpm install
pnpm dev
```

Open `http://localhost:5173/__designer/` to use the designer. The example application is available at the root URL.

## Current vertical slice

- Discovers Vue documents in configured project directories
- Opens and edits SFC source
- Uses revision-checked, atomic file writes
- Renders saved documents in a sandboxed iframe
- Reports external file changes and Vite compilation errors

Visual tree manipulation, component controls, and transient preview updates are the next milestones.

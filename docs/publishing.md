# Publishing

How to release the `@component-canvas/*` packages to the public npm registry.

The workspace is a set of interdependent packages that must be versioned and
published together. This guide covers prerequisites, the release checklist,
publish order, and how to verify without touching the registry.

## Packages

| Package | Directory | Contents |
| --- | --- | --- |
| `@component-canvas/shared` | `packages/shared` | Framework-neutral document model, protocol types, validation |
| `@component-canvas/designer` | `packages/designer` | Editor UI, shipped as raw `src` (compiled by the host) |
| `@component-canvas/vue` | `packages/vue` | Vue SFC adapter (parsing, mutation, preview, metadata) |
| `@component-canvas/vite` | `packages/vite-plugin` | Vite plugin (discovery, persistence, preview isolation) |

`examples/basic` and the workspace root are private and are never published.

## Prerequisites

- Membership in the **`@component-canvas` npm org** with publish rights.
- Node and pnpm matching the workspace (`packageManager: pnpm@10.12.4`); use
  `corepack enable` if needed.
- An authenticated registry session: `pnpm login` (or `npm login`). If the org
  requires 2FA, pass `--otp <code>` to the publish commands.

## Versioning

All four packages are released in **lockstep** at the same version (currently
`0.1.0`). They reference each other with the `workspace:*` protocol, which
`pnpm publish` rewrites to the concrete version in the published manifest. Do
**not** use `npm publish` — it would ship the literal `workspace:*` specifier
and every consumer install would fail.

To bump for a release, set the version in all four package manifests to the same
value with the version-bump script:

```sh
pnpm version:bump 0.2.0          # explicit version
pnpm version:bump minor          # or major | minor | patch | prepatch | ... 
pnpm version:bump patch --dry-run
```

The script refuses to run if the packages are already out of sync, validates the
target as semver, and preserves the manifests' formatting. It only touches the
four publishable packages; the example package and the workspace root stay
private and keep their own versions.

After bumping, refresh the lockfile with `pnpm install` and commit before
publishing.

`pnpm publish` refuses to run when the git working tree is dirty or the branch
is behind its remote. Commit or push first. Use `--no-git-checks` only when you
deliberately need to bypass those checks.

## Release checklist

1. **Dependencies and lockfile are current.**

   ```sh
   pnpm install
   ```

2. **All checks pass.** This is the same gate as any other change:

   ```sh
   pnpm typecheck
   pnpm test
   pnpm build
   ```

   `pnpm test` includes `test:exports`, which imports the built `vite`/`vue`
   entries and asserts the shared package's public surface.

3. **Build the packages.** Each publishable package also builds via its
   `prepublishOnly` script, but building explicitly surfaces errors early:

   ```sh
   pnpm build:packages
   ```

4. **Inspect what will ship.** `files` pins the tarball contents:

   ```sh
   pnpm --filter @component-canvas/vite publish --dry-run --no-git-checks
   ```

   Expect `dist/**` (+ `package.json`) for `shared`/`vue`/`vite`, and `src/**`
   without tests for `designer`. The dry run also confirms the dependency
   versions are rewritten and `public access` is used.

## Publishing

### Recommended: publish everything in one ordered pass

pnpm publishes in topological order, so dependencies land first:

```sh
pnpm -r publish --access public
```

A version can only be published once; if a package at that version already
exists on the registry, bump all four packages to a new version before
republishing. Use `--no-git-checks` if the repository state legitimately blocks
the check.

### Explicit order (first release)

```sh
pnpm --filter @component-canvas/shared  publish --access public
pnpm --filter @component-canvas/designer publish --access public
pnpm --filter @component-canvas/vue     publish --access public
pnpm --filter @component-canvas/vite    publish --access public
```

`designer` must precede `vite`, which depends on it. `vue` only depends on
`shared`, but publishing it after `designer` keeps the sequence stable.

`publishConfig.access` is set to `public` in each manifest, so the explicit
`--access public` is belt-and-suspenders; keep it for first publishes of any new
scoped package.

## What gets published

- `files` is authoritative: `dist` for the built packages, `src` (minus
  `**/*.test.ts`) for `designer`. The `designer` UI is consumed as raw source
  and compiled by the host project's Vite pipeline.
- `@cursor/sdk` is an **optional peer dependency**. Consumers who do not use the
  `ai` option neither install nor load it; the SDK is imported lazily only when
  AI editing runs.
- Internal protocol identifiers (the `vue-designer` postMessage channel,
  `data-vue-designer-*` attributes, and virtual module ids) are deliberately not
  renamed and are not part of the public package surface.

## After publishing

Verify the registry state and that a clean consumer can resolve the packages:

```sh
npm view @component-canvas/vite version
npm view @component-canvas/vue version
```

Consumer usage matches the README:

```ts
import { defineConfig } from 'vite'
import designer from '@component-canvas/vite'
import vue from '@component-canvas/vue'

export default defineConfig({
  plugins: [
    designer({
      framework: vue(),
      documents: 'src/pages/**/*.vue',
      app: './src/designer-app.ts',
    }),
  ],
})
```

To exercise the whole flow **without publishing**, pack the tarballs and install
them into a throwaway project:

```sh
pnpm --filter @component-canvas/vite --filter @component-canvas/vue \
  --filter @component-canvas/shared --filter @component-canvas/designer \
  pack --pack-destination ./vd-tarballs

# in another project
npm install ./vd-tarballs/component-canvas-vite-*.tgz \
  ./vd-tarballs/component-canvas-vue-*.tgz \
  ./vd-tarballs/component-canvas-shared-*.tgz \
  ./vd-tarballs/component-canvas-designer-*.tgz \
  typescript
```

## Known gaps before going public

- No per-package `README.md` or `LICENSE` yet; npm prints warnings for both.
  The root `README.md` is not included in package tarballs.
- The README's `ai: {}` example should note that AI editing requires installing
  the optional `@cursor/sdk`.
- The plugin resolves the editor entry via
  `require.resolve('@component-canvas/designer/src/main.ts')`. If the `designer`
  package ever gains an `exports` map, it must expose `./src/main.ts` or the
  plugin will fail to load.

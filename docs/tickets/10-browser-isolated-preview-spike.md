# 10: Browser-Isolated Preview Spike

**Status:** Planned

## User Outcome

Potentially untrusted project build code runs inside the browser rather than the developer's host Node process, while Vue documents still render with representative project configuration.

## Scope

- Prototype an isolated preview using [AlmostNode](https://almostnode.dev/).
- Run the runtime on a dedicated cross-origin sandbox with no editor credentials.
- Copy only allowlisted project files into an in-memory virtual filesystem.
- Compile and render Vue 3 SFCs through AlmostNode's browser-side Vite server.
- Evaluate `@vitejs/plugin-vue`, aliases, CSS, assets, dynamic imports, app setup, and the component registry.
- Apply transient source candidates through the virtual filesystem and evaluate HMR behavior.
- Keep persistent writes behind the existing path- and revision-checked local plugin API.
- Deny network access by default and document the capability required for package installation.
- Add worker termination, startup timeout, project-size limits, and crash recovery to the prototype.
- Compare compatibility, startup time, rebuild latency, memory use, and bundle size with the current preview.
- Document a go/no-go decision and any fallback to WebContainers or the current local Vite preview.

## Out Of Scope

- Replacing the current preview before the spike meets its acceptance criteria.
- Full compatibility with native Node addons, subprocesses, or every Vite plugin.
- Mounting the user's real project directory inside the browser runtime.
- Persisting npm credentials, environment secrets, or editor API capabilities in the sandbox.

## Acceptance Criteria

- The example Vue application renders entirely through the browser-side runtime.
- Vue SFC template, TypeScript, and scoped CSS changes update the preview.
- Representative aliases, registered components, app setup, and at least one custom Vite transform work or have documented incompatibilities.
- Malicious preview code cannot access the editor DOM, storage, API capability, or files outside the transferred snapshot.
- The sandbox cannot write to the local project without a validated editor save request.
- The runtime can be terminated and recreated without losing editor source or history.
- Startup and update performance are measured against explicit representative project sizes.
- AlmostNode's experimental status, MIT license, browser support, and unsupported Node APIs are documented.
- The spike concludes with a written adoption decision and migration outline if adopted.

## Verification

- Browser-test Vue SFC compilation, transient edits, HMR, crash recovery, and cold restart.
- Test aliases, CSS, assets, dynamic imports, component metadata, and custom Vite transforms.
- Attempt filesystem escape, editor API access, cross-origin storage access, navigation, and unauthorized network requests.
- Test infinite loops, excessive output, oversized snapshots, and runtime termination.
- Record cold start, warm start, source update latency, memory use, and transferred dependency size.

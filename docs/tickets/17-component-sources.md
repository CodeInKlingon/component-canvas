# 17: Component Sources

**Status:** Complete

## User Outcome

A user configures palette components inline in `vite.config.ts` from local globs and external Vue component libraries, and inserted components use each library's tag casing and import convention without hand-written registry entries.

## Scope

- Replace the registry module path with an inline, typed `components` option interpreted by the framework adapter.
- Discover local components from globs, deriving PascalCase names, labels, and categories from file paths.
- Discover library components from package types, either from a barrel's component exports or from an explicit list with per-component modules.
- Support `pascal` and `kebab` tag casing and `explicit`, `auto`, and `global` import modes, cascading from global defaults to each source.
- Allow optional per-component overrides for labels, categories, default content, prop controls, hiding, and metadata opt-out.
- Load props, events, and slots on demand and refresh the palette when component files are added or removed.

## Acceptance Criteria

- Local components appear in the palette without per-component configuration.
- Library component exports are discovered from type declarations; non-component exports are excluded.
- Explicit imports use default, named, or aliased forms and reuse existing matching imports from `<script>` or `<script setup>`.
- An import whose local name is already bound to a different module is rejected rather than rewritten.
- Auto-imported and globally registered components insert only the tag.
- Selecting a component tag in either casing shows its props inspector.
- New or removed component files update the palette without reloading the designer.

## Verification

- Discovery tests cover glob naming, namespaces, overrides, barrel discovery, explicit lists, and validation errors against a fixture project.
- Mutation tests cover kebab tags, named and aliased imports, import reuse, conflicts, and script language inheritance.
- Browser-tested in `examples/basic` with project components and a globally registered kebab-case component.

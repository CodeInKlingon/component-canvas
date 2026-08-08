# 09: MVP Hardening

**Status:** Planned

## User Outcome

An existing Chromium/Vite/Vue project can adopt the plugin and reliably complete the core visual-authoring workflow.

## Scope

- Plugin configuration validation and actionable startup errors.
- Path traversal, real-path root, and symlink escape protection.
- Cross-platform atomic writes and recovery cleanup.
- Representative supported and unsupported Vue fixture suite.
- End-to-end coverage of insert, configure, style, move, save, reload, and external conflict.
- Setup and component metadata documentation.

## Acceptance Criteria

- MVP acceptance criteria in `AGENTS.md` are covered or explicitly documented as limitations.
- Windows, macOS, and Linux CI pass supported workflows.
- No operation silently drops unsupported source.
- A new example project can install and configure the plugin from documentation.

## Verification

- Full unit, integration, and Playwright suites.
- Manual smoke test against a second representative Vite Vue application.

# 08: Preview Diagnostics And Isolation

**Status:** Planned

## User Outcome

Component failures produce actionable diagnostics without crashing the editor or granting preview code access to project files.

## Scope

- Dedicated preview origin/port.
- Restrictive CSP and script-only iframe sandbox.
- Short-lived editor/API capabilities.
- Schema and session validation for every message.
- Compiler, runtime, console, and HMR diagnostics.
- Preview crash recovery and controlled reload.
- Remove opaque-origin HMR console warnings.

## Acceptance Criteria

- Runtime and compiler failures appear with document locations where available.
- Preview crashes do not reset editor state.
- Preview requests to filesystem APIs fail without valid capabilities.
- Cross-session and malformed messages are ignored.
- Normal preview use has no unexplained console errors.

## Verification

- Protocol and token lifecycle tests.
- Adversarial browser tests for API access, navigation, storage, malformed messages, and preview crashes.

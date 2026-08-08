# 02: Live Text And Attributes

**Status:** Complete

**Completed:** 2026-08-08

## User Outcome

A user changes text, static attributes, or literal bindings and immediately sees the result without writing invalid Vue source.

## Scope

- Minimal source operations for text, static attributes, and literal bindings.
- Parse-edit-parse validation and deterministic diagnostics.
- Transient preview source that does not touch disk.
- Explicit save and revision conflict handling.
- Reconcile selection after source changes.

## Acceptance Criteria

- Supported changes update source and preview immediately.
- Invalid operations are rejected without changing the document.
- Complex expressions remain locked and unchanged.
- Save persists exactly the previewed candidate source.
- Reload restores the saved result.

## Verification

- Source-range mutation and round-trip fixture tests.
- Browser test editing hero text and a static component prop, then saving and reloading.

## Completion Notes

- The reusable right panel now has Content and Source views for later prop and style controls.
- Text, static attributes, and literal bindings use minimal source-range replacements.
- Arbitrary expressions remain visible and disabled.
- Valid unsaved source is parsed and rendered as a transient Vite Vue module without touching disk.
- Browser verification changed hero text and the button tone in transient preview.
- Browser verification saved the button tone, confirmed the disk source, reloaded it, and restored the fixture.

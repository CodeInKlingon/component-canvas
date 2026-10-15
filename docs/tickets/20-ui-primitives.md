# 20: UI Primitives

**Status:** Complete

**Completed:** 2026-10-14

## User Outcome

The designer's repeated UI patterns (buttons, button groups, dialogs, menus, form fields, notices, empty states, badges, and headings) are shared components with props that cover every existing use. New UI composes these primitives instead of copying CSS, so the editor and landing screens look and behave consistently.

## Scope

- Design tokens in `packages/designer/src/styles.css` for colors, radii, shadows, control heights, and caption type that were previously hard-coded.
- `Ui*` primitives in `packages/designer/src/components/ui/` with scoped styles that use tokens only.
- Small domain components (read-only badge, palette item, node kind icon, selection summary, insert picker, AI prompt, node context menu) built from the primitives.
- Dialogs own their backdrop, labelling, initial focus, and Escape/backdrop close. Escape inside a dialog closes only that dialog.
- The context menu owns viewport clamping and outside-click close.
- Drifted variants converge: every primary action uses one primary button style, icon buttons share one size, captions share one type style.

## Notes

- Primitive styles live in `@layer ui` and the global resets in `@layer base`. Unlayered page CSS in `styles.css` always wins, so screens can adjust a control's spacing or width with a plain class. `main.ts` imports `styles.css` before any component so the layer order is declared first.
- Deliberate convergence: the AI Apply button uses the standard primary style; dialog close buttons use an icon instead of a `×` glyph; selects share one chevron style; captions are 12px; tree and selection-summary kind markers use the same icons; color props get a swatch plus text field like color styles.

## Out Of Scope

- Dark theme values (tokens make this a later change).
- Splitting `EditorScreen.vue` into topbar, inspector, and canvas components.

## Acceptance Criteria

- [x] No primary, secondary, ghost, or icon button style is defined outside `UiButton`.
- [x] The insert picker, AI prompt, and New design dialogs use `UiDialog`; Escape and backdrop clicks close them.
- [x] The node context menu uses `UiMenu` and stays inside the viewport.
- [x] Inspector, style, AI, and new-design form controls use the shared field and input components.
- [x] Notices, empty states, and badges use shared components.
- [x] `styles.css` has no rules for selectors that no longer appear in the designer.
- [x] Landing and editor workflows behave as before at desktop, 1120px, and 960px widths, and in the read-only build.

## Verification

- `packages/designer/src/lib/menu-position.test.ts`: context-menu viewport clamping.
- `pnpm test`, `pnpm typecheck`, and `pnpm build` pass.
- Browser verification against `examples/basic` on 2026-10-14: landing search and New design dialog (validation, Escape, backdrop close, autofocus); editor style, color, and prop edits with candidate preview, undo, and redo; insert picker and context menu; AI dialog; panel collapse; viewport and zoom controls; 1100px and 900px widths; and the read-only build via `vite preview`.

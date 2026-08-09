# MVP Vertical Slices

These tickets are ordered by dependency. Each slice must leave the designer in a demonstrably more useful state and include tests for the behavior it introduces.

| Ticket | Slice | Outcome |
| --- | --- | --- |
| [01](01-selectable-document-tree.md) | Selectable document tree (complete) | Users can inspect and select editable or locked Vue nodes |
| [02](02-live-text-and-attributes.md) | Live text and attributes (complete) | Users can edit simple content and preview it before saving |
| [03](03-component-palette-and-insertion.md) | Component palette and insertion (complete) | Registered components can be inserted from a palette |
| [04](04-structure-and-slots.md) | Structure and slots (complete) | Users can move, reorder, duplicate, and remove nodes safely |
| [05](05-props-inspector.md) | Props inspector (complete) | Component props can be configured with metadata-driven controls |
| [06](06-visual-styles.md) | Visual styles (complete) | Common CSS can be changed without editing source directly |
| [07](07-history-source-and-file-sync.md) | History and file sync | Visual/source edits share undo history and handle external changes |
| [08](08-preview-diagnostics-and-isolation.md) | Preview isolation | Preview failures are visible and untrusted code is strongly isolated |
| [09](09-mvp-hardening.md) | MVP hardening | Core workflows are covered by integration and adversarial tests |

## Working Agreement

- Complete tickets in order unless a ticket uncovers a prerequisite.
- Keep the Vue SFC authoritative.
- Apply minimal source-range edits and reparse after every mutation.
- Never rewrite unsupported syntax merely to make it editable.
- Mark acceptance criteria only after automated or browser verification.

# 03a: Native Browser Elements

**Status:** Complete

**Completed:** 2026-08-09

## User Outcome

A user can insert common native HTML elements from the component palette and configure their standard content and attributes without writing source manually.

## Scope

- Add a Native category to the component palette.
- Provide an intentionally curated MVP set rather than every HTML tag.
- Include structural elements such as `div`, `section`, `main`, `header`, `footer`, `nav`, and `article`.
- Include text elements such as `p`, `span`, `h1` through `h6`, `strong`, and `a`.
- Include form elements such as `button`, `input`, `label`, `textarea`, `select`, and `option`.
- Include media and list elements such as `img`, `ul`, `ol`, and `li`.
- Generate sensible default content or child templates for each element.
- Distinguish normal, raw-text, and void elements when generating source.
- Reuse the existing click and tree drag/drop insertion workflow.
- Expose useful standard attributes in the Content inspector.
- Preserve arbitrary attributes already present in source.

## Source Rules

- Generate valid Vue template syntax rather than browser-normalized DOM syntax.
- Void elements such as `input` and `img` must not receive children or closing tags.
- Prevent drops inside void elements.
- Generate `for` as a normal label attribute and preserve Vue-specific bindings when already present.
- Use static attributes by default; only generate literal bindings when the value requires a non-string type.
- Do not add imports for native elements.
- Apply the same minimal source-edit and parse-edit-parse validation used for registered components.

## Native Metadata

Each palette definition should provide:

- Tag name and display label.
- Category.
- Whether children are allowed.
- Default text or child template.
- Common attribute definitions and control types.
- Optional allowed-parent or content-model guidance where it materially prevents invalid markup.

The initial metadata can be maintained locally. It should not require runtime network access.

## Acceptance Criteria

- A `section` can be inserted into an editable container and appears in source, tree, and transient preview.
- A heading and paragraph can be inserted with editable default text.
- An `input` is generated as a void element and rejects child drops.
- An `img` exposes at least `src`, `alt`, `width`, and `height` controls.
- An anchor exposes at least `href`, `target`, and `rel` controls.
- Boolean attributes such as `disabled`, `required`, and `checked` use checkbox controls and valid Vue bindings.
- Native insertion never adds a script import.
- Locked structural regions reject native insertion.
- Saving and reloading preserves the generated HTML source.

## Verification

- Unit-test normal and void-element source generation.
- Unit-test default children and attribute serialization.
- Unit-test rejection of child insertion into void elements.
- Browser-test inserting and editing a section, heading, link, input, and image.
- Browser-test dragging a native element onto a valid tree target and saving the document.

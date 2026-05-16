# Annotation UI CSS scoping

Annotation UI styles are scoped so they do not affect host page chrome (headers, unrelated buttons, range inputs, etc.).

## Scope class

Use **`osd-paperjs-annotation`** (`ANNOTATION_UI_SCOPE_CLASS` in the package export) on an **ancestor** of any DOM that should receive library UI styles.

Do not rely on the scope class being on the same element as structural classes such as `annotation-ui-grid` — PostCSS prefixes rules as descendants (`.osd-paperjs-annotation .annotation-ui-grid`).

## Two responsibilities

| Mount | Who adds the scope class |
|-------|-------------------------|
| **Viewer subtree** (grid, OpenSeadragon, Paper overlay canvas) | `AnnotationToolkit` adds it to `viewer.element` on construction and removes it on `destroy()` |
| **External UI** (toolbar/layer/tool dropdown mounted outside the viewer) | Embedder wraps each mount container with `osd-paperjs-annotation` |

### Default layout

`addAnnotationUI()` / `addAnnotationLayout()` place toolbar and layer UI inside `annotation-ui-grid` under `viewer.element`, which already has the scope class — no extra setup.

### Custom placement

```js
const tk = new AnnotationToolkit(viewer, { addUI: false });
tk.getToolbar({ tools });
tk.getLayerUI({ addFileButton: true });
document.getElementById('my-toolbar').appendChild(tk.getToolbarElement());
document.getElementById('my-layers').appendChild(tk.getLayerUIElement());
```

HTML:

```html
<div id="my-toolbar" class="osd-paperjs-annotation"></div>
<div id="my-layers" class="osd-paperjs-annotation"></div>
```

Use `getToolbarElement()` / `getLayerUIElement()` — do not query by internal CSS classes.

### Headless tool outlets

Wrap the outlet (or a parent) with `osd-paperjs-annotation` before moving `tool.getToolbarControl().dropdown` into it. See `demo/headless-ruler-ui.mjs`.

## Stylesheet sources

- **Edit:** [`src/css/annotationui.unscoped.css`](../src/css/annotationui.unscoped.css)
- **Generated:** [`src/css/annotationui.css`](../src/css/annotationui.css) via `npm run scope-css`
- **Webpack bundle:** same scoped rules, injected with `data-osd-paperjs-annotation` on `<style>` tags
- **ES modules:** `addCSS()` loads scoped `annotationui.css` with `data-osd-paperjs-annotation` on the `<link>`

`editablecontent.css` is already mostly under `.editablecontent`. The configuration widget uses inline `.config-dialog` styles.

## Intentional global rule

`body.annotation-ui-noselect` is applied during layer-panel resize and is **not** scoped under `.osd-paperjs-annotation`.

## Embedder checklist

1. Create an `AnnotationToolkit` (scope is applied to `viewer.element` automatically).
2. For UI mounted **outside** the viewer, wrap each mount point with `osd-paperjs-annotation`.
3. Remove host-specific CSS overrides that undid global `.btn` / `input[type=range]` rules from older library versions.

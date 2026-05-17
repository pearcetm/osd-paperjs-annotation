# Annotation UI CSS scoping

Annotation UI styles are scoped so they do not affect host page chrome (headers, unrelated buttons, range inputs, etc.).

## Scope class

Use **`osd-paperjs-annotation`** (`ANNOTATION_UI_SCOPE_CLASS` in the package export) on an **ancestor** of any DOM that should receive library UI styles.

Do not rely on the scope class being on the same element as structural classes such as `annotation-ui-grid` — PostCSS prefixes rules as descendants (`.osd-paperjs-annotation .annotation-ui-grid`).

## Stylesheet loading

Scoped UI styles load when you create toolbar or layer UI via **`getToolbar()`** or **`getLayerUI()`** (including via `addAnnotationLayout()`, constructor `toolbar` / `layerUI` / `layout`, or deprecated `addAnnotationUI()`). You do not need to call `addAnnotationUI()` or add `<link>` tags manually for those paths.

Headless integrations that mount tool dropdown markup outside official UI roots should call **`ensureAnnotationUIStyles()`** (exported from the package) before using library CSS classes in custom DOM.

On **native ESM**, official toolbar and layer UI scope roots are hidden (`visibility: hidden`) until both `annotationui.css` and `editablecontent.css` have loaded, so unstyled markup does not flash on screen. The OpenSeadragon viewer remains visible. Use **`annotationUIStylesReady()`** if custom code must run after styles are applied (optional for most apps).

## Scope responsibilities

| Mount | Who adds the scope class |
|-------|-------------------------|
| **Viewer subtree** (grid, OpenSeadragon, Paper overlay canvas) | `AnnotationToolkit` adds it to `viewer.element` on construction and removes it on `destroy()` |
| **Official toolbar / layer UI** (`.element` from `getToolbar()` / `getLayerUI()`) | Built-in scope wrapper on the returned root node |
| **Custom / headless DOM** (e.g. tool dropdown outlet) | Embedder wraps the outlet (or a parent) with `osd-paperjs-annotation` |

### Default layout

`addAnnotationLayout()` places toolbar and layer UI inside `annotation-ui-grid` under `viewer.element`, which already has the scope class. Toolbar and layer roots also include an internal scope wrapper.

### Custom placement

```js
const tk = new AnnotationToolkit(viewer, { addUI: false });
tk.getToolbar({ tools });
tk.getLayerUI({ addFileButton: true });
document.getElementById('my-toolbar').appendChild(tk.getToolbarElement());
document.getElementById('my-layers').appendChild(tk.getLayerUIElement());
```

Mount containers do **not** need `osd-paperjs-annotation` when appending the official `.element` nodes from `getToolbarElement()` / `getLayerUIElement()`.

Use `getToolbarElement()` / `getLayerUIElement()` — do not query by internal CSS classes.

### Headless tool outlets

Wrap the outlet (or a parent) with `osd-paperjs-annotation` before moving `tool.getToolbarControl().dropdown` into it. Call `ensureAnnotationUIStyles()` if the outlet uses library markup. See `demo/headless-ruler-ui.mjs`.

## Stylesheet sources

- **Edit:** [`src/css/annotationui.unscoped.css`](../src/css/annotationui.unscoped.css)
- **Generated:** [`src/css/annotationui.css`](../src/css/annotationui.css) via `npm run scope-css`
- **Webpack bundle:** same scoped rules, injected with `data-osd-paperjs-annotation` on `<style>` tags
- **ES modules:** `ensureAnnotationUIStyles()` / `addCSS()` loads scoped CSS with `data-osd-paperjs-annotation` on `<link>` tags. Do not import `importcss.mjs` in application code (webpack-only; browsers cannot load `.css` as modules).

`editablecontent.css` is loaded together with annotation UI styles. The configuration widget uses inline `.config-dialog` styles.

## Intentional global rule

`body.annotation-ui-noselect` is applied during layer-panel resize and is **not** scoped under `.osd-paperjs-annotation`.

## Embedder checklist

1. Create an `AnnotationToolkit` (scope is applied to `viewer.element` automatically).
2. Use `getToolbar()` / `getLayerUI()` (or layout APIs) — styles and scope wrappers are applied automatically.
3. For custom DOM outside official UI roots, wrap with `osd-paperjs-annotation` and call `ensureAnnotationUIStyles()` when needed.
4. Remove host-specific CSS overrides that undid global `.btn` / `input[type=range]` rules from older library versions.

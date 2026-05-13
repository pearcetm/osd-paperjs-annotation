# Annotations and the configuration widget

This folder holds **viewer integration** code that connects the annotation UI to the gear **Configuration** dialog. It is **not** a `ViewerOverlayBase` or `PaperOverlay` overlay in the same sense as screenshot or field-of-view.

## Prerequisites

- Construct `AnnotationToolkit` and call **`addAnnotationUI(...)`** so the pencil and (optionally) save/load toolbar buttons exist.
- Use a **`ConfigurationWidget`** instance bound to the **same** `OpenSeadragon.Viewer` as the toolkit.

## Recommended API

Call **`annotationToolkit.registerWithConfigurationWidget(configurationWidget)`** after both objects exist.

- Adds an **Annotations** section to the config dialog (via the widget’s generic **`addSection`** only).
- **Idempotent** when called again with the same widget.
- **`annotationToolkit.destroy()`** removes the section from the widget when possible.

## Advanced: attach without toolkit lifecycle

```js
import { attachAnnotationToolkitConfigurationWidget } from './overlays/annotations/index.mjs';

const root = attachAnnotationToolkitConfigurationWidget(toolkit, configWidget);
// You must call configWidget.removeSection(root) (or destroy the widget) when done;
// destroy() on the toolkit will not know about this unless you used registerWithConfigurationWidget.
```

## Section behavior

- **Show Button** column: toggles visibility of the pencil and save/load buttons in the OpenSeadragon toolbar (same idea as overlay rows).
- **Annotation interface** row **Open** / **Close**: same as the pencil control (toolbar / layer visibility per your `addAnnotationUI` options).
- **Save / load** row **Open**: opens the file dialog and closes the configuration dialog.

## Toolbar persistence

If the **`ConfigurationWidget`** was constructed with **`{ storageKey: '…' }`**, the **Show Button** toggles for the pencil and save/load rows are read from and written to the same JSON document as other overlays (keys **`annotation:pencil`** and **`annotation:file`**, exported as **`ANNOTATION_TOOLBAR_PERSIST_ID_PENCIL`** and **`ANNOTATION_TOOLBAR_PERSIST_ID_FILE`** from [`../configuration/configuration.mjs`](../configuration/configuration.mjs)). When a key has no stored value yet, the row follows the real toolbar visibility from the DOM (your `addAnnotationUI` options). Stored values override that on load.

## Bundle / namespace

When using the packaged build, **`attachAnnotationToolkitConfigurationWidget`** is also exposed on the **`OSDPaperjsAnnotation`** namespace alongside other exports.

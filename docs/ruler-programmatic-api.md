# Ruler programmatic API – analysis and progress

This document tracks the design and implementation of a programmatic API for the ruler (measurement) tool so that apps can use it without the full annotation toolbar—e.g. when the only goal is to measure on an image with known physical scale.

---

## Use case

When viewing an image with known physical scale (e.g. 0.25 µm/pixel), the app may add the annotation toolkit **only** for the ruler. The full toolbar is often not available; the app has **units** and **unitsPerPixel** in code (or from image metadata) and needs to:

1. Configure the ruler with those values programmatically.
2. Activate the ruler from an external control (e.g. a "Measure" button).
3. Have the first click start a measurement (no layer/toolbar UI to create a "new" item).

---

## Current architecture (relevant parts)

- **AnnotationToolkit** is created with `opts.addUI: true/false`. Only when `addUI: true` does `addAnnotationUI()` run, which creates **AnnotationUI** (toolbar, layer UI, file button).
- **AnnotationToolbar** is created inside AnnotationUI. It constructs tool instances (e.g. `new RulerTool(paperScope)`), stores them in `this.tools`, adds buttons to the DOM, and sets `paperScope.tool` to the active tool. There is **no public API** to get a tool reference; the only path is `toolkit.annotationUI._toolbar.tools.ruler` (internal).
- **RulerTool** gets units/scale from **RulerToolbar**: `this.toolbarControl.labelUnit`, `this.toolbarControl.unitsPerPixel`. Labels are formatted via `this.toolbarControl.formatDistance(distance)`. So with no toolbar, the tool has no units/scale and no way to be activated.
- **itemToCreate**: The ruler needs a selected **Placeholder** (from `findSelectedNewItem()`). Placeholders are normally created by the **Layer UI** when the user clicks "new feature" in a feature collection. So with no layer UI, there is no placeholder and the first click in `_ensureItemForDrawing()` finds no `itemToCreate`, so no measurement is created.

So for the use case we need: (1) a way to get/create tools without the full UI; (2) tool-owned units/unitsPerPixel and a way to set them; (3) a way to ensure a placeholder exists and is selected so the ruler can create a measurement on first click.

---

## Configuration analysis: adding tools when addUI is false

**Question:** Does the toolkit already have a configuration option that adds one or more tools when `addUI` is false?

**Findings:**

- **AnnotationToolkit constructor** ([annotationtoolkit.mjs](src/js/annotationtoolkit.mjs)) only merges these options from `opts`: `addUI`, `overlay`, `destroyOnViewerClose`, `cacheAnnotations`. There is no `tools` (or similar) option at the toolkit constructor level.
- **When `addUI` is false:** The constructor never calls `addAnnotationUI()`. The only block that creates UI or tools is `if (this.options.addUI) { ... this.addAnnotationUI(uiOpts); }`. So with `addUI: false`, no toolbar and no tools are created.
- **When `addUI` is true:** The constructor calls `addAnnotationUI(uiOpts)`. If `opts.addUI` is an object (e.g. `{ autoOpen: true, tools: ['default', 'ruler'] }`), that object is passed as `uiOpts` to `addAnnotationUI`. So the **tools** list is an option of **AnnotationUI**, not of the toolkit when used without UI.
- **Where tools are created:** Only inside **AnnotationUI** ([annotationui.mjs](src/js/annotationui.mjs)): when `opts.addToolbar` is true, it does `this._toolbar = new AnnotationToolbar(annotationToolkit.overlay.paperScope, opts.tools)`. **AnnotationToolbar** then instantiates each tool and stores it in `this.tools`. There is no other code path that creates an AnnotationToolbar or tool instances.

**Conclusion:** There is **no** existing configuration option that adds tools when `addUI` is false. Tools are created only when the full UI is added and the toolbar is created. To support headless use we need a **new** path: e.g. a method such as `toolkit.addTools(toolNames)` that creates an AnnotationToolbar (or equivalent) without attaching it to the DOM, and stores it on the toolkit for later use by `getTool(name)`.

---

## Can tools live without the toolbar?

**Question:** Can tools be attached to the project directly when `addUI` is false, without using the toolbar at all? Is the toolbar mandatory, and if so, why?

**Findings:**

1. **What the toolbar does (AnnotationToolbar constructor)**  
   - Creates **toolLayer**: a `paper.Layer` named `'toolLayer'`, added to `paperScope.project`. This is the **only** place in the codebase that creates this layer ([annotationtoolbar.mjs](src/js/annotationtoolbar.mjs) lines 91–96).  
   - Calls `paperScope.activate()`, then instantiates each tool with `new toolConstructor(this.paperScope)` and stores them in `this.tools`.  
   - Activates the default tool (`this.tools.default.activate()`).  
   - Subscribes to **project events** (`item-replaced`, `item-selected`, `item-deselected`, etc.) and calls `setMode()` so the active tool can be switched (e.g. deactivate ruler when selection is not supported).  
   - Adds a **deactivated** listener on each tool so that when a tool turns off, the default tool is activated.  
   - Builds the toolbar **DOM** (`this.ui`) and adds each tool’s button via `addToolbarControl(toolbarControl)`.

2. **What a tool needs (ToolBase / RulerTool)**  
   - A **paperScope** (the toolkit’s overlay already provides one; `paperScope.overlay` is set in [paper-overlay.mjs](src/js/paper-overlay.mjs)).  
   - **this.project** is built in the tool constructor: `toolLayer: paperScope.project.layers.toolLayer || paperScope.project.activeLayer`, plus `getZoom`, `paperScope`, `overlay` ([base.mjs](src/js/papertools/base.mjs) lines 62–68). So the tool **resolves** `toolLayer` by name; it does not depend on the toolbar object.  
   - Tools put transient UI (cursor, preview, crosshair) on `this.project.toolLayer` (e.g. [ruler.mjs](src/js/papertools/ruler.mjs) adds `drawingGroup` and `_crosshair` to `this.project.toolLayer`).  
   - **Activation** is just `this.tool.activate()` (Paper.js’s Tool). The project does not have a special “tool registry”; the scope has a single active `paperScope.tool`.

3. **Is the toolbar mandatory?**  
   - **No.** The toolbar is the **factory and UI**: it creates the toolLayer, creates tool instances, wires project events and deactivation, and provides the button bar. None of that requires the toolbar’s **DOM** to be in the document.  
   - **toolLayer** is required for correct behavior: if it doesn’t exist, tools fall back to `paperScope.project.activeLayer`, so cursors/previews could end up on the wrong layer. So something must create a layer named `'toolLayer'` (or we accept the fallback).  
   - **Tool instances** only need to be created and then activated; they do not need to be “registered” with the toolbar. The toolbar is simply the place that currently holds references to them (`this.tools`) and reacts to selection (`setMode`).

4. **Implications for the API**  
   - **Option A – Tools attached “directly” (no toolbar object):** The toolkit would create a **toolLayer** (if missing), instantiate the requested tools (it would need the same constructor map as AnnotationToolbar or a shared module), activate the default tool, and store the tool instances (e.g. in `this._tools`). No AnnotationToolbar instance. This duplicates the toolbar’s creation and event logic unless we factor that out.  
   - **Option B – Headless toolbar:** The toolkit creates an **AnnotationToolbar** instance with the requested tool names and stores it (e.g. `this._toolbar`), but **does not** append `toolbar.element` to the DOM. We get toolLayer, tool instances, project event subscriptions, setMode, and deactivation→default behavior for free. The toolbar’s DOM exists but is unused; only the internal state and logic are used.  
   - **Recommendation:** Option B is simpler and avoids duplicating logic. Tools do **not** need to be “attached to the project” in a different way; they already work with the project via the shared paperScope and toolLayer. The toolbar is not mandatory for tools to function; it is just the current **owner** of the code that creates toolLayer and tools. Using a headless toolbar reuses that ownership without showing the UI.

---

## Planned API

### 1. Tool access and creation without toolbar

- **`toolkit.addTools(toolNames)`**  
  If the toolkit does not already have a toolbar (from `addAnnotationUI`), create an **AnnotationToolbar** instance with the given `toolNames` (e.g. `['default', 'ruler']`), but **do not** attach its `.element` to the DOM. Store it on the toolkit (e.g. `this._toolbar`). Activate the default tool.

- **`toolkit.getTool(name)`**  
  Return the tool instance for `name` (e.g. `'ruler'`), whether from the full UI toolbar or from a headless `_toolbar`. Return `null` if not available.

### 2. Ruler configuration (units and scale)

- **Source of truth:** Store **units** and **unitsPerPixel** on **RulerTool** so they work with or without a toolbar.
- **RulerTool:** Add `setUnits(unitString)`, `setUnitsPerPixel(number)`, and getters for `units` and `unitsPerPixel`. Implement `formatDistance(distance)` on the tool. Use these in labels and in `_writeRulerDataToItem()`.
- **RulerToolbar:** When present, sync from tool to inputs on init and from inputs to tool on change.

### 3. Placeholder for new measurements

- **`toolkit.ensureMeasurementPlaceholder()`**  
  Get the first feature-collection group (or create one if none). Create a placeholder with `makePlaceholderItem`, add it to the group, and select it. Then the ruler’s first click can replace it with a RulerMeasurement.

---

## Demo layout

- **First viewer (top):** Headless – toolkit with `addUI: false`, external "Measure" button. Intended scale: 0.25 µm/px. Button will call `ensureMeasurementPlaceholder()` then `getTool('ruler').activate()` once APIs exist.
- **Second viewer (bottom):** Full UI – existing behavior with toolbar and layer UI.

---

## Progress

| Step | Description | Status |
|------|-------------|--------|
| 1 | Create this analysis doc; add headless viewer first and full UI viewer second on demo page; add Measure button (stubbed until APIs exist) | Done |
| 2 | Implement `addTools(toolNames)` and `getTool(name)` on AnnotationToolkit | Pending |
| 3 | Implement units/unitsPerPixel on RulerTool (setters, getters, formatDistance, _writeRulerDataToItem) | Pending |
| 4 | Implement `ensureMeasurementPlaceholder()` on AnnotationToolkit | Pending |
| 5 | Wire demo Measure button to new APIs and verify end-to-end | Pending |

---

## Implementation notes (for later steps)

- **AnnotationToolbar:** Can be instantiated without appending its `.element` to the document; project events (selection, etc.) still fire.
- **RulerToolbar:** Should read/write tool’s units and unitsPerPixel so toolbar and programmatic config stay in sync when both exist.

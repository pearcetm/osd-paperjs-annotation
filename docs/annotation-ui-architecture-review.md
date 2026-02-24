# Annotation UI Architecture – Design Review

This document reviews the architecture of **AnnotationUI**, **AnnotationToolbar**, and **LayerUI** after the toolkit/toolset refactor. The goal is to support **independent use** of the toolbar and the layer UI: the toolkit configuration and API should allow Toolbar only, LayerUI only, both, or neither. It also analyzes what **AnnotationUI** actually does and whether that could be moved so that AnnotationToolbar and LayerUI become direct children of the toolkit.

---

## 1. Current Components and Dependencies

### AnnotationToolbar

- **Constructor:** `(toolset)` – takes an **AnnotationToolset**.
- **Dependencies:** Only the toolset. No reference to the toolkit, LayerUI, or AnnotationUI.
- **Owns:** Its DOM (`_element`, `_buttonbar`, `_dropdowns`). Registers `toolset.onModeChanged` and clears it on destroy.
- **Already independent:** The toolbar can be created and used wherever a toolset exists. It does not depend on LayerUI or AnnotationUI.

### LayerUI

- **Constructor:** `(annotationToolkit, addFileButton)` – takes the **AnnotationToolkit** and a boolean (addFileButton is passed but not used in the constructor body in the current code).
- **Dependencies:** Toolkit (for `paperScope`, `addEmptyFeatureCollectionGroup()`, and project events). No reference to AnnotationToolbar or AnnotationUI.
- **Owns:** Its DOM (feature collections list, opacity sliders, “Add Feature Collection”, drag-and-drop). Listens to `project.on('feature-collection-added')`.
- **Already independent:** LayerUI only needs the toolkit. It does not depend on the toolbar or AnnotationUI.

### AnnotationUI

- **Constructor:** `(annotationToolkit, toolset, opts)` – takes toolkit, toolset, and options.
- **Dependencies:** Toolkit, toolset (when addToolbar), and opts.
- **Creates:** Optionally **AnnotationToolbar**(toolset), **LayerUI**(toolkit, opts.addFileButton), **FileDialog**, viewer buttons (file button, one “annotation” toggle button).
- **Layout:** `_addToViewer()` builds a grid (annotation-ui-grid), puts the viewer in the center, the **toolbar** in the top row, and the **layer UI** in the right column with a resize handle. One button toggles visibility of toolbar and/or layer UI.
- **Problem:** `_addToViewer()` always does `top.appendChild(this._toolbar.element)` and `right.appendChild(this.element)` (layer UI). If `addToolbar` is false, `_toolbar` is null and appending its element throws. So in practice the current code assumes **both** toolbar and layer UI exist when using the grid. True “toolbar only” or “layer UI only” through AnnotationUI would require layout changes.

---

## 2. Logical Dependence: Style Tool and LayerUI

There is a **one-way logical link** from LayerUI (and its children) to the **style tool**:

- **FeatureUI** and **FeatureCollectionUI** (used inside LayerUI) render a “style” action (palette icon) that calls `openStyleEditor()`. That method does `project.emit('edit-style', { item: this.paperItem })` (or `this.group` for collections).
- **StyleTool** (in `papertools/style.mjs`) subscribes to `project.on('edit-style', ev => this.activateForItem(ev.item))`. So when the user clicks the style icon in the layer UI, the style tool activates and focuses on that item.

So:

- The **style button lives in LayerUI’s tree** (FeatureUI / FeatureCollectionUI).
- The **responder is the StyleTool**, which is part of the **toolset** and is exposed as a toolbar button when the toolbar is present.
- **No direct reference** from LayerUI to the toolbar or to the style tool. The contract is event-based: “whoever listens to `edit-style` will handle it.”

**Implications for independence:**

- **LayerUI without AnnotationToolbar:** We can still have a toolset (e.g. headless `addTools(['default', 'style', ...])`). The style tool would still be in the project and would still listen for `edit-style`. So the style button in LayerUI would still work. If we have **no toolset at all** (e.g. toolkit with only LayerUI and no tools), then no one listens for `edit-style` and the emit currently triggers a console warning. **Desired behavior:** When there is no style tool available (e.g. `toolkit.getTool('style') === null`), the style button in the layer UI should be **inactive** (disabled or hidden) so the rest of LayerUI remains fully usable for managing annotations (collections, visibility, opacity, etc.).
- **AnnotationToolbar without LayerUI:** No change; toolbar already has no dependency on LayerUI.

So the only change needed for “LayerUI without toolbar” is: **disable or hide the style action in FeatureUI / FeatureCollectionUI when the style tool is not available** (e.g. when `toolkit.getTool('style')` is null). That keeps LayerUI and the toolbar independent while preserving the style shortcut when both exist.

---

## 3. What AnnotationUI Actually Provides

AnnotationUI is a **composition and layout** layer. It does not implement annotation logic; it wires existing pieces together and arranges them on the page.

### 3.1 Construction and wiring

| Responsibility | Where it lives today |
|----------------|----------------------|
| Create toolbar from toolset | AnnotationUI constructor (if `opts.addToolbar`) |
| Create LayerUI | AnnotationUI constructor (if `opts.addLayerUI`) |
| Create FileDialog and optional “file” viewer button | AnnotationUI constructor (if `opts.addFileButton`) |
| Create single “annotation” toggle button on the viewer | AnnotationUI constructor (if `opts.addButton`) |
| Build grid DOM (container, top, center, left, right, resize handle) | AnnotationUI._addToViewer() |
| Place viewer in center, toolbar in top, layer UI in right | AnnotationUI._addToViewer() |
| Resize behavior for right panel | AnnotationUI._addToViewer() |
| Toggle button opens/closes toolbar and/or layer UI | AnnotationUI (onClick of _button) |
| Load initial feature collections from opts | AnnotationUI constructor |
| Set initial visibility from opts.autoOpen | AnnotationUI constructor |

### 3.2 Public API

- **destroy()** – Destroys LayerUI, toolbar, removes toggle and file buttons from the viewer.
- **showUI() / hideUI()** – Delegate to LayerUI show/hide.
- **showToolbar() / hideToolbar()** – Delegate to toolbar show/hide.
- **Getters:** `ui` → LayerUI, `toolbar` → toolbar, `element` → LayerUI’s element.

So AnnotationUI provides: (1) **composition** (create toolbar, LayerUI, file button, toggle button), (2) **layout** (grid + placement + resize), (3) **toggle behavior** (one button to show/hide toolbar and/or layer UI), and (4) **delegation** (thin wrappers and getters).

---

## 4. Could We Remove AnnotationUI and Make Toolbar and LayerUI Direct Children of the Toolkit?

Yes. The functionality of AnnotationUI can be moved; the only design choice is **where** it lives.

### Option A: Toolkit owns layout and composition

- **Toolkit** (or a small helper used by it) would:
  - Create toolset when needed (already done).
  - Create **AnnotationToolbar**(toolset) if `opts.addToolbar` (or equivalent).
  - Create **LayerUI**(toolkit) if `opts.addLayerUI`.
  - Create FileDialog and file button if `opts.addFileButton`.
  - Create the grid and the single “annotation” toggle button, and wire visibility (toolbar / layer UI) to that button.
  - Append toolbar element and layer UI element only if they exist (so “toolbar only” and “layer UI only” work without throwing).
  - On destroy, destroy toolbar, LayerUI, file dialog, and remove buttons.

**Pros:** Single place for “annotation UI” configuration; toolbar and LayerUI are clearly direct children of the toolkit; no extra class to understand.  
**Cons:** Toolkit (or its layout helper) grows with DOM/layout code and option-handling.

### Option B: Keep a thin “layout” or “panel” class

- Introduce a small class (e.g. **AnnotationPanel** or **AnnotationLayout**) whose only job is: given a toolkit, optional toolbar, optional LayerUI, optional file button, build the grid, place the viewer/toolbar/layer UI, add the toggle button, and handle resize. The **toolkit** would still own the decisions (“create toolbar?”, “create LayerUI?”) and hold references to toolbar and LayerUI; it would call this helper to build the DOM when at least one of toolbar or LayerUI is present.
- So: Toolkit creates toolset → optionally toolbar, optionally LayerUI, optionally file button → then uses the layout helper to assemble the DOM. No “AnnotationUI” as a catch-all; just optional toolbar, optional LayerUI, and an optional layout step.

**Pros:** Layout and DOM logic stay out of the toolkit class; reuse if we ever need another layout.  
**Cons:** One more small class to name and maintain.

### Option C: No shared layout; caller assembles

- Toolkit exposes only: `addTools()`, `addAnnotationUI()`-style options that create **only** the toolbar and/or only the LayerUI (and optionally file button), and return or attach them. The **caller** (or a separate “demo” / “app” layer) is responsible for inserting toolbar and LayerUI elements into the page and for any toggle button.
- So the toolkit API could look like: `addToolbar(opts?)`, `addLayerUI(opts?)`, `addFileButton()`, and optionally `addAnnotationPanel(opts)` that creates both and does the grid layout for backward compatibility.

**Pros:** Maximum flexibility; toolbar and LayerUI are clearly independent; toolkit stays minimal.  
**Cons:** Apps that want “the standard layout” need to either use a helper or duplicate layout logic.

---

## 5. Recommended Direction

1. **Treat AnnotationToolbar and LayerUI as independent:**  
   - Toolkit API should allow adding toolbar only, LayerUI only, both, or neither (e.g. separate flags or methods: `addToolbar(opts)`, `addLayerUI(opts)`), and the layout should only attach elements that exist (no `this._toolbar.element` when toolbar was not added).

2. **Break the style-button dependence in the UI:**  
   - In FeatureUI and FeatureCollectionUI, when building or showing the style action, check whether a style tool is available (e.g. `annotationToolkit.getTool('style')` or a callback passed from LayerUI). If not available, render the style button as disabled or hide it. LayerUI can receive the toolkit (it already does), so it can pass “is style tool available?” to FeatureCollectionUI/FeatureUI, or they can read from the project/toolkit. That way LayerUI is fully usable without a toolbar; the style button is simply inactive when there is no style tool.

3. **Clarify AnnotationUI’s role or fold it:**  
   - Either **(a)** rename and slim AnnotationUI to a pure “layout + toggle” component (e.g. AnnotationPanel) that takes optional toolbar and optional LayerUI and builds the grid, or **(b)** move layout and composition into the toolkit so that toolbar and LayerUI are direct children and AnnotationUI disappears. In both cases, document that “toolbar” and “layer UI” are independent and that the toolkit (or panel) only composes them and places them.

4. **Unused parameter:**  
   - LayerUI’s `addFileButton` is passed but not used in the constructor; remove it or use it so the contract is clear.

---

## 6. Summary

| Component        | Depends on              | Can be used without                          |
|-----------------|-------------------------|----------------------------------------------|
| AnnotationToolbar | Toolset only            | LayerUI, AnnotationUI, file button          |
| LayerUI         | Toolkit only            | AnnotationToolbar (style button inactive if no style tool) |
| AnnotationUI    | Toolkit, toolset, opts  | N/A (it is the composition layer)           |

- **Style tool link:** Event-based (`edit-style`). Making the style button inactive when `getTool('style')` is null keeps LayerUI and toolbar independent.
- **AnnotationUI:** Purely composition and layout. Its responsibilities can be moved into the toolkit, or into a dedicated layout/panel class, so that AnnotationToolbar and LayerUI become direct children of the toolkit and can be added independently (toolbar only, LayerUI only, both, or neither).

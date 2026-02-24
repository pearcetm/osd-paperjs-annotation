# Plan: Ruler demo – side-by-side toolbar + measurements list, and edit selected

## Goals

1. **Layout:** Change the area below the tool buttons from a single toolbar outlet into a **side-by-side layout**: ruler toolbar on one side, **measurements list** on the other.
2. **Measurements list:** Show a list of existing ruler measurements. Clicking a list entry **selects** the corresponding item on the canvas.
3. **Edit selected when activating ruler:** When the user activates the ruler tool and a **measurement is already selected**, do not create a new placeholder; the ruler should **edit the selected measurement** (modifying mode).

---

## 1. Layout change

**Current:** One block element `#ruler-headless-tool-outlet` (class `headless-tool-outlet`) that is filled with the active tool’s dropdown (toolbar) via `setOutletForTool(tool)` → `outlet.replaceChildren(ctrl.dropdown)`.

**Proposed:**

- Keep a **single container** (e.g. the same outlet div or a new wrapper) that becomes a **flex or grid row** with two children:
  - **Left (or first):** Toolbar outlet – the div that receives the ruler (or default) tool’s dropdown. Existing behavior: `setOutletForTool(tool)` replaces this div’s children with `ctrl.dropdown`.
  - **Right (or second):** **Measurements panel** – a new block containing:
    - A heading/label (e.g. “Measurements”)
    - A list (e.g. `<ul>` or a div with role="list") of measurement entries.

**HTML / DOM:** Either adjust the existing `ruler-headless-tool-outlet` so it becomes the two-column wrapper and the current “outlet” is the first column, or introduce a wrapper and keep the outlet as the first child. Recommendation: in JS, replace the outlet’s usage so that we create a wrapper, put the toolbar outlet div and the measurements list container as siblings, and append that wrapper to the parent that currently holds the outlet (or make the outlet the wrapper). No change to `ruler.html` is strictly required if we create the two-column structure in JS inside `setupRulerHeadlessButtonsAndOutlet` (e.g. create wrapper, move or clone outlet content into first column, add list in second column).

**CSS:** Add a class for the side-by-side container (e.g. `.headless-toolbar-and-list`) with `display: flex; gap: 1rem;` (or grid). Give the measurements list a min-width so it doesn’t collapse; let the toolbar side take space as needed.

**Files:** [demo/ruler.mjs](demo/ruler.mjs) (layout construction in `setupRulerHeadlessButtonsAndOutlet`), [demo/demo.css](demo/demo.css) (styles for the new layout and list).

---

## 2. Measurements list – data and display

**Source of measurements:** Ruler measurements are paper items in the toolkit’s feature collection group(s). Each is a Group whose `annotationItem` has `getGeoJSONType()` returning `{ type: 'MultiLineString', subtype: 'Measurement' }`.

- Use `toolkit.getFeatureCollectionGroups()` to get feature collection groups (if the demo uses the first group only, use `groups[0]`; otherwise iterate).
- For each group, use `group.children` (or `getItems({ match: ... })`) to get direct children that are features. Filter to measurements: `item.isGeoJSONFeature && item.annotationItem?.getGeoJSONType?.()?.subtype === 'Measurement'`.
- Placeholders (empty “new item” to draw into) also live in the same group; they can be excluded by checking for `initializeGeoJSONFeature` and/or that the item has at least one segment (e.g. `item.children?.length > 0` for a Measurement group). So: include only items that are Measurement and have `item.children.length > 0` (or equivalent) so we don’t list the empty placeholder.

**Label for each row:** Use `item.displayName` if set; otherwise derive a short label, e.g. first segment’s distance from `item.annotationItem.getProperties()` / `item.data.ruler` and the segment geometry, or a fallback like “Measurement 1”, “Measurement 2”. The RulerMeasurement annotation item can provide formatted length via its properties; for simplicity the list can show `item.displayName || 'Measurement'` plus an index, and optionally the first segment distance if easy to compute.

**List structure:** One list item per measurement. Store a reference to the paper item on the DOM element (e.g. `data` attribute with an id, or a `WeakMap` / property) so that on click we can call `paperItem.select()` on the corresponding item.

**Files:** [demo/ruler.mjs](demo/ruler.mjs) – add a function to build/update the measurements list and a click handler that selects the item.

---

## 3. Measurements list – keeping it in sync

**Design goal:** Keep the list in sync in real time without re-querying the feature collection. The ruler tool raises a domain event whenever a measurement's length (or display state) is updated; the demo subscribes and updates only the affected row. Clear contract, maintainable, easy for other developers.

### 3.1 Event-driven design: `ruler-measurement-updated`

**Event name:** `ruler-measurement-updated`  
**Emitted on:** `project` (same bus as `item-selected`, `item-replaced`). Listen on `toolkit.paperScope.project`.

**Payload:** `{ item, label?, distance? }`  
- **item** (required): The paper item (Group) for the ruler measurement. Identifies which list row to add/update.  
- **label** (optional): Display string (e.g. `item.displayName` or "Length: 42 px"). Lets the listener update one row without reading the item.  
- **distance** (optional): Numeric length in project units. Lets the listener show length without parsing the item.

**When emitted:** Whenever the ruler tool changes a measurement's geometry or displayed length/label: (1) after a segment is committed – in `commitRulerSegment`; (2) after an edit (endpoint or line drag) – in `onMouseUp` when leaving drag mode; (3) when display settings change (units, etc.) – at end of `refreshSegmentLabels` when `this.item` is set.

**JSDoc:** Document this event on RulerTool (or in an "Events" section in the ruler module) for other developers.

### 3.2 Implementation in the ruler tool ([ruler.mjs](src/js/papertools/ruler.mjs))

- Add a private helper (e.g. `_emitMeasurementUpdated(item)`) that builds the payload (item, optional label from `item.displayName`, optional distance from `this._lastMeasurement?.distance` or first segment) and calls `this.project.emit('ruler-measurement-updated', payload)`.
- Call it from: end of **commitRulerSegment**; **onMouseUp** when exiting `endpoint-drag` or `line-drag`; end of **refreshSegmentLabels** when `this.item` exists.

### 3.3 Listener behavior in the demo ([ruler.mjs](demo/ruler.mjs))

- Subscribe to **`ruler-measurement-updated`** on `toolkit.paperScope.project`. In the handler: if the list already has a row for `payload.item` (e.g. via WeakMap or data), **update** that row's label/distance; otherwise **add** a new row. No re-query of the feature collection.
- Subscribe to **`item-removed`** to **remove** the list row when a measurement is deleted (match by item reference or id).

---

## 4. Click list entry → select corresponding item

**Behavior:** When the user clicks a measurement row in the list, the corresponding paper item should become the only selected item on the canvas.

**Implementation:** In the click handler for a list row, retrieve the paper item associated with that row (from the stored reference). Call `paperItem.select()` (the toolkit’s select method), which deselects others and selects this item and emits `item-selected`. The canvas will update selection state; the ruler tool (if active) will then show that item as `this.item` (modifying mode) when the tool’s `getSelectedItems()` / selection logic runs.

**Files:** [demo/ruler.mjs](demo/ruler.mjs) – list row click handler.

---

## 5. Activate ruler with selected measurement → edit it (no new placeholder)

**Current behavior:** The demo always calls `tool.activate({ createNewItem: true })` for the ruler. The tool’s `activate()` then runs `getSelectedItems()`; if there is no “new item” (placeholder), it calls `_ensureNewItemForTool()` and creates a new placeholder. So even when a measurement is selected, we currently create a new placeholder and select it (we fixed that to use `select()` so only the placeholder is selected).

**Desired behavior:** If **exactly one** item is selected and it is a **ruler measurement** (MultiLineString : Measurement), activate the ruler **without** creating a new item, so the tool enters **modifying mode** for that measurement. Otherwise (no selection, multiple selection, or selected item is not a measurement), create a new placeholder as today.

**Implementation (demo-only):** Keep the decision in the demo. When the user clicks the ruler button to activate:

1. Get current selection: `const selected = toolkit.paperScope.findSelectedItems();`
2. If `selected.length === 1`: get `const item = selected[0]`, and check whether it’s a measurement: `item.annotationItem?.getGeoJSONType?.()?.subtype === 'Measurement'`.
3. If yes: call `tool.activate({})` (no `createNewItem`). The tool will have `this.item` = that measurement, `this.itemToCreate` = null, and will be in modifying mode.
4. If no: call `tool.activate({ createNewItem: true })` as today.

**Files:** [demo/ruler.mjs](demo/ruler.mjs) – in the ruler button’s click handler, branch on selection and measurement type before calling `tool.activate(...)`.

---

## 6. Optional: highlight list row for selected measurement

When the selection changes (e.g. user selects an item from the list or from the canvas), the measurements list can show which row corresponds to the selected item (e.g. add a `.selected` class to that row). To do that, the demo would listen for selection changes (e.g. project `item-selected` / `item-deselected` or poll from the tool’s `getSelectedItems()`), and in refreshMeasurementsList or a small update function, set the selected class on the row whose paper item is in the current selection. This is optional and can be added in a follow-up.

---

## Summary of code touchpoints

| Area | File(s) | Change |
|------|--------|--------|
| Layout | ruler.mjs, demo.css | Build side-by-side wrapper (toolbar outlet + measurements panel); style with flex/grid. |
| Measurements list | ruler.mjs | Function to get measurement items from toolkit’s feature collection(s); render list; store paper item ref on each row. |
| List sync | ruler.mjs (tool), ruler.mjs (demo) | Ruler tool: emit `ruler-measurement-updated` from commitRulerSegment, onMouseUp (after drag), refreshSegmentLabels. Demo: subscribe to `ruler-measurement-updated` (add/update row) and `item-removed` (remove row). |
| List click | ruler.mjs | On row click, call `paperItem.select()`. |
| Activate ruler | ruler.mjs | If single selection is a measurement, call `tool.activate({})`; else `tool.activate({ createNewItem: true })`. |

The ruler tool ([src/js/papertools/ruler.mjs](src/js/papertools/ruler.mjs)) is extended to emit `ruler-measurement-updated`; all other behavior is in the demo ([demo/ruler.mjs](demo/ruler.mjs)) and demo styles (demo.css). No changes to the toolkit.

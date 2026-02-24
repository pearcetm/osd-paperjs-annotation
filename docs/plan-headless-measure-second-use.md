# Plan: Fix second “Measure” usage in headless mode

## Root cause

**Symptom:** The second use of the “Measure” button in headless mode fails (first click does nothing, crosshair can disappear). Multiple rulers work when adding placeholders via LayerUI.

**Cause:** In headless mode, when we ensure a placeholder for the tool we set `placeholder.paperItem.selected = true` without clearing the current selection. So after the first ruler is drawn, that measurement still has `selected === true`. We then add a new placeholder and set *its* `selected = true` as well. We never call the shared `select()` API, so both items end up with `selected === true`. The tool’s single-item getter is `this.item = _items.length === 1 ? _items[0] : null`, so with two selected items **`this.item` is null**. The tool therefore never enters modifying mode for the first ruler (no move/resize), and on first click it bails because `_ensureItemForDrawing()` returns `!!this.item` → false. 1. User clicks “Measure” again → `activate({ createNewItem: true })` runs.
2. `_ensureNewItemForTool()` creates a new placeholder and sets `placeholder.paperItem.selected = true` (property only; no call to `select()`).
3. The previous ruler was never deselected, so we now have **two** items with `selected === true`: the first ruler and the new placeholder.
4. `getSelectedItems()` sets `_items = [ruler, placeholder]`, so the single-item getter `this.item` is **null** (only set when exactly one item is selected). The tool therefore does not enter modifying mode for the first ruler (no move/resize), even though that ruler is still in the selection set.
5. We do have `this.itemToCreate === placeholder` (first item with `initializeGeoJSONFeature`).
6. On first canvas click, ruler’s `onMouseDown` calls `_ensureItemForDrawing()`, which:
   - Calls `itemToCreate.initializeGeoJSONFeature('MultiLineString', 'Measurement')` → placeholder is replaced by the new empty measurement (with selection copied to the new item).
   - Calls `refreshItems()`. Selected items are now: **first ruler + new empty measurement** (two items again).
   - Returns `!!this.item` → still **false** because `this.item` is null (two selected).
7. So `_ensureItemForDrawing()` returns false, we bail with `if (!this._ensureItemForDrawing()) return;`, and the first click does nothing.

**Why LayerUI works:** In [featurecollectionui.mjs](src/js/featurecollectionui.mjs) (line 241), when adding a new feature they call `item.select()`. That uses the toolkit’s `paperItemSelect`, which **deselects all other items** then selects the new one. So only one item is ever selected, `this.item` is set, and the tool works.

## Fix

Use the same selection contract as the rest of the app: select the new placeholder via the `select()` method so that other items are deselected first.

**File:** [annotationtoolkit.mjs](src/js/annotationtoolkit.mjs)  
**Method:** `_ensureNewItemForTool(style)`

**Change:** Replace:

```js
placeholder.paperItem.selected = true;
```

with:

```js
placeholder.paperItem.select();
```

`paper.Item.prototype.select` is set to `paperItemSelect` in the same file (line 86). With the default argument, `paperItemSelect()` first runs `this.project._scope.findSelectedItems().forEach(item => item.deselect())`, then sets `this.selected = true` and emits `item-selected`. So only the new placeholder will be selected, matching LayerUI behavior and ensuring `this.item` is the placeholder (then the new measurement after conversion).

## Summary

| Path              | Selection after “new item” | `this.item` on first click |
|-------------------|----------------------------|-----------------------------|
| LayerUI (works)   | `item.select()` → single   | Placeholder, then new item  |
| Headless (broken) | `selected = true` → multi  | null → bail                 |
| Headless (fixed)  | `placeholder.paperItem.select()` → single | Placeholder, then new item  |

No changes to the ruler tool or placeholder are required; the bug is entirely in the programmatic “ensure placeholder” path not using the shared selection API.

---

## Deep dive: Re-activation when the previous measurement stays selected

**Observed UX:** User draws a ruler, then clicks the ruler button again (or the default button) to turn off the tool. The measurement stays selected. When the user clicks the ruler button again to draw another measurement, something goes wrong: the tool may immediately switch back to default, or the first canvas click does nothing.

**Code path (current, before fix):**

1. **Deactivate** – Clicking the ruler button again calls `tool.deactivate(true)`. The ruler does not deselect the current item, so the measurement remains selected (consistent with other tools).

2. **Re-activate** – Demo calls `tool.activate({ createNewItem: true })`. So when there is no selected placeholder (`_itemToCreate` is null), we call `_ensureNewItemForTool()`.

3. **`_ensureNewItemForTool()`** – We create a placeholder and set `placeholder.paperItem.selected = true` (property only). We do not call `select()`, so the measurement is not deselected. We end up with **two** items selected: measurement and placeholder.

4. **Failure modes:**
   - **Toolset:** When `setMode()` runs, it sees `findSelectedItems().length === 2` → `currentMode = 'multiselection'`. The ruler’s `isEnabledForMode('multiselection')` is **false**, so the toolset runs `activeTool.deactivate(true); this.tools.default.activate();` – **the ruler is immediately turned off**.
   - **First click:** If the ruler stayed active, `this.item` would be null (two selected), so the first click would bail in `_ensureItemForDrawing()`.

**Fix:** Use `placeholder.paperItem.select()` in `_ensureNewItemForTool` so we deselect the previous measurement and only the new placeholder is selected. Then mode stays `'new'`, the ruler stays active, and the first click works.

---

## Why selected state and visual style can disagree

Selection is reflected in two ways:

1. **Property:** `item.selected = true`. Paper.js uses this for internal state and (in standard setups) for drawing selection bounds on the canvas.
2. **Event:** `item.emit('selected')`. The shared `select()` API sets the property *and* emits this event. UI that shows "selected style" often listens for the event, not the property.

When we only set the property (e.g. in `enhancedReplaceWith` we do `newItem.selected = this.selected`), we do **not** emit `'selected'`. So any code that applies selection style in response to the **event** (e.g. FeatureUI adding the `selected` class to the list row, or tools that set `selectedColor` on selection) never runs. The first ruler (or the new measurement right after replace) can therefore have `selected === true` but not show the usual selected style until something later triggers the event (e.g. user re-selects via the list or canvas, which goes through `select()` and emits `'selected'`).

Additionally, after `replaceWith`, the FeatureUI that was bound to the placeholder updates its reference to the new item in the `item-replaced` handler (featureui.mjs) but does **not** re-attach its `'selected'` / `'deselected'` listeners to the new item; those remain on the old (replaced) item. So even if we emitted `'selected'` on the new item, that FeatureUI's listener would not run. So the mismatch between "supposed selected state" and visual style comes from (1) property vs event and (2) listeners not being re-bound to the new item after replace.

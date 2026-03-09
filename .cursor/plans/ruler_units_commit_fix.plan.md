---
name: ""
overview: ""
todos: []
isProject: false
---

# Ruler units revert to "px" on commit — fix plan

## Agreement with the analysis

The analysis is correct. In our codebase:

- **[ruler.mjs](src/js/papertools/ruler.mjs)** `commitRulerSegment(p1, p2)` (lines 606–630) currently does:
  1. `buildSegmentGroup` → `addChild(segmentGroup)` → `_ensurePathLabel(segmentGroup)` → `_writeRulerDataToItem()`.
- **_ensurePathLabel(segmentGroup)** delegates to **RulerMeasurement.refreshSegmentLabel(segmentGroup)** in [rulermeasurement.mjs](src/js/paperitems/rulermeasurement.mjs), which reads `this.paperItem.data.ruler` (lines 223–227) for `units` and `unitsPerPixel` to build the label text. If `data.ruler` is not set yet, it uses `ruler = {}` and defaults to `units = 'px'`, `unitsPerPixel = 1`, so the label is overwritten to pixels.
- **_writeRulerDataToItem()** (lines 405–417) only uses `this.item`, `this.item.annotationItem`, and `this.toolbarControl` (labelUnit, unitsPerPixel, etc.). It does not depend on the newly added segment. Calling it immediately after `addChild(segmentGroup)` is valid and idempotent.

So the bug is purely **order of operations**: we refresh the label (which reads `item.data.ruler`) before we write the current toolbar units into `item.data.ruler`.

---

## Fix (single change)

**File:** [src/js/papertools/ruler.mjs](src/js/papertools/ruler.mjs)  
**Function:** `commitRulerSegment(p1, p2)` (around lines 609–613).

**Current order:**

```js
const segmentGroup = this.buildSegmentGroup(p1, p2, { preview: false });
this.item.addChild(segmentGroup);
this._ensurePathLabel(segmentGroup);
this._writeRulerDataToItem();
```

**New order:**

```js
const segmentGroup = this.buildSegmentGroup(p1, p2, { preview: false });
this.item.addChild(segmentGroup);
this._writeRulerDataToItem();
this._ensurePathLabel(segmentGroup);
```

No other call sites need changes. No timeouts or other workarounds.

---

## Verification

- With a slide that has MPP and UI set to a physical unit (e.g. µm): draw a new measurement; after placing the second point, the on-canvas label should stay in µm (not revert to px).
- Edit the same measurement (e.g. drag an endpoint): label should still show µm.
- Save and reload: units should remain correct.


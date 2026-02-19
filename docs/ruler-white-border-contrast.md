# Ruler: thin white border for contrast

## Goal

Draw a thin white border around (1) the measuring line and (2) the distance label so the ruler stays readable when the underlying image has similar colors.

---

## 1. Line (path) – white halo

**Approach:** Draw the same segment twice: a **white, slightly thicker** path behind, then the **colored** path on top. The thicker white stroke shows as a thin white border around the line.

- **Halo path:** Same geometry as the main path (`new paper.Path([p1, p2])`). Style: `strokeColor: 'white'`, `strokeWidth` in pixels = main stroke width + 2 (e.g. `this.strokeWidthPixels + 2`). Use the same zoom convention: `strokeWidth = (strokeWidthPixels + 2) / z`, `rescale = { strokeWidth: this.strokeWidthPixels + 2 }`.
- **Order in group:** Add halo first, then main path, then label. So segment group becomes: `[haloPath, path, label]` (indices 0, 1, 2).
- **Where to create:** In `commitRulerSegment`, after creating the main path and applying `applyPreviewOrPathStyle(path, false)`:
  - Create `haloPath = new paper.Path([p1, p2])`.
  - Apply a “halo” style helper (or inline): white stroke, `strokeWidth = (this.strokeWidthPixels + 2) / getZoomFactor()`, `rescale = { strokeWidth: this.strokeWidthPixels + 2 }`, same `strokeCap`/`strokeJoin` as main path.
  - `segmentGroup.addChild(haloPath)` then `segmentGroup.addChild(path)` (path stays second). Then call `_ensurePathLabel(segmentGroup)` so the label remains the third child.
- **Path resolution:** Update `_getPathFromSegmentChild(child)` so that for a Group: if `child.children.length === 3`, the main path is `child.children[1]`; if `child.children.length === 2` (legacy path + label), path is `child.children[0]`. That keeps existing segments and MultiLinestring semantics (getCoordinates, hit-test, etc.) on the main path.
- **Label index:** In `_ensurePathLabel`, the label is always the **last** child: `label = segmentGroup.children[segmentGroup.children.length - 1]`. No change needed if we always add halo then path then label; for legacy 2-child groups the label remains at index 1.
- **Backfill:** When migrating a legacy path to a segment group in `_ensureItemLabels`, create a halo path (copy of the path’s segments), style it white + thicker rescale, insert at index 0, so we end up with [halo, path, label].
- **Preview:** Optionally add a halo for the in-progress preview path in the drawing group (same idea: white path behind the dashed preview path).

**Summary:** One extra path per segment, white and ~2px thicker, drawn first in the group; path resolution and label index updated to support 3-child groups.

---

## 2. Text (label) – white outline

**Approach:** Paper.js `PointText` supports `strokeColor` and `strokeWidth`. Set a white stroke so the text has a thin outline.

- **When creating the label** (in `_ensurePathLabel`): Set `strokeColor: 'white'` and `strokeWidth` to a small pixel value (e.g. 1.5). Make stroke width zoom-independent like the font: add to rescale, e.g. `strokeWidth: (z) => RULER_LABEL_STROKE_PX / z` with `RULER_LABEL_STROKE_PX = 1.5`. So `label.rescale = { fontSize: (z) => RULER_LABEL_FONT_SIZE / z, strokeWidth: (z) => RULER_LABEL_STROKE_PX / z }`.
- **Initial stroke width:** Set `label.strokeWidth = RULER_LABEL_STROKE_PX / zoomFactor` when creating (or rely on `applyRescale()` right after). So after `applyRescale()` the stroke is correct.
- **When updating existing label:** Ensure `strokeColor` and rescale `strokeWidth` are applied on backfill/creation; for existing labels that already have content we don’t need to change stroke unless we’re creating them (we already create all labels in _ensurePathLabel). So only the “create new label” branch and the backfill branch (where we create a new label for a migrated path) need the white stroke and strokeWidth rescale.

**Summary:** Add `strokeColor: 'white'` and zoom-independent `strokeWidth` (via rescale) to the ruler PointText label.

---

## 3. Implementation checklist

| Item | Where | Change |
|------|--------|--------|
| Halo path creation | `commitRulerSegment` | Create halo path, style white + thicker stroke (rescale), add to group before main path. |
| Path resolution | `_getPathFromSegmentChild` | If group has 3 children, return `children[1]`; else `children[0]`. |
| Label reference | `_ensurePathLabel` | Label = `segmentGroup.children[segmentGroup.children.length - 1]` (so index 2 with halo, index 1 without). |
| Backfill | `_ensureItemLabels` | When wrapping a path in a group, add halo path at index 0, then path, then create/add label. |
| Label style | `_ensurePathLabel` (create + update) | Set `strokeColor: 'white'`, add `strokeWidth` to rescale and set initial `strokeWidth`. |
| Preview (optional) | First click / drag preview | Add halo path behind preview path in drawing group. |

Constants: e.g. `RULER_LABEL_STROKE_PX = 1.5`, halo extra width = 2 (so `this.strokeWidthPixels + 2`). No API changes; MultiLinestring already uses `_getPathFromSegmentChild` so it will work once that helper handles 3-child groups.

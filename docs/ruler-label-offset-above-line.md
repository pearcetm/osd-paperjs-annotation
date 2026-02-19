# Ruler label: offset above segment (no overlap)

## Current behavior

The label’s **visual center** is placed at the segment **midpoint**, so the text sits on the line. For a horizontal segment the text appears below the line in the sense that the baseline is at the midpoint and the block extends upward.

## Goal

Place the label **above** the segment so the text box does **not** overlap the line, with a single consistent choice of “above” for all segments. The offset (and gap) should be **constant in monitor pixel space** at any zoom, like the PointText tool’s dot–text offset.

---

## How PointText keeps dot–text offset constant in pixels

In [pointtext.mjs](src/js/paperitems/pointtext.mjs), `refreshTextOffset()` positions the text relative to the circle so the visual relationship is fixed on screen:

```javascript
let boundsNoRotate = this.textitem.getInternalBounds();
let offsetX = boundsNoRotate.width / 2 / this.textitem.layer.scaling.x * (flipped ? 1 : -1);
let offsetY = -boundsNoRotate.height / 2 / this.textitem.layer.scaling.x;
let offset = new paper.Point(offsetX, offsetY).divide(this.textitem.view.getZoom()).rotate(-rotation);
this.textitem.position = this.circle.bounds.center.add(offset);
```

- They compute a desired offset using text bounds and **divide by `layer.scaling.x`** (and use **`view.getZoom()`** in the final step). So the offset is expressed so that when converted to the item’s coordinate system it corresponds to a **fixed pixel displacement** on screen.
- Conversion rule: **screen pixels = paper units × zoomFactor**, where `zoomFactor = item.view.scaling.x * item.layer.scaling.x` (same as in [paper-extensions.mjs](src/js/paper-extensions.mjs) `applyRescale()`). So **paper units = screen pixels / zoomFactor**.
- So for any constant pixel offset we want in paper space:  
  **`offsetPaper = offsetPixels / zoomFactor`**, with `zoomFactor = label.view.scaling.x * label.layer.scaling.x`. The label has `.view` and `.layer` once it’s in the project, so we can read this from the label (or from the ruler’s `getZoomFactor()` when the label is on `targetLayer`).

---

## Analysis

### 1. Choosing “above”

- In Paper.js, y increases downward (typical screen coordinates).
- For a horizontal segment left-to-right, “above” = smaller y (upward).
- For an arbitrary segment from `p1` to `p2`, define:
  - **Segment direction:** `segmentDir = (p2 - p1).normalize()`
  - **Normal “above”:** rotate segment direction 90° counter-clockwise:  
    `normal = new paper.Point(segmentDir.y, -segmentDir.x).normalize()`
- For a horizontal segment pointing right, this gives `(0, -1)` = upward. Same idea for any angle: we always place the label on the same side of the line.

### 2. Offset distance (no overlap), zoom-aware

- Label has height `h = label.bounds.height` (in paper units). The label uses `rescale.fontSize = base/z`, so **h already scales with zoom** and the text box has constant pixel height on screen. So moving the center by `h/2` in paper units already moves by a constant pixel amount (half the text height).
- We add a **gap** so the text box doesn’t touch the line. To keep that gap constant in **monitor pixels** (like PointText), express the gap in paper units as:  
  **`gapPaper = gapPixels / zoomFactor`**, with `zoomFactor = label.view.scaling.x * label.layer.scaling.x`.
- Total offset along the normal: **`offset = h/2 + gapPaper`**, so:
  - **Placement center:** `placementCenter = midpoint.add(normal.multiply(h/2 + gapPaper))`
  - Then call existing `_centerLabelOnPoint(label, placementCenter)`.

### 3. Gap size (constant in pixels)

- Use a constant **in screen pixels**, e.g. `RULER_LABEL_GAP_PX = 4`.
- In code: **`gapPaper = RULER_LABEL_GAP_PX / zoomFactor`**, where `zoomFactor = label.view.scaling.x * label.layer.scaling.x` (same convention as `applyRescale` and PointText). The label is already in the project when we run this (after `applyRescale()`), so `label.view` and `label.layer` are set.

### 4. Edge cases

- **Zero-length segment:** Already handled (early return in `_ensurePathLabel`).
- **Vertical segment:** Normal is horizontal; placement is still well-defined and non-overlapping.

### 5. Where to compute

- **Call site:** `_ensurePathLabel` already has `p1`, `p2`, `midpoint`, and the label (with correct bounds after `applyRescale()`).
- **Logic:** In `_ensurePathLabel`, after updating/creating the label and calling `applyRescale()`:
  1. Get zoom factor from the label (same convention as PointText / applyRescale):  
     `zoomFactor = label.view.scaling.x * label.layer.scaling.x`
  2. Compute `segmentDir = (p2 - p1).normalize()` (guard: if length &lt; epsilon, skip offset and use midpoint).
  3. Compute `normal = new paper.Point(segmentDir.y, -segmentDir.x).normalize()`.
  4. Compute gap in paper units: `gapPaper = RULER_LABEL_GAP_PX / zoomFactor`.
  5. Compute `placementCenter = midpoint.add(normal.multiply(label.bounds.height / 2 + gapPaper))`.
  6. Call `_centerLabelOnPoint(label, placementCenter)`.
- **No change** to `_centerLabelOnPoint(label, centerPoint)`; it stays “center this label on this point.” Only the *point* we pass becomes the offset placement center instead of the raw midpoint.

## Plan (summary)

1. **Constant:** Add a gap constant **in screen pixels**, e.g. `RULER_LABEL_GAP_PX = 4`, near `RULER_LABEL_FONT_SIZE` in [ruler.mjs](src/js/papertools/ruler.mjs).
2. **In `_ensurePathLabel`** (both branches: update existing label and create new label):
   - After `applyRescale()` and before `_centerLabelOnPoint`:
     - `zoomFactor = label.view.scaling.x * label.layer.scaling.x` (same as PointText / applyRescale).
     - Compute `segmentDir = (p2 - p1).normalize()`. If segment length is too small (e.g. &lt; 1e-6), use `midpoint` as placement center and skip offset.
     - Compute `normal = new paper.Point(segmentDir.y, -segmentDir.x).normalize()`.
     - `gapPaper = RULER_LABEL_GAP_PX / zoomFactor`.
     - `placementCenter = midpoint.add(normal.multiply(label.bounds.height / 2 + gapPaper))`.
     - Call `_centerLabelOnPoint(label, placementCenter)` (instead of `_centerLabelOnPoint(label, midpoint)`).
3. **Leave `_centerLabelOnPoint` unchanged**; it already positions the label so its visual center is at the given point.

The half-height term (`label.bounds.height / 2`) is already in paper units that scale with zoom (because the label’s fontSize is rescaled), so the visual distance from the line to the text edge stays constant in pixels. The gap term `gapPaper` makes the extra space between text and line constant in pixels too, matching the PointText approach.

No new public API; no changes to MultiLinestring or other tools.

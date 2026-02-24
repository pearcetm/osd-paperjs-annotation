# Code review: Ruler labels upright like PointText

Review of the planned change to make ruler measurement labels stay upright on view rotate/flip, acting as a PR-style review for consistency with PointText and simplicity.

**The implementation plan has been updated per this review:** see [plan-ruler-labels-upright.md](plan-ruler-labels-upright.md).

---

## 1. Match PointText’s pattern exactly (no extra abstraction)

**Current plan:** “Shared helper (e.g. in ruler.mjs and imported by rulermeasurement.mjs) that takes `(segmentGroup, labelGroup, getPlacementCenter)` and subscribes/unsubscribes to view.”

**PointText does not use a helper.** The rotate/flip logic lives inline in the constructor ([pointtext.mjs](src/js/paperitems/pointtext.mjs) lines 113–133): a local `handleFlip`, initial flip check, `offsetAngle` rotate, then `view.on('rotate')` and `view.on('flip')`. The same pattern appears in [style.mjs](src/js/papertools/style.mjs) (ColorpickerCursor, lines 604–613, 651–653).

**Recommendation:** Do **not** introduce a shared helper. In both places that create segment groups (ruler.mjs and rulermeasurement.mjs), **copy the same block** that PointText uses, with the only change being the target variable (`labelGroup` instead of `point`). That keeps the codebase consistent and makes the two implementations easy to compare.

---

## 2. Use the exact same code block as PointText

**Exact pattern to replicate** (variable name `labelGroup` for our wrapper, `point` in PointText):

```javascript
function handleFlip(){
    const angle = labelGroup.view.getFlipped() ? labelGroup.view.getRotation() : 180 - labelGroup.view.getRotation();
    labelGroup.rotate(-angle);
    labelGroup.scale(-1, 1);
    labelGroup.rotate(angle);
}
if (labelGroup.view.getFlipped()) {
    handleFlip();
}
const offsetAngle = labelGroup.view.getFlipped() ? 180 - labelGroup.view.getRotation() : -labelGroup.view.getRotation();
labelGroup.rotate(offsetAngle);

labelGroup.view.on('rotate', ev => {
    const angle = -ev.rotatedBy;
    labelGroup.rotate(angle);
});
labelGroup.view.on('flip', () => {
    handleFlip();
});
```

**View access:** PointText uses `point.view` (item’s view from project). Our segment group has `segmentGroup.project.view`; the label group is a child so `labelGroup.view` resolves the same way. Use `labelGroup.view` for consistency with PointText.

---

## 3. Do not add listener cleanup (match PointText)

**Current plan:** “On `segmentGroup.on('remove')`, remove the view listeners.”

**PointText does not remove its view listeners** when the item is removed. So we add one `rotate` and one `flip` handler per item; the view is a long-lived singleton.

**Recommendation:** Do **not** add remove-listener logic. Match PointText’s behavior so the codebase stays consistent. If the project later adds cleanup for PointText, we can add it for ruler labels at the same time.

---

## 4. Label group setup: mirror PointText’s group

**PointText:** `point.pivot = new paper.Point(0,0); point.applyMatrix = true;` — children (circle, text) are at (0,0) in local space, so rotation is around the group’s origin.

**Ruler labels:** The label group should rotate around the placement center. So:

- Set **label group** `position` to the placement center (in segment/paper space).
- Set **label group** `pivot = new paper.Point(0,0)` and `applyMatrix = true`.
- Put the two PointTexts **inside the label group at (0,0)** in the group’s local space (e.g. `point: new paper.Point(0,0)` with `justification: 'center'` so the text is centered at origin). Then when we rotate the label group, labels stay centered at the placement point.

**In _ensurePathLabel / _centerLabelOnPoint:** Today we set each label’s `point` to the placement center in paper space. With a label group, we should set the **label group’s** position to the placement center and keep the **labels’** `point` at (0,0) in group space (only the group’s position changes when placement is recomputed).

---

## 5. RulerMeasurement: use midpoint for placement

**Current plan:** “(needs placement center: can compute from path midpoint + normal like ruler, or a simple midpoint for loaded data).”

**Recommendation:** In RulerMeasurement, use **midpoint** as the label group position. We do not need to duplicate the “above segment” offset logic from the tool; midpoint keeps the implementation simple and consistent. The tool can keep using `_computeLabelPlacementCenter` for the live ruler; loaded measurements can use midpoint.

---

## 6. Constants and call sites

- **Layout:** Segment group has **3 children**: `[halo, path, labelGroup]` → `SEGMENT_HALO = 0`, `SEGMENT_PATH = 1`, `SEGMENT_LABEL_GROUP = 2`. Inside the label group: stroke label index 0, fill label index 1.
- **All current uses of `segmentGroup.children[SEGMENT_STROKE_LABEL]` / `[SEGMENT_FILL_LABEL]`** become `segmentGroup.children[SEGMENT_LABEL_GROUP].children[0]` and `.children[1]` (or local constants for readability).
- **Preview segment:** The ruler’s preview segment group (during drag) should get the same label-group + view logic so preview text stays upright.

---

## 7. Summary of plan adjustments

| Topic | Change |
|-------|--------|
| **Helper** | Do not add a shared helper; inline the same rotate/flip block (as in PointText) in both ruler.mjs and rulermeasurement.mjs. |
| **Code block** | Use the exact same `handleFlip`, initial flip, `offsetAngle` rotate, and `view.on('rotate'/'flip')` as PointText, with `labelGroup` as the target. |
| **View** | Use `labelGroup.view` (same as PointText’s `point.view`). |
| **Cleanup** | Do not add `segmentGroup.on('remove')` listener removal; match PointText. |
| **Label group** | `position` = placement center, `pivot = (0,0)`, `applyMatrix = true`; labels inside at (0,0) in group space. |
| **RulerMeasurement** | Use midpoint as label group position; no “above segment” offset. |

These changes keep the implementation simple, aligned with PointText and style.mjs, and easy to maintain.

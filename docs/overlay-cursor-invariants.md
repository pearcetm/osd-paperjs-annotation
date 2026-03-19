# Overlay Cursor Invariants

This project uses CSS cursor affordances attached to the overlay canvas (e.g. `canvas.rectangle-tool-resize`).
These classes must be treated as *tool-owned state* rather than something that “happens to be set” by the last mousemove.

## What the core now guarantees

- Tools can register the overlay cursor classes they own via `registerOverlayCursorOwnedClasses(...)` on `ToolBase`.
- When a tool is deactivated, `AnnotationUITool.deactivate()` calls `clearOverlayCursorOwnedClasses()`, removing any stale owned cursor classes.
- `AnnotationUITool.selectionChanged()` calls an optional `syncOverlayCursor()` hook on the tool (if implemented).

## What tool implementations must still do

Some tools transition between internal modes (e.g. `modifying` -> `creating`) without triggering full tool deactivation.
In these cases, tools must clear owned cursor classes as part of their state-machine transitions, not only in `onMouseMove()` or `onDeactivate()`.

Example:

- `RectangleTool` / `EllipseTool`: when entering `mode = 'creating'`, call `this.clearOverlayCursorOwnedClasses()` so resize/move cursors can’t “stick” if the external UI keeps the tool active.

## When to use `syncOverlayCursor()`

If your cursor affordance depends on hover / hit-testing but the relevant geometry or state can change without a mousemove, implement `syncOverlayCursor()` and update the overlay cursor there.


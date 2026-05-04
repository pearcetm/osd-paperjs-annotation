# Changelog

## [0.5.0] - 2026-04-10

### Added

- `PaperOverlay#getPaperLayer(osdObject)` — returns this overlay’s `paper.Layer` for a given `TiledImage`, `Viewport`, or `Viewer`.
- Multi-overlay support: `tiledImage.paperLayer` / `viewport.paperLayer` / `viewer.paperLayer` lazily resolve to the topmost matching `PaperOverlay` by walking `viewer.PaperOverlays` in stack order when more than one scope is registered
- Tool and project event API: tools emit `item-created`, `item-updated`, and `item-converted`; the project re-emits them for external consumers.
- Ability to remove event listeners registered on tool events.
- Exhaustive demo page for exercising tools and events.
- Ruler tool precision API for programmatic control of displayed measurements.

### Changed

- `PaperOverlay` keeps an explicit `Map` from OSD objects to layers so registrations are iterable and teardown is deterministic; `destroy` unregisters from OSD maps before removing the Paper project.
- `AnnotationToolkit` and related tools resolve tile/viewport layers via `this.overlay.getPaperLayer(...)` instead of bare `tiledImage.paperLayer` when multiple overlays share a viewer.
- Field-of-view demo brings the annotation toolkit overlay forward after creating the FOV overlay so the headless ruler works alongside FOV.
- Event payloads and timing aligned with underlying behavior rather than only UI actions.
- `item-updated` is fired for a broader set of annotation changes.
- Standardized tool CSS class usage for consistent cursor styling.
- Improved magic wand threshold handling.
- Ruler measurement module filename capitalization (`rulermeasurement.mjs`).

### Fixed

- GeoJSON import/export for point and point text items, including stroke and fill opacity and point text behavior.
- Line string tool and import fixes
- Export merges group rescaling with shape styling for point-based items.
- Ruler tool with non-pixel CSS units; measurement label text offset.
- `enhancedReplaceWith` and paper item replacement: annotation item references stay in sync and item data survives replacement.
- Detection and handling when paper items with invalid geometries are added as annotation subtypes.
- Ignore drawing actions from non-primary mouse buttons (e.g. middle or right click).

[0.5.0]: https://github.com/pearcetm/osd-paperjs-annotation/releases/tag/v0.5.0

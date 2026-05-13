# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.7.1] - 2026-05-13

### Added

- `src/js/overlays/annotations/`: optional `ConfigurationWidget` integration for `AnnotationToolkit` (`attachAnnotationToolkitConfigurationWidget`, `AnnotationToolkit#registerWithConfigurationWidget`); documented in that folder's `README.md`. Also exported on `OSDPaperjsAnnotation`.
- Added support for saving user choices for configuration locally via localstorage.

### Changed

- Field of view overlay: viewer and configuration UI icon updated from binoculars to microscope (`fa-microscope`)

## [0.7.0] - 2026-05-12

### Added

- Configuration overlay for discovering and toggling overlay-related options, with a demo page.
- Shared `ViewerOverlayBase` helper for common overlay lifecycle, viewer controls, and optional registration with the configuration UI.

### Changed

- Field-of-view, screenshot, and rotation overlays adopt the shared overlay base and integrate with the configuration UI where applicable.
- Screenshot overlay reorganized into focused modules under `src/js/overlays/screenshot/` for clearer structure and maintenance.

### Fixed

- Screenshot overlay: incorrect or inconsistent region and export sizing when the viewport was rotated.

## [0.6.0] - 2026-05-04

### Added

- Field-of-view overlay.
- Screenshot overlay improvements, including optional scalebar text.
- New demo pages for field-of-view and screenshot overlays.

### Changed

- `PaperOverlay#getPaperLayer(osdObject)` — returns this overlay’s `paper.Layer` for a given `TiledImage`, `Viewport`, or `Viewer`.
- Multi-overlay support: `tiledImage.paperLayer` / `viewport.paperLayer` / `viewer.paperLayer` lazily resolve to the topmost matching `PaperOverlay` by walking `viewer.PaperOverlays` in stack order when more than one scope is registered.

## [0.5.0] - 2026-04-10

### Added

- Tool and project event API: tools emit `item-created`, `item-updated`, and `item-converted`; the project re-emits them for external consumers.
- Ability to remove event listeners registered on tool events.
- Exhaustive demo page for exercising tools and events.
- Ruler tool precision API for programmatic control of displayed measurements.

### Changed

- Event payloads and timing aligned with underlying behavior rather than only UI actions.
- `item-updated` is fired for a broader set of annotation changes.
- Standardized tool CSS class usage for consistent cursor styling.
- Improved magic wand threshold handling.
- Ruler measurement module filename capitalization (`rulermeasurement.mjs`).

### Fixed

- GeoJSON import/export for point and point text items, including stroke and fill opacity and point text behavior.
- Line string tool and import fixes, including correct LineString GeoJSON type spelling.
- Export merges group rescaling with shape styling for point-based items.
- Ruler tool with non-pixel CSS units; measurement label text offset.
- `enhancedReplaceWith` and paper item replacement: annotation item references stay in sync and item data survives replacement.
- Detection and handling when paper items with invalid geometries are added as annotation subtypes.
- Ignore drawing actions from non-primary mouse buttons (e.g. middle or right click).

[0.7.0]: https://github.com/pearcetm/osd-paperjs-annotation/releases/tag/v0.7.0
[0.6.0]: https://github.com/pearcetm/osd-paperjs-annotation/releases/tag/v0.6.0
[0.5.0]: https://github.com/pearcetm/osd-paperjs-annotation/releases/tag/v0.5.0

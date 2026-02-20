# Save/Load (Export/Import) Patterns for Annotations

This document analyzes how annotation tools implement save and load so the Ruler tool can implement export/import consistently with existing patterns. It focuses on types that do not map to simple geometric structures—especially **PointText** (position + text)—and summarizes the patterns the Ruler should follow.

---

## 1. Overall architecture

### 1.1 Save (export) flow

- **Entry point:** [annotationtoolkit.mjs](src/js/annotationtoolkit.mjs) `toGeoJSON(options)`.
- It finds all feature-collection groups (`getItems({ match: i => i.isGeoJSONFeatureCollection })`), then for each group builds a GeoJSON object:
  - `type: 'FeatureCollection'`
  - `features`: each **descendant that has `annotationItem`** is converted via `d.annotationItem.toGeoJSONFeature()`.
  - `properties`: defaultStyle, userdata; `label`: group display name.
- So only items that have an `annotationItem` reference are serialized. That reference is set when the paper item is created by an `AnnotationItem` subclass (via the `paperItem` setter, which calls `convertPaperItemToAnnotation`).

### 1.2 Load (import) flow

- **Entry point:** [annotationtoolkit.mjs](src/js/annotationtoolkit.mjs) `loadGeoJSON(geoJSON, replaceCurrent, parentImage)`.
- For each object with `type === 'FeatureCollection'`:
  - A feature-collection group is created (`_createFeatureCollectionGroup`).
  - For each `feature` in `obj.features`, it does `paper.Item.fromGeoJSON(feature)` and adds the returned paper item to the group.
- **`paper.Item.fromGeoJSON`** is assigned to **`AnnotationItemFactory.itemFromGeoJSON`** ([annotationtoolkit.mjs](src/js/annotationtoolkit.mjs) ~183, [annotationitem.mjs](src/js/paperitems/annotationitem.mjs) ~299–315):
  - Normalizes the argument to a Feature (if a raw geometry is passed).
  - `getConstructor(geoJSON)` finds a registered `AnnotationItem` constructor that supports `geoJSON.geometry.type` and `geoJSON.geometry.properties.subtype`.
  - `new ctor(geoJSON)` is called; the constructor builds the paper item and sets `this.paperItem = ...`, which triggers `convertPaperItemToAnnotation(this)`.
  - `geoJSON.properties?.userdata` is copied onto `annotationItem.paperItem.data.userdata`.
  - The **paper item** (not the AnnotationItem instance) is returned and added to the group.

So: **save** = walk descendants with `annotationItem` → `toGeoJSONFeature()`; **load** = for each feature, pick constructor by type/subtype → `new Ctor(geoJSON)` → paper item attached to group.

---

## 2. AnnotationItem contract (base class)

Defined in [annotationitem.mjs](src/js/paperitems/annotationitem.mjs).

### 2.1 Constructor

- **Signature:** `constructor(feature)` where `feature` is a GeoJSON Feature `{ type: 'Feature', geometry, properties }`.
- Base class: validates `feature.geometry.type` (or `feature.geometry`), sets `this._props = feature.properties || {}`.
- Subclass: builds the visual paper item from `feature.geometry` (and optionally `feature.properties`), then sets `this.paperItem = item`. Setting `paperItem` runs `convertPaperItemToAnnotation(this)`, which registers the item, applies style from `_props`, sets `displayName`, and stores `item.annotationItem = annotationItem`.

### 2.2 Serialization (save)

- **`toGeoJSONFeature()`** (base, can override): builds `{ type: 'Feature', geometry: this.toGeoJSONGeometry(), properties: { label, selected, ...getStyleProperties(), userdata } }`.
- **`toGeoJSONGeometry()`** (base, can override): builds `{ type: this.type, properties: this.getProperties(), coordinates: this.getCoordinates() }`; if `this.subtype` exists, adds `subtype` into `geometry.properties`.
- **`getCoordinates()`** (override in subclass): return the array structure that GeoJSON expects for that geometry type (e.g. `[x, y]` for Point, array of linestrings for MultiLineString).
- **`getProperties()`** (override in subclass): return **geometry-level** properties that are not pure “style” (stroke/fill, etc.). These end up in `geometry.properties` and are the primary way to store type-specific data (e.g. text content, stroke widths per path).
- **`getStyleProperties()`** (override optional): default returns `this.paperItem.style.toJSON()`; these are merged into **feature** `properties` along with label, selected, userdata.

So:

- **Geometry:** `type`, `coordinates`, and **`properties`** (from `getProperties()` + optional `subtype`) live in the GeoJSON geometry.
- **Feature:** `properties` holds style (from `getStyleProperties()`), label, selected, userdata.

Type-specific “extra” data (text, per-path widths, etc.) belongs in **geometry.properties** via `getProperties()` and is read in the constructor from `geoJSON.geometry.properties`.

### 2.3 Type and subtype

- **`getGeoJSONType()`** (override in subclass): return `{ type: '...', subtype: '...' }` (subtype optional). Used for serialization and for `this.type` / `this.subtype` accessors.
- **`static supportsGeoJSONType(type, subtype)`** (override in subclass): return whether this class can deserialize a feature with that `geometry.type` and `geometry.properties.subtype`. Used by `AnnotationItemFactory.getConstructor(geoJSON)` so the correct class is chosen on load.

---

## 3. PointText: position + text (canonical “non-neat” example)

### 3.1 Geometry and extra data

- **Type:** Point (one position).
- **Extra data:** text **content** (not derivable from geometry).
- Content is stored in **geometry.properties**: `geometry.properties.content`.

### 3.2 Save ([pointtext.mjs](src/js/paperitems/pointtext.mjs))

- **`getCoordinates()`:** returns `[circle.bounds.center.x, circle.bounds.center.y]` (the point position).
- **`getProperties()`:** returns `{ content: item.children[1].content }`.
- **`getGeoJSONType()`:** returns `{ type: 'Point', subtype: 'PointText' }`.
- So saved geometry: `type: 'Point'`, `coordinates: [x, y]`, `properties: { subtype: 'PointText', content: '...' }`. Style is in feature.properties via base `getStyleProperties()`.

### 3.3 Load (constructor)

- **Constructor** receives full GeoJSON feature.
- Reads **position** from `geoJSON.geometry.coordinates` (slice 0,1 for x,y).
- Reads **text** from `geoJSON.geometry.properties.content || 'PointText'` and passes it into the PointText child.
- Builds the paper item (group with circle + PointText), sets position, then `this.paperItem = point`, which triggers conversion and style application from `feature.properties` (_props).

Pattern: **geometry = position/shape; geometry.properties = type-specific data (content); feature.properties = style, label, userdata.**

---

## 4. MultiLinestring (what Ruler uses)

### 4.1 Current save ([multilinestring.mjs](src/js/paperitems/multilinestring.mjs))

- **`getCoordinates()`:** iterates `this.paperItem.children`; for each child uses `_getPathFromChild(c)` (Group with 4 children → `children[1]`, else the child). Returns array of linestrings: each linestring = array of `[s.point.x, s.point.y]` for that path’s segments.
- **`getProperties()`:** returns `{ strokeColor, strokeWidths }` where `strokeWidths` is per-path (from each path’s `strokeWidth`). So geometry.properties carry **per-segment styling** (stroke widths) and shared stroke color.
- **`getGeoJSONType()`:** returns `{ type: 'MultiLineString' }` (no subtype).
- **`static supportsGeoJSONType(type, subtype)`:** `type === 'multilinestring' && subtype === null`.

So ruler segments are already saved as MultiLineString: coordinates from the main path of each 4-child group, and stroke color/widths in geometry.properties.

### 4.2 Current load (constructor)

- **Constructor** expects `geoJSON.geometry.type === 'MultiLineString'`.
- **Coordinates:** `geoJSON.geometry.coordinates` = array of linestrings (each linestring = array of [x,y]).
- **Properties:** `geoJSON.geometry.properties.strokeWidths[index]` used for each path’s `strokeWidth`.
- It builds **bare `paper.Path`** instances and adds them to a Group; it does **not** build the 4-child (halo, path, strokeLabel, fillLabel) structure. So after load we have a Group of Paths.

The **Ruler tool** then normalizes when the user selects that item: in `onSelectionChanged`, when `mode === 'modifying'` and the item has children, it calls **`_ensureItemLabels()`**, which replaces each bare Path with a 4-child segment group (halo, path, stroke label, fill label). So load produces “legacy” bare paths; the tool backfills to the 4-child structure when the ruler is active and that item is selected.

---

## 5. Raster: rich custom structure (GeometryCollection)

- **Type:** GeometryCollection, **subtype:** Raster.
- **Save:** `toGeoJSONGeometry()` is **overridden**. It does not use the default `getCoordinates()`/`getProperties()` pattern; it builds a custom `geometry.properties` (raster image data, center, size, transform) and `geometry.geometries` (clip shapes as nested geometries). So for very rich or nested data, a subclass can override **`toGeoJSONGeometry()`** (and the constructor) and still work with the same save/load pipeline.
- **Load:** Constructor reads `geoJSON.geometry.properties.raster` and `geoJSON.geometry.geometries`, rebuilds the raster and clip group, and sets `this.paperItem = grp`.

Takeaway: when the default geometry shape (type + coordinates + getProperties()) is not enough, override **`toGeoJSONGeometry()`** and the constructor to read that custom shape; keep using the same Feature structure and `paper.Item.fromGeoJSON` / `toGeoJSONFeature()`.

---

## 6. Registration and factory

- **Registration:** In [annotationtoolkit.mjs](src/js/annotationtoolkit.mjs), all AnnotationItem classes are registered with `AnnotationItemFactory.register(Ctor)` (MultiLinestring, PointText, etc.).
- **Resolving on load:** `AnnotationItemFactory.getConstructor(geoJSON)` uses `geoJSON.geometry.type` and `geoJSON.geometry.properties.subtype` and returns the **last** registered constructor that returns true for `supportsGeoJSONType(type, subtype)`. So if both Point and PointText support Point, the one registered **later** wins for Point; subtype is used to distinguish Point (subtype null) vs PointText (subtype 'PointText').

Ruler does **not** register a new AnnotationItem class; it uses **MultiLinestring**. So ruler annotations are saved and loaded as MultiLineString features. No new type/subtype is required for basic save/load.

---

## 7. Patterns the Ruler must follow

1. **Use the existing item type:** Ruler uses **MultiLinestring**. Save/load already go through `item.annotationItem.toGeoJSONFeature()` and `paper.Item.fromGeoJSON(feature)`. No new AnnotationItem class is required for coordinates + stroke.

2. **Geometry vs feature properties:**
   - **Geometry:** coordinates (segment paths) + **geometry.properties** for type-specific data (MultiLinestring already uses strokeColor, strokeWidths).
   - **Feature.properties:** label, selected, style (from getStyleProperties()), userdata. Optional tool-specific UI state (e.g. units, unitsPerPixel) can live in **feature.properties.userdata** so they round-trip without changing the geometry schema.

3. **Backfill after load:** MultiLinestring constructor intentionally builds bare Paths. The Ruler tool’s **`_ensureItemLabels()`** converts them to 4-child groups when the item is selected with the ruler active. So load → bare Paths; first time the user selects that item with the ruler → backfill to halo/path/labels. This is consistent with the codebase (e.g. _ensureItemLabels already handles “Path → replace with 4-child group”).

4. **Extra ruler-specific data (optional):** If you want to save/restore **label unit** or **units per pixel**, two options consistent with existing patterns:
   - **geometry.properties:** Add them in MultiLinestring’s **`getProperties()`** (and read in MultiLinestring constructor). Then they are part of the geometry and round-trip with the feature. (Requires extending MultiLinestring for ruler-specific props if you don’t want to add them for all MultiLineStrings.)
   - **feature.properties.userdata:** Store e.g. `{ labelUnit: 'px', unitsPerPixel: 1 }` in userdata when saving; when loading a ruler item, the app or tool can read `feature.properties.userdata` and apply it to the toolbar. Same pattern as other optional metadata.

5. **Do not bypass the AnnotationItem:** Save must come from `annotationItem.toGeoJSONFeature()`. Load must go through `paper.Item.fromGeoJSON(feature)` so the correct AnnotationItem constructor runs and the paper item is registered and styled. The Ruler tool only adds/edits **children** of that paper item (segment groups); it does not replace the root item type.

---

## 8. Summary table

| Concern              | PointText              | MultiLinestring (Ruler)      | Raster                    |
|----------------------|------------------------|-----------------------------|---------------------------|
| Geometry type        | Point                  | MultiLineString             | GeometryCollection        |
| Subtype              | PointText              | null                        | Raster                    |
| Extra data           | content                | strokeColor, strokeWidths   | raster data, clip geoms   |
| Where extra data     | geometry.properties    | geometry.properties         | geometry.properties/geometries |
| Save entry           | getCoordinates, getProperties | same                     | toGeoJSONGeometry override |
| Load entry           | constructor reads geometry + geometry.properties | constructor reads coords + strokeWidths | constructor reads custom geom |
| Backfill / normalize | —                      | Ruler _ensureItemLabels()  | —                         |

The Ruler implementation should keep using **MultiLinestring** for save/load, rely on **getCoordinates** / **getProperties** (already implemented) for export, and rely on **MultiLinestring constructor** plus **Ruler _ensureItemLabels()** for import. Any extra ruler-only fields (units, etc.) can go in **geometry.properties** (if MultiLinestring is extended) or **feature.properties.userdata** (if shared with other tools).

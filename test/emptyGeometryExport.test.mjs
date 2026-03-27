/**
 * Empty-coordinate export pipeline: `validateGeoJSONGeometry` skips empty `coordinates` (same path as
 * incomplete Placeholder-driven items before the user draws). Full `AnnotationItem` + `toGeoJSONGeometry()`
 * smoke tests require a browser (OpenSeadragon + DOM + module graph); draw tools are covered manually.
 */
import assert from 'node:assert';
import { validateGeoJSONGeometry } from '../src/js/utils/geojsonGeometryShape.mjs';

for (const type of ['Point', 'Polygon', 'MultiPolygon', 'LineString', 'MultiLineString']) {
    assert.strictEqual(
        validateGeoJSONGeometry({ type, coordinates: [] }).ok,
        true,
        `empty coordinates should skip validation for ${type}`,
    );
}

assert.strictEqual(validateGeoJSONGeometry({ type: null, coordinates: [] }).ok, true);

console.log('emptyGeometryExport tests passed');

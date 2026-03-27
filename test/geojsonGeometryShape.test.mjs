/**
 * Minimal regression tests for RFC 7946 coordinate nesting vs geometry.type.
 * Run: node test/geojsonGeometryShape.test.mjs
 */
import assert from 'node:assert';
import {
    coordinatesMatchGeometryType,
    validateGeoJSONGeometry,
} from '../src/js/utils/geojsonGeometryShape.mjs';

const ring = [[0, 0], [1, 0], [1, 1], [0, 0]];
const polygonCoords = [ring];
const multiPolygonOnePoly = [[ring]];

// Valid Polygon vs MultiPolygon-shaped nesting (wrong type label)
assert.strictEqual(coordinatesMatchGeometryType('Polygon', polygonCoords), true);
assert.strictEqual(coordinatesMatchGeometryType('Polygon', multiPolygonOnePoly), false);

// Valid MultiPolygon with one polygon (still 3-level nesting under each polygon)
assert.strictEqual(coordinatesMatchGeometryType('MultiPolygon', multiPolygonOnePoly), true);
assert.strictEqual(coordinatesMatchGeometryType('MultiPolygon', polygonCoords), false);

assert.strictEqual(validateGeoJSONGeometry({ type: 'Polygon', coordinates: polygonCoords }).ok, true);
assert.strictEqual(validateGeoJSONGeometry({ type: 'Polygon', coordinates: multiPolygonOnePoly }).ok, false);
assert.strictEqual(validateGeoJSONGeometry({ type: 'MultiPolygon', coordinates: multiPolygonOnePoly }).ok, true);

// LineString vs MultiLineString depth
assert.strictEqual(
    coordinatesMatchGeometryType('LineString', [[0, 0], [1, 1]]),
    true,
);
assert.strictEqual(
    coordinatesMatchGeometryType('LineString', [[[0, 0], [1, 1]]]),
    false,
);
assert.strictEqual(
    coordinatesMatchGeometryType('MultiLineString', [[[0, 0], [1, 1]]]),
    true,
);

console.log('geojsonGeometryShape tests passed');

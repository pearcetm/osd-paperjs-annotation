/**
 * Run: node test/geojson-to-mesh.test.mjs
 */
import assert from 'node:assert';
import { featureCollectionToMeshes, featureToPolygonMesh } from '../src/js/webgl/geojson-to-mesh.mjs';

{
    const mesh = featureToPolygonMesh({
        type: 'Feature',
        geometry: {
            type: 'Polygon',
            coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
        },
        properties: { fillColor: '#ff0000', fillOpacity: 0.5 },
    }, {}, 0, 0);
    assert.ok(mesh);
    assert.ok(mesh.indices.length >= 3);
    assert.strictEqual(mesh.positions.length, mesh.colors.length / 2);
}

{
    const fc = featureCollectionToMeshes({
        type: 'FeatureCollection',
        features: [
            {
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [5, 5] },
                properties: { fillColor: '#00ff00' },
            },
            {
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: [[0, 0], [10, 10]],
                },
                properties: { strokeColor: '#0000ff' },
            },
        ],
    }, { x: 0, y: 0 });
    assert.strictEqual(fc.point.positions.length, 2);
    assert.ok(fc.line.indices.length >= 2);
}

console.log('geojson-to-mesh.test.mjs: ok');

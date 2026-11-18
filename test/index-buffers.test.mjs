/**
 * Run: node test/index-buffers.test.mjs
 */
import assert from 'node:assert';
import {
    MAX_UINT16_INDEX,
    MAX_UINT16_VERTICES,
    chunkIndexedMesh,
    maxIndexValue,
    needsUint32Indices,
} from '../src/js/webgl/index-buffers.mjs';

{
    // Demo-scale: many indices, but all values fit in uint16 (10923 quads).
    const quads = 10923;
    const indices = [];
    for (let q = 0; q < quads; q += 1) {
        const b = q * 4;
        indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    assert.strictEqual(indices.length, quads * 6);
    assert.ok(indices.length > MAX_UINT16_INDEX);
    assert.strictEqual(maxIndexValue(indices), quads * 4 - 1);
    assert.strictEqual(needsUint32Indices(indices), false, 'length alone must not force uint32');
}

{
    // Past 65536 unique vertices requires uint32 (or chunking).
    const verts = MAX_UINT16_VERTICES + 10;
    const indices = [];
    for (let i = 0; i < verts - 2; i += 1) {
        indices.push(0, i + 1, i + 2);
    }
    assert.ok(maxIndexValue(indices) > MAX_UINT16_INDEX);
    assert.strictEqual(needsUint32Indices(indices), true);
}

{
    // Chunking remaps into uint16-safe local indices and preserves topology.
    const positions = [];
    const colors = [];
    const n = MAX_UINT16_VERTICES + 100;
    for (let i = 0; i < n; i += 1) {
        positions.push(i, i + 0.5);
        colors.push(1, 0, 0, 1);
    }
    const indices = [];
    for (let i = 0; i < n - 2; i += 1) {
        indices.push(i, i + 1, i + 2);
    }
    const chunks = chunkIndexedMesh(positions, colors, indices, 3);
    assert.ok(chunks.length >= 2, 'expected multiple chunks');
    let totalTris = 0;
    chunks.forEach((chunk) => {
        assert.ok(chunk.positions.length / 2 <= MAX_UINT16_VERTICES);
        assert.ok(maxIndexValue(chunk.indices) <= MAX_UINT16_INDEX);
        assert.strictEqual(chunk.indices.length % 3, 0);
        totalTris += chunk.indices.length / 3;
        // Remapped indices address local positions.
        chunk.indices.forEach((idx) => {
            assert.ok(idx < chunk.positions.length / 2);
        });
    });
    assert.strictEqual(totalTris, indices.length / 3);
}

{
    // Lines: primSize 2
    const positions = [0, 0, 1, 1, 2, 2, 3, 3];
    const colors = [1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1, 1, 1, 0, 1];
    const normals = [0, 1, 0, 1, 0, 1, 0, 1];
    const indices = [0, 1, 1, 2, 2, 3];
    const chunks = chunkIndexedMesh(positions, colors, indices, 2, normals);
    assert.strictEqual(chunks.length, 1);
    assert.strictEqual(chunks[0].indices.length, 6);
    assert.ok(chunks[0].normals);
    assert.strictEqual(chunks[0].normals.length, chunks[0].positions.length);
}

console.log('index-buffers.test.mjs: ok');

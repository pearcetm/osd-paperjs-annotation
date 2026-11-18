/**
 * Element-index sizing helpers for indexed drawElements meshes.
 * Uint16 can address vertices 0..65535; array *length* may exceed 65535.
 */

export const MAX_UINT16_INDEX = 65535;
export const MAX_UINT16_VERTICES = 65536;

/**
 * @param {ArrayLike<number>} indices
 * @returns {number}
 */
export function maxIndexValue(indices) {
    let max = 0;
    for (let i = 0; i < indices.length; i += 1) {
        const v = indices[i];
        if (v > max) {
            max = v;
        }
    }
    return max;
}

/**
 * @param {ArrayLike<number>} indices
 * @returns {boolean}
 */
export function needsUint32Indices(indices) {
    return indices.length > 0 && maxIndexValue(indices) > MAX_UINT16_INDEX;
}

/**
 * Split an indexed mesh into chunks whose remapped indices fit in Uint16.
 * Used when uint32 element indices are unavailable.
 *
 * @param {number[]} positions flat x,y
 * @param {number[]|null} colors flat r,g,b,a (or null)
 * @param {number[]} indices
 * @param {number} primSize 3 for triangles, 2 for lines
 * @param {number[]|null} [normals] flat nx,ny for lines
 * @returns {{ positions: number[], colors: number[]|null, normals: number[]|null, indices: number[] }[]}
 */
export function chunkIndexedMesh(positions, colors, indices, primSize, normals = null) {
    const chunks = [];
    let localPos = [];
    let localCol = colors ? [] : null;
    let localNorm = normals ? [] : null;
    let localIdx = [];
    /** @type {Map<number, number>} */
    let map = new Map();

    const flush = () => {
        if (!localIdx.length) {
            return;
        }
        chunks.push({
            positions: localPos,
            colors: localCol,
            normals: localNorm,
            indices: localIdx,
        });
        localPos = [];
        localCol = colors ? [] : null;
        localNorm = normals ? [] : null;
        localIdx = [];
        map = new Map();
    };

    /**
     * @param {number} gi
     * @returns {number}
     */
    const addVert = (gi) => {
        const existing = map.get(gi);
        if (existing !== undefined) {
            return existing;
        }
        const li = map.size;
        map.set(gi, li);
        const po = gi * 2;
        localPos.push(positions[po], positions[po + 1]);
        if (localCol) {
            const co = gi * 4;
            localCol.push(colors[co], colors[co + 1], colors[co + 2], colors[co + 3]);
        }
        if (localNorm) {
            const no = gi * 2;
            localNorm.push(normals[no], normals[no + 1]);
        }
        return li;
    };

    for (let i = 0; i + primSize - 1 < indices.length; i += primSize) {
        const uniqueNew = new Set();
        for (let j = 0; j < primSize; j += 1) {
            const gi = indices[i + j];
            if (!map.has(gi)) {
                uniqueNew.add(gi);
            }
        }
        if (map.size + uniqueNew.size > MAX_UINT16_VERTICES) {
            flush();
        }
        for (let j = 0; j < primSize; j += 1) {
            localIdx.push(addVert(indices[i + j]));
        }
    }
    flush();
    return chunks;
}

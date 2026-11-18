/**
 * GeoJSON → GPU mesh data for WebglFeatureOverlay.
 */

import earcut from '../utils/earcut.mjs';

/**
 * @param {string|object} color
 * @returns {{ r: number, g: number, b: number }}
 */
function parseCssColor(color) {
    if (typeof color === 'object' && color?.r !== undefined) {
        return {
            r: color.r <= 1 ? color.r : color.r / 255,
            g: color.g <= 1 ? color.g : color.g / 255,
            b: color.b <= 1 ? color.b : color.b / 255,
        };
    }
    const str = String(color).trim();
    if (str.startsWith('#')) {
        const hex = str.slice(1);
        const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
        const n = parseInt(full, 16);
        return {
            r: ((n >> 16) & 255) / 255,
            g: ((n >> 8) & 255) / 255,
            b: (n & 255) / 255,
        };
    }
    if (typeof document !== 'undefined') {
        const canvas = parseCssColor._canvas || (parseCssColor._canvas = document.createElement('canvas'));
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#000000';
        ctx.fillStyle = str;
        return parseCssColor(ctx.fillStyle);
    }
    return { r: 0, g: 0, b: 0 };
}

/**
 * @param {object} props
 * @param {object} [defaultStyle]
 * @returns {{ r: number, g: number, b: number, a: number }}
 */
function styleFromFeature(props, defaultStyle = {}) {
    const fillColor = props.fillColor || props.strokeColor || defaultStyle.fillColor || '#00ff0080';
    const fillOpacity = props.fillOpacity !== undefined
        ? props.fillOpacity
        : (props.strokeOpacity !== undefined ? props.strokeOpacity : (defaultStyle.fillOpacity ?? 0.5));
    const rgb = parseCssColor(fillColor);
    return { ...rgb, a: fillOpacity };
}

/**
 * Expand rectangle/ellipse subtype to polygon rings.
 * @param {object} geometry
 * @returns {number[][][]|null}
 */
function expandSubtypeGeometry(geometry) {
    const subtype = geometry.properties?.subtype;
    if (!subtype) {
        return null;
    }
    const coords = geometry.coordinates;
    if (geometry.type === 'Point' && subtype === 'Rectangle') {
        const x = coords[0] || 0;
        const y = coords[1] || 0;
        const props = geometry.properties || {};
        const w = props.width || 0;
        const h = props.height || 0;
        const angle = ((props.angle || 0) * Math.PI) / 180;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const corners = [
            [-w / 2, -h / 2],
            [w / 2, -h / 2],
            [w / 2, h / 2],
            [-w / 2, h / 2],
        ].map(([dx, dy]) => [x + dx * cos - dy * sin, y + dx * sin + dy * cos]);
        corners.push(corners[0]);
        return [[corners]];
    }
    if (geometry.type === 'Point' && subtype === 'Ellipse') {
        const x = coords[0] || 0;
        const y = coords[1] || 0;
        const props = geometry.properties || {};
        const rx = (props.width || 0) / 2;
        const ry = (props.height || 0) / 2;
        const angle = ((props.angle || 0) * Math.PI) / 180;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const ring = [];
        const segments = 32;
        for (let i = 0; i <= segments; i += 1) {
            const t = (i / segments) * Math.PI * 2;
            const dx = rx * Math.cos(t);
            const dy = ry * Math.sin(t);
            ring.push([x + dx * cos - dy * sin, y + dx * sin + dy * cos]);
        }
        return [[ring]];
    }
    return null;
}

/**
 * @param {object} geometry
 * @returns {number[][][]}
 */
function polygonRingsFromGeometry(geometry) {
    const expanded = expandSubtypeGeometry(geometry);
    if (expanded) {
        return expanded;
    }
    const type = geometry.type;
    if (type === 'Polygon') {
        return [geometry.coordinates];
    }
    if (type === 'MultiPolygon') {
        return geometry.coordinates;
    }
    return [];
}

/**
 * @param {number[][]} polygonRings
 * @param {number} ox
 * @param {number} oy
 * @param {number[]} outVerts
 * @param {number[]} outColors
 * @param {number[]} outIndices
 * @param {{ r: number, g: number, b: number, a: number }} color
 */
function triangulatePolygon(polygonRings, ox, oy, outVerts, outColors, outIndices, color) {
    const flat = [];
    const holes = [];
    let holeIndex = 0;
    polygonRings.forEach((ring, ri) => {
        if (ri > 0) {
            holes.push(holeIndex);
        }
        for (let i = 0; i < ring.length; i += 1) {
            const pt = ring[i];
            flat.push(pt[0] - ox, pt[1] - oy);
            holeIndex += 1;
        }
    });
    if (flat.length < 6) {
        return;
    }
    const tris = earcut(flat, holes, 2);
    const baseVertex = outVerts.length / 2;
    for (let i = 0; i < flat.length; i += 2) {
        outVerts.push(flat[i], flat[i + 1]);
        outColors.push(color.r, color.g, color.b, color.a);
    }
    for (let i = 0; i < tris.length; i += 1) {
        outIndices.push(baseVertex + tris[i]);
    }
}

/**
 * @param {object} feature
 * @param {object} defaultStyle
 * @param {number} ox
 * @param {number} oy
 * @returns {{ positions: number[], colors: number[], indices: number[], bbox: number[] }|null}
 */
export function featureToPolygonMesh(feature, defaultStyle, ox, oy) {
    const geometry = feature.geometry;
    if (!geometry) {
        return null;
    }
    const rings = polygonRingsFromGeometry(geometry);
    if (!rings.length) {
        return null;
    }
    const color = styleFromFeature(feature.properties || {}, defaultStyle);
    const positions = [];
    const colors = [];
    const indices = [];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    rings.forEach((polygon) => {
        triangulatePolygon(polygon, ox, oy, positions, colors, indices, color);
        polygon.forEach((ring) => {
            ring.forEach((pt) => {
                minX = Math.min(minX, pt[0]);
                minY = Math.min(minY, pt[1]);
                maxX = Math.max(maxX, pt[0]);
                maxY = Math.max(maxY, pt[1]);
            });
        });
    });

    if (!indices.length) {
        return null;
    }
    return { positions, colors, indices, bbox: [minX, minY, maxX, maxY] };
}

/**
 * @param {object} feature
 * @param {object} defaultStyle
 * @param {number} ox
 * @param {number} oy
 * @returns {{ positions: number[], normals: number[], colors: number[], indices: number[], bbox: number[] }|null}
 */
export function featureToLineMesh(feature, defaultStyle, ox, oy) {
    const geometry = feature.geometry;
    if (!geometry) {
        return null;
    }
    const type = geometry.type;
    const lines = type === 'LineString' ? [geometry.coordinates]
        : type === 'MultiLineString' ? geometry.coordinates : [];
    if (!lines.length) {
        return null;
    }
    const props = feature.properties || {};
    const strokeColor = props.strokeColor || defaultStyle.strokeColor || '#000000';
    const strokeOpacity = props.strokeOpacity !== undefined ? props.strokeOpacity : (defaultStyle.strokeOpacity ?? 1);
    const { r, g, b } = parseCssColor(strokeColor);
    const color = { r, g, b, a: strokeOpacity };
    const positions = [];
    const normals = [];
    const colors = [];
    const indices = [];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let vertexBase = 0;

    lines.forEach((line) => {
        if (!line || line.length < 2) {
            return;
        }
        for (let i = 0; i < line.length - 1; i += 1) {
            const a = line[i];
            const b = line[i + 1];
            const ax = a[0] - ox;
            const ay = a[1] - oy;
            const bx = b[0] - ox;
            const by = b[1] - oy;
            const dx = bx - ax;
            const dy = by - ay;
            const len = Math.hypot(dx, dy) || 1;
            const nx = -dy / len;
            const ny = dx / len;
            positions.push(ax, ay, bx, by);
            normals.push(nx, ny, nx, ny);
            colors.push(color.r, color.g, color.b, color.a, color.r, color.g, color.b, color.a);
            indices.push(vertexBase, vertexBase + 1);
            vertexBase += 2;
            [a, b].forEach((pt) => {
                minX = Math.min(minX, pt[0]);
                minY = Math.min(minY, pt[1]);
                maxX = Math.max(maxX, pt[0]);
                maxY = Math.max(maxY, pt[1]);
            });
        }
    });

    if (!indices.length) {
        return null;
    }
    return { positions, normals, colors, indices, bbox: [minX, minY, maxX, maxY] };
}

/**
 * @param {object} feature
 * @param {object} defaultStyle
 * @param {number} ox
 * @param {number} oy
 * @returns {{ positions: number[], colors: number[], bbox: number[] }|null}
 */
export function featureToPointMesh(feature, defaultStyle, ox, oy) {
    const geometry = feature.geometry;
    if (!geometry || geometry.type !== 'Point') {
        return null;
    }
    if (geometry.properties?.subtype) {
        return null;
    }
    const coords = geometry.coordinates;
    const props = feature.properties || {};
    const fillColor = props.fillColor || props.strokeColor || defaultStyle.fillColor || '#ff0000';
    const fillOpacity = props.fillOpacity !== undefined ? props.fillOpacity : 1;
    const { r, g, b } = parseCssColor(fillColor);
    return {
        positions: [coords[0] - ox, coords[1] - oy],
        colors: [r, g, b, fillOpacity],
        bbox: [coords[0], coords[1], coords[0], coords[1]],
    };
}

/**
 * @param {object} fc
 * @param {{ x: number, y: number }} origin
 * @returns {{ polygon: object, line: object, point: object, features: object[] }}
 */
export function featureCollectionToMeshes(fc, origin) {
    const defaultStyle = fc.properties?.defaultStyle || {};
    const ox = origin.x;
    const oy = origin.y;
    const polygon = { positions: [], colors: [], indices: [] };
    const line = { positions: [], normals: [], colors: [], indices: [] };
    const point = { positions: [], colors: [] };
    const features = [];

    (fc.features || []).forEach((feature, index) => {
        const geomType = feature.geometry?.type;
        let mesh = null;
        if (geomType === 'Polygon' || geomType === 'MultiPolygon' ||
            (geomType === 'Point' && feature.geometry.properties?.subtype)) {
            mesh = featureToPolygonMesh(feature, defaultStyle, ox, oy);
            if (mesh) {
                const base = polygon.positions.length / 2;
                polygon.positions.push(...mesh.positions);
                polygon.colors.push(...mesh.colors);
                mesh.indices.forEach((idx) => polygon.indices.push(idx + base));
            }
        } else if (geomType === 'LineString' || geomType === 'MultiLineString') {
            mesh = featureToLineMesh(feature, defaultStyle, ox, oy);
            if (mesh) {
                const base = line.positions.length / 2;
                line.positions.push(...mesh.positions);
                line.normals.push(...mesh.normals);
                line.colors.push(...mesh.colors);
                mesh.indices.forEach((idx) => line.indices.push(idx + base));
            }
        } else if (geomType === 'Point') {
            mesh = featureToPointMesh(feature, defaultStyle, ox, oy);
            if (mesh) {
                point.positions.push(...mesh.positions);
                point.colors.push(...mesh.colors);
            }
        }
        if (mesh) {
            features.push({ index, bbox: mesh.bbox, feature });
        }
    });

    return { polygon, line, point, features };
}

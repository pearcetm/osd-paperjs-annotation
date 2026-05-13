/**
 * Minimal RFC 7946 coordinate-structure checks for GeoJSON Geometry `coordinates`.
 * Aligned with RFC 7946 Geometry object `coordinates` definitions.
 * Validates nesting (Polygon vs MultiPolygon, etc.), not ring orientation, bbox, or right-hand rule.
 * @see https://datatracker.ietf.org/doc/html/rfc7946#section-3.1
 */

/**
 * @param {unknown} pos
 * @returns {boolean}
 */
function isPosition(pos) {
    if (!Array.isArray(pos) || pos.length < 2) return false;
    const [x, y, z] = pos;
    if (typeof x !== 'number' || typeof y !== 'number') return false;
    if (pos.length === 2) return true;
    if (pos.length === 3) return typeof z === 'number';
    return false;
}

/**
 * Linear ring: closed loop; RFC requires >= 4 positions.
 * @param {unknown} ring
 * @returns {boolean}
 */
function isLinearRing(ring) {
    if (!Array.isArray(ring) || ring.length < 4) return false;
    return ring.every(isPosition);
}

/**
 * @param {unknown} coords
 * @returns {boolean}
 */
function isPolygonCoordinates(coords) {
    if (!Array.isArray(coords)) return false;
    return coords.every(isLinearRing);
}

/**
 * @param {unknown} coords
 * @returns {boolean}
 */
function isMultiPolygonCoordinates(coords) {
    if (!Array.isArray(coords)) return false;
    return coords.every((polygon) => isPolygonCoordinates(polygon));
}

/**
 * @param {unknown} coords
 * @returns {boolean}
 */
function isLineStringCoordinates(coords) {
    if (!Array.isArray(coords) || coords.length < 2) return false;
    return coords.every(isPosition);
}

/**
 * @param {unknown} coords
 * @returns {boolean}
 */
function isMultiLineStringCoordinates(coords) {
    if (!Array.isArray(coords)) return false;
    return coords.every((line) => isLineStringCoordinates(line));
}

/**
 * @param {unknown} coords
 * @returns {boolean}
 */
function isMultiPointCoordinates(coords) {
    if (!Array.isArray(coords)) return false;
    return coords.every(isPosition);
}

/**
 * Returns whether `coordinates` matches the RFC 7946 array shape for `type`.
 * @param {string|null|undefined} type - GeoJSON geometry type
 * @param {unknown} coordinates
 * @returns {boolean}
 */
export function coordinatesMatchGeometryType(type, coordinates) {
    if (type == null || type === 'GeometryCollection') return true;
    const t = String(type);
    switch (t) {
        case 'Point':
            return isPosition(coordinates);
        case 'MultiPoint':
            return isMultiPointCoordinates(coordinates);
        case 'LineString':
            return isLineStringCoordinates(coordinates);
        case 'MultiLineString':
            return isMultiLineStringCoordinates(coordinates);
        case 'Polygon':
            return isPolygonCoordinates(coordinates);
        case 'MultiPolygon':
            return isMultiPolygonCoordinates(coordinates);
        default:
            return true;
    }
}

/**
 * Structural check only: `coordinates` array depth vs `type`. Skips `GeometryCollection` and missing/empty coordinates.
 * @param {Object} geom - GeoJSON-like object with optional `type`, `coordinates`, `geometries`
 * @returns {Object} `{ ok: boolean }` and optional `message` (string) when `ok` is false
 */
export function validateGeoJSONGeometry(geom) {
    if (!geom || geom.type === 'GeometryCollection') return { ok: true };
    const type = geom.type;
    const coordinates = geom.coordinates;
    if (type == null) return { ok: true };
    if (coordinates === undefined || coordinates === null) return { ok: true };
    if (Array.isArray(coordinates) && coordinates.length === 0) return { ok: true };

    if (coordinatesMatchGeometryType(type, coordinates)) return { ok: true };
    return {
        ok: false,
        message: `GeoJSON coordinates nesting does not match RFC 7946 for geometry type "${type}".`,
    };
}

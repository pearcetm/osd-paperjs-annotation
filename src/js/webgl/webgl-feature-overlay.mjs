/**
 * WebGL batched vector overlay synced to OpenSeadragon viewport.
 * @version 0.7.6
 */

import { OpenSeadragon } from '../osd-loader.mjs';
import {
    bindViewerOverlayEvents,
    bringOverlayToFront,
    createOverlayCanvas,
    registerOverlay,
    resizeOverlayCanvas,
    unregisterOverlay,
} from '../overlays/overlay-dom.mjs';
import {
    computeImageToClipMatrix,
    defaultImageOrigin,
    getPrimaryTiledImage,
} from './camera-from-osd.mjs';
import { featureCollectionToMeshes } from './geojson-to-mesh.mjs';
import { FeatureBatch } from './feature-batch.mjs';
import { createProgram, createWebGLContext } from './gl-utils.mjs';
import { polygonVertexShader, polygonFragmentShader } from './programs/polygon.mjs';
import { imagePixelToClip } from './camera-from-osd.mjs';

const REGISTRY_KEY = 'WebglFeatureOverlays';

/**
 * @class
 * @memberof OSDPaperjsAnnotation
 * @extends OpenSeadragon.EventSource
 */
export class WebglFeatureOverlay extends OpenSeadragon.EventSource {
    /**
     * @param {OpenSeadragon.Viewer} viewer
     * @param {object} [opts]
     * @param {string} [opts.overlayType='image']
     */
    constructor(viewer, opts = {}) {
        super();
        const defaultOpts = { overlayType: 'image' };
        opts = OpenSeadragon.extend(true, defaultOpts, opts);

        this.viewer = viewer;
        this.overlayType = opts.overlayType;
        this.destroyed = false;
        this._collections = new Map();
        this._origin = { x: 0, y: 0 };

        registerOverlay(viewer, REGISTRY_KEY, this);

        const { div, canvas } = createOverlayCanvas(viewer, 'webgl-feature-overlay');
        this._canvasdiv = div;
        this._canvas = canvas;

        const gl = createWebGLContext(canvas);
        this._gl = gl;
        gl.enable(gl.BLEND);
        // Premultiplied source: ONE, ONE_MINUS_SRC_ALPHA (matches canvas premultipliedAlpha: true).
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        this._debugProgram = createProgram(gl, polygonVertexShader, polygonFragmentShader);
        this._debugStroke = { width: 3, rescale: true };

        this._onContextLost = (e) => {
            e.preventDefault();
            this._contextLost = true;
        };
        this._onContextRestored = () => {
            this._contextLost = false;
            this._rebuildAllBatches();
            this._draw();
        };
        canvas.addEventListener('webglcontextlost', this._onContextLost);
        canvas.addEventListener('webglcontextrestored', this._onContextRestored);

        this._containerWidth = 0;
        this._containerHeight = 0;
        this._currentScaleFactor = 1;

        this._onViewportChange = () => this._draw();
        this._onResize = () => {
            this._resize();
            this._draw();
        };
        this._onTiledImageBoundsChange = () => this._draw();
        this._tiledImageHandlers = new Map();

        this._unbindEvents = bindViewerOverlayEvents(
            viewer,
            this,
            this._onViewportChange,
            this._onResize
        );

        this._onWorldAddItem = (ev) => this._bindTiledImage(ev.item);
        this._onWorldRemoveItem = (ev) => this._unbindTiledImage(ev.item);
        viewer.world.addHandler('add-item', this._onWorldAddItem);
        viewer.world.addHandler('remove-item', this._onWorldRemoveItem);
        for (let i = 0; i < viewer.world.getItemCount(); i += 1) {
            this._bindTiledImage(viewer.world.getItemAt(i));
        }

        this._resize();
        this._draw();
    }

    get scaleFactor() {
        return this._currentScaleFactor;
    }

    /**
     * @param {boolean} [enabled=true]
     */
    setPointerEventsEnabled(enabled = true) {
        if (this._canvasdiv) {
            this._canvasdiv.style.pointerEvents = enabled ? 'auto' : 'none';
        }
    }

    bringToFront() {
        bringOverlayToFront(this.viewer, REGISTRY_KEY, this);
    }

    canvas() {
        return this._canvas;
    }

    /**
     * @param {object[]} fcs
     */
    loadFeatureCollections(fcs) {
        this.clear();
        (fcs || []).forEach((fc) => {
            const id = fc.properties?.id || fc.label || `fc-${this._collections.size + 1}`;
            this.replaceFeatureCollection(id, fc);
        });
    }

    /**
     * @param {string} id
     * @param {object} fc
     */
    replaceFeatureCollection(id, fc) {
        const existing = this._collections.get(id);
        if (existing?.batch) {
            existing.batch.destroy();
        }
        const stored = {
            id,
            fc: JSON.parse(JSON.stringify(fc)),
            visible: true,
            opacity: 1,
            batch: null,
        };
        stored.fc.properties = stored.fc.properties || {};
        stored.fc.properties.id = id;
        this._collections.set(id, stored);
        this._rebuildBatch(id);
        this._draw();
    }

    /**
     * @param {string} id
     */
    removeFeatureCollection(id) {
        const entry = this._collections.get(id);
        if (!entry) {
            return;
        }
        entry.batch?.destroy();
        this._collections.delete(id);
        this._draw();
    }

    /**
     * @param {string} id
     * @param {boolean} visible
     */
    setFeatureCollectionVisible(id, visible) {
        const entry = this._collections.get(id);
        if (!entry) {
            return;
        }
        entry.visible = visible;
        if (entry.batch) {
            entry.batch.visible = visible;
        }
        this._draw();
    }

    /**
     * @param {string} id
     * @param {number} opacity
     */
    setFeatureCollectionOpacity(id, opacity) {
        const entry = this._collections.get(id);
        if (!entry) {
            return;
        }
        entry.opacity = opacity;
        if (entry.batch) {
            entry.batch.opacity = opacity;
        }
        this._draw();
    }

    clear() {
        this._collections.forEach((entry) => entry.batch?.destroy());
        this._collections.clear();
        this._draw();
    }

    /**
     * @param {number} screenX
     * @param {number} screenY
     * @returns {object|null}
     */
    hitTest(screenX, screenY) {
        const tiledImage = getPrimaryTiledImage(this.viewer);
        if (!tiledImage) {
            return null;
        }
        const collections = [...this._collections.values()].reverse();
        for (const entry of collections) {
            if (!entry.visible || !entry.batch) {
                continue;
            }
            const hit = entry.batch.hitTest(
                screenX,
                screenY,
                this.viewer,
                tiledImage
            );
            if (hit) {
                return { collectionId: entry.id, feature: hit };
            }
        }
        return null;
    }

    /**
     * @param {string} collectionId
     * @param {number} featureIndex
     * @returns {object|null}
     */
    getFeatureForEdit(collectionId, featureIndex) {
        const entry = this._collections.get(collectionId);
        if (!entry?.fc?.features?.[featureIndex]) {
            return null;
        }
        return JSON.parse(JSON.stringify(entry.fc.features[featureIndex]));
    }

    /**
     * @param {string} collectionId
     * @param {number} featureIndex
     */
    removeFeatureAt(collectionId, featureIndex) {
        const entry = this._collections.get(collectionId);
        if (!entry?.fc?.features) {
            return;
        }
        entry.fc.features.splice(featureIndex, 1);
        this._rebuildBatch(collectionId);
        this._draw();
    }

    /**
     * @param {string} collectionId
     * @param {number} featureIndex
     * @param {object} updatedFeature
     */
    updateFeature(collectionId, featureIndex, updatedFeature) {
        const entry = this._collections.get(collectionId);
        if (!entry?.fc?.features) {
            return;
        }
        entry.fc.features[featureIndex] = updatedFeature;
        this._rebuildBatch(collectionId);
        this._draw();
    }

    /**
     * @param {string} collectionId
     * @returns {object|null}
     */
    getFeatureCollectionGeoJSON(collectionId) {
        const entry = this._collections.get(collectionId);
        return entry ? JSON.parse(JSON.stringify(entry.fc)) : null;
    }

    /**
     * @returns {object[]}
     */
    toGeoJSON() {
        return [...this._collections.values()].map((entry) => JSON.parse(JSON.stringify(entry.fc)));
    }

    /**
     * @param {number} x0
     * @param {number} y0
     * @param {number} x1
     * @param {number} y1
     * @param {number} x2
     * @param {number} y2
     */
    setDebugTriangle(x0, y0, x1, y1, x2, y2) {
        this._debugTriangle = { x0, y0, x1, y1, x2, y2 };
        this._draw();
    }

    /**
     * Stroke style for the debug triangle outline.
     * @param {{ width?: number, rescale?: boolean }} opts
     *   width — screen pixels when rescale is true; image pixels when false
     *   rescale — keep constant screen width when true (Paper-style rescale.strokeWidth)
     */
    setDebugTriangleStroke(opts = {}) {
        if (opts.width !== undefined) {
            this._debugStroke.width = Math.max(0, Number(opts.width) || 0);
        }
        if (opts.rescale !== undefined) {
            this._debugStroke.rescale = Boolean(opts.rescale);
        }
        this._draw();
    }

    clearDebugTriangle() {
        this._debugTriangle = null;
        this._draw();
    }

    destroy(viewerDestroyed = false) {
        if (this.destroyed) {
            return;
        }
        this.destroyed = true;
        this.clear();
        this._unbindAllTiledImages();
        if (!viewerDestroyed) {
            this._unbindEvents?.();
            this.viewer.world.removeHandler('add-item', this._onWorldAddItem);
            this.viewer.world.removeHandler('remove-item', this._onWorldRemoveItem);
            unregisterOverlay(this.viewer, REGISTRY_KEY, this);
        }
        this._canvas?.removeEventListener('webglcontextlost', this._onContextLost);
        this._canvas?.removeEventListener('webglcontextrestored', this._onContextRestored);
        if (this._debugProgram) {
            this._gl.deleteProgram(this._debugProgram);
        }
        this._canvasdiv?.remove();
    }

    /**
     * @param {OpenSeadragon.TiledImage} tiledImage
     * @private
     */
    _bindTiledImage(tiledImage) {
        if (!tiledImage || this._tiledImageHandlers.has(tiledImage)) {
            return;
        }
        const handler = this._onTiledImageBoundsChange;
        tiledImage.addHandler('bounds-change', handler);
        this._tiledImageHandlers.set(tiledImage, handler);
    }

    /**
     * @param {OpenSeadragon.TiledImage} tiledImage
     * @private
     */
    _unbindTiledImage(tiledImage) {
        const handler = this._tiledImageHandlers.get(tiledImage);
        if (!handler) {
            return;
        }
        tiledImage.removeHandler('bounds-change', handler);
        this._tiledImageHandlers.delete(tiledImage);
    }

    /**
     * @private
     */
    _unbindAllTiledImages() {
        [...this._tiledImageHandlers.keys()].forEach((item) => this._unbindTiledImage(item));
    }

    _resize() {
        const { width, height, scaleFactor } = resizeOverlayCanvas(
            this._canvas,
            this._canvasdiv,
            this.viewer
        );
        this._containerWidth = width;
        this._containerHeight = height;
        this._currentScaleFactor = scaleFactor;
        const tiledImage = getPrimaryTiledImage(this.viewer);
        if (tiledImage) {
            this._origin = defaultImageOrigin(tiledImage);
        }
    }

    _rebuildAllBatches() {
        [...this._collections.keys()].forEach((id) => this._rebuildBatch(id));
    }

    _rebuildBatch(id) {
        const entry = this._collections.get(id);
        if (!entry) {
            return;
        }
        entry.batch?.destroy();
        const tiledImage = getPrimaryTiledImage(this.viewer);
        if (!tiledImage) {
            entry.batch = null;
            return;
        }
        this._origin = defaultImageOrigin(tiledImage);
        const meshes = featureCollectionToMeshes(entry.fc, this._origin);
        const batch = new FeatureBatch(this._gl);
        batch.setMeshes(meshes);
        batch.visible = entry.visible;
        batch.opacity = entry.opacity;
        entry.batch = batch;
    }

    _draw() {
        if (this.destroyed || this._contextLost) {
            return;
        }
        const gl = this._gl;
        const w = this._containerWidth;
        const h = this._containerHeight;
        gl.viewport(0, 0, w, h);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        const tiledImage = getPrimaryTiledImage(this.viewer);
        if (!tiledImage) {
            return;
        }
        const matrix = computeImageToClipMatrix(
            this.viewer,
            tiledImage,
            this._origin,
            w,
            h
        );

        if (this._debugTriangle) {
            this._drawDebugTriangle(matrix);
        }

        this._collections.forEach((entry) => {
            if (entry.visible && entry.batch) {
                // batch.opacity already mirrors entry.opacity; do not pass it again.
                entry.batch.draw(matrix, 1);
            }
        });
    }

    /**
     * Screen pixels per image pixel at the current view (for non-rescale strokes).
     * @private
     */
    _imageToScreenScale() {
        const tiledImage = getPrimaryTiledImage(this.viewer);
        if (!tiledImage || !this._containerWidth) {
            return 1;
        }
        const c0 = imagePixelToClip(
            this.viewer, tiledImage, 0, 0, this._containerWidth, this._containerHeight
        );
        const c1 = imagePixelToClip(
            this.viewer, tiledImage, 1, 0, this._containerWidth, this._containerHeight
        );
        const clipPerImage = Math.hypot(c1.x - c0.x, c1.y - c0.y);
        return (clipPerImage * this._containerWidth) / 2;
    }

    /**
     * Effective debug stroke width in screen pixels.
     * @private
     */
    _debugStrokeWidthPx() {
        const { width, rescale } = this._debugStroke;
        if (!width) {
            return 0;
        }
        return rescale ? width : width * this._imageToScreenScale();
    }

    _drawDebugTriangle(matrix) {
        const gl = this._gl;
        const { x0, y0, x1, y1, x2, y2 } = this._debugTriangle;
        const ox = this._origin.x;
        const oy = this._origin.y;
        const positions = new Float32Array([
            x0 - ox, y0 - oy,
            x1 - ox, y1 - oy,
            x2 - ox, y2 - oy,
        ]);
        const colors = new Float32Array([
            1, 0, 0, 0.35,
            1, 0, 0, 0.35,
            1, 0, 0, 0.35,
        ]);
        const posBuf = gl.createBuffer();
        const colBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STREAM_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
        gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STREAM_DRAW);

        const program = this._debugProgram;
        gl.useProgram(program);
        gl.uniformMatrix4fv(gl.getUniformLocation(program, 'u_matrix'), false, matrix);
        gl.uniform1f(gl.getUniformLocation(program, 'u_opacity'), 1);
        const posLoc = gl.getAttribLocation(program, 'a_position');
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
        const colLoc = gl.getAttribLocation(program, 'a_color');
        gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
        gl.enableVertexAttribArray(colLoc);
        gl.vertexAttribPointer(colLoc, 4, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.deleteBuffer(posBuf);
        gl.deleteBuffer(colBuf);

        this._drawDebugTriangleStroke(matrix);
    }

    /**
     * Outline the debug triangle with screen-space stroke width (Paper rescale semantics).
     * @param {Float32Array} matrix
     * @private
     */
    _drawDebugTriangleStroke(matrix) {
        const widthPx = this._debugStrokeWidthPx();
        if (widthPx <= 0) {
            return;
        }
        const gl = this._gl;
        const w = this._containerWidth;
        const h = this._containerHeight;
        const { x0, y0, x1, y1, x2, y2 } = this._debugTriangle;
        const ox = this._origin.x;
        const oy = this._origin.y;
        const corners = [
            [x0 - ox, y0 - oy],
            [x1 - ox, y1 - oy],
            [x2 - ox, y2 - oy],
        ];

        // Expand each edge into a screen-space quad, then convert corners back to clip.
        const pos = [];
        const col = [];
        const idx = [];
        let base = 0;
        const half = widthPx * 0.5;
        const strokeRgba = [0.85, 0.1, 0.1, 1];

        const toClip = (ix, iy) => {
            const c = new Float32Array(4);
            // column-major mat4 * vec4(ix, iy, 0, 1)
            c[0] = matrix[0] * ix + matrix[4] * iy + matrix[12];
            c[1] = matrix[1] * ix + matrix[5] * iy + matrix[13];
            c[3] = matrix[3] * ix + matrix[7] * iy + matrix[15];
            const invW = c[3] !== 0 ? 1 / c[3] : 1;
            return { x: c[0] * invW, y: c[1] * invW };
        };
        const clipToPixel = (cx, cy) => ({
            x: ((cx + 1) / 2) * w,
            y: ((1 - cy) / 2) * h,
        });
        const pixelToClip = (px, py) => ({
            x: (px / w) * 2 - 1,
            y: 1 - (py / h) * 2,
        });

        for (let e = 0; e < 3; e += 1) {
            const a = corners[e];
            const b = corners[(e + 1) % 3];
            const ca = toClip(a[0], a[1]);
            const cb = toClip(b[0], b[1]);
            const pa = clipToPixel(ca.x, ca.y);
            const pb = clipToPixel(cb.x, cb.y);
            const dx = pb.x - pa.x;
            const dy = pb.y - pa.y;
            const len = Math.hypot(dx, dy) || 1;
            const nx = (-dy / len) * half;
            const ny = (dx / len) * half;
            const q = [
                pixelToClip(pa.x + nx, pa.y + ny),
                pixelToClip(pa.x - nx, pa.y - ny),
                pixelToClip(pb.x + nx, pb.y + ny),
                pixelToClip(pb.x - nx, pb.y - ny),
            ];
            // Store as clip-space positions with identity-ish draw (bypass u_matrix).
            q.forEach((p) => {
                pos.push(p.x, p.y);
                col.push(...strokeRgba);
            });
            idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
            base += 4;
        }

        // Draw with a throwaway identity matrix so positions are already in clip space.
        const identity = new Float32Array([
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1,
        ]);
        const program = this._debugProgram;
        const posBuf = gl.createBuffer();
        const colBuf = gl.createBuffer();
        const idxBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STREAM_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(col), gl.STREAM_DRAW);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STREAM_DRAW);

        gl.useProgram(program);
        gl.uniformMatrix4fv(gl.getUniformLocation(program, 'u_matrix'), false, identity);
        gl.uniform1f(gl.getUniformLocation(program, 'u_opacity'), 1);
        const posLoc = gl.getAttribLocation(program, 'a_position');
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
        const colLoc = gl.getAttribLocation(program, 'a_color');
        gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
        gl.enableVertexAttribArray(colLoc);
        gl.vertexAttribPointer(colLoc, 4, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
        gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
        gl.deleteBuffer(posBuf);
        gl.deleteBuffer(colBuf);
        gl.deleteBuffer(idxBuf);
    }
}

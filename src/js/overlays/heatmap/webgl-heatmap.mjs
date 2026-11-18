/**
 * WebGL continuous heatmap overlay (additive splat + LUT colorize).
 * @version 0.7.6
 */

import { OpenSeadragon } from '../../osd-loader.mjs';
import {
    bindViewerOverlayEvents,
    bringOverlayToFront,
    createOverlayCanvas,
    registerOverlay,
    resizeOverlayCanvas,
    unregisterOverlay,
} from '../overlay-dom.mjs';
import {
    computeImageToClipMatrix,
    defaultImageOrigin,
    getPrimaryTiledImage,
} from '../../webgl/camera-from-osd.mjs';
import { createWebGLContext } from '../../webgl/gl-utils.mjs';
import { HeatmapGlRenderer } from './heatmap-gl-renderer.mjs';
import {
    DEFAULT_HEATMAP_OPTIONS,
    mergeHeatmapStyle,
} from './heatmap-style.mjs';

const REGISTRY_KEY = 'WebglHeatmapOverlays';

/**
 * @class
 * @memberof OSDPaperjsAnnotation
 * @extends OpenSeadragon.EventSource
 */
export class WebglHeatmapOverlay extends OpenSeadragon.EventSource {
    /**
     * @param {OpenSeadragon.Viewer} viewer
     * @param {object} [opts]
     */
    constructor(viewer, opts = {}) {
        super();
        opts = OpenSeadragon.extend(true, {}, DEFAULT_HEATMAP_OPTIONS, opts);

        this.viewer = viewer;
        this.destroyed = false;
        this._data = [];
        this._style = mergeHeatmapStyle(opts.style);
        this._binned = opts.binned; // API parity; unused for WebGL draw in v1
        this._updateDelay = opts.updateDelay; // accepted, unused (continuous draw)
        this._minIntensity = opts.minIntensity;
        this._maxIntensity = opts.maxIntensity;
        this._visible = true;
        this._opacity = 1;
        this._origin = defaultImageOrigin();
        this._tiledImageHandlers = new Map();

        registerOverlay(viewer, REGISTRY_KEY, this);

        const { div, canvas } = createOverlayCanvas(viewer, 'webgl-heatmap-overlay');
        this._canvasdiv = div;
        this._canvas = canvas;

        const gl = createWebGLContext(canvas, { antialias: false });
        this._gl = gl;
        this._renderer = new HeatmapGlRenderer(gl);
        this._renderer.setStyle(this._style);

        this._onContextLost = (e) => {
            e.preventDefault();
            this._contextLost = true;
        };
        this._onContextRestored = () => {
            this._contextLost = false;
            this._renderer = new HeatmapGlRenderer(this._gl);
            this._renderer.setStyle(this._style);
            this._renderer.setPoints(this._data, this._minIntensity, this._maxIntensity);
            this._resize();
            this._draw();
        };
        canvas.addEventListener('webglcontextlost', this._onContextLost);
        canvas.addEventListener('webglcontextrestored', this._onContextRestored);

        this._containerWidth = 0;
        this._containerHeight = 0;

        this._onViewportChange = () => this._draw();
        this._onResize = () => {
            this._resize();
            this._draw();
        };
        this._onTiledImageBoundsChange = () => this._draw();

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
     * @param {Array<{x:number,y:number,intensity?:number}>} points
     */
    setData(points) {
        this._data = (points || []).slice();
        this._renderer.setPoints(this._data, this._minIntensity, this._maxIntensity);
        this._draw();
    }

    /**
     * @param {object} fc GeoJSON FeatureCollection of Points
     */
    setDataFromGeoJSON(fc) {
        const features = fc?.features || (fc?.type === 'Feature' ? [fc] : []);
        this._data = features.map((f) => {
            const coords = f.geometry?.coordinates || [0, 0];
            return {
                x: coords[0],
                y: coords[1],
                intensity: f.properties?.intensity !== undefined ? f.properties.intensity : 1,
            };
        });
        this._renderer.setPoints(this._data, this._minIntensity, this._maxIntensity);
        this._draw();
    }

    /**
     * @param {object} partial
     */
    setStyle(partial) {
        this._style = mergeHeatmapStyle({ ...this._style, ...partial });
        this._renderer.setStyle(this._style);
        this._draw();
    }

    /**
     * Accepted for API compatibility; unused for drawing (GPU splat handles density
     * without CPU binning).
     * @param {boolean|'auto'|number} binned
     */
    setBinned(binned) {
        this._binned = binned;
        this._draw();
    }

    /**
     * @param {boolean} visible
     */
    setVisible(visible) {
        this._visible = visible;
        if (this._canvasdiv) {
            this._canvasdiv.style.display = visible ? '' : 'none';
        }
        if (visible) {
            this._draw();
        }
    }

    /**
     * @param {number} opacity
     */
    setOpacity(opacity) {
        this._opacity = opacity;
        this._draw();
    }

    clear() {
        this._data = [];
        this._renderer.clearPoints();
        this._draw();
    }

    destroy(viewerDestroyed = false) {
        if (this.destroyed) {
            return;
        }
        this.destroyed = true;
        this._canvas?.removeEventListener('webglcontextlost', this._onContextLost);
        this._canvas?.removeEventListener('webglcontextrestored', this._onContextRestored);
        if (!viewerDestroyed) {
            this._unbindEvents?.();
            this.viewer.world.removeHandler('add-item', this._onWorldAddItem);
            this.viewer.world.removeHandler('remove-item', this._onWorldRemoveItem);
            this._unbindAllTiledImages();
            unregisterOverlay(this.viewer, REGISTRY_KEY, this);
        } else {
            this._unbindAllTiledImages();
        }
        this._renderer?.destroy();
        this._renderer = null;
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

    _unbindAllTiledImages() {
        for (const [tiledImage, handler] of this._tiledImageHandlers) {
            tiledImage.removeHandler('bounds-change', handler);
        }
        this._tiledImageHandlers.clear();
    }

    _resize() {
        const { width, height } = resizeOverlayCanvas(this._canvas, this._canvasdiv, this.viewer);
        this._containerWidth = width;
        this._containerHeight = height;
        this._renderer?.resize(width, height);
    }

    _draw() {
        if (this.destroyed || this._contextLost || !this._renderer || !this._visible) {
            return;
        }
        const tiledImage = getPrimaryTiledImage(this.viewer);
        if (!tiledImage) {
            return;
        }
        const width = this._containerWidth || this._canvas.width;
        const height = this._containerHeight || this._canvas.height;
        if (width < 1 || height < 1) {
            return;
        }

        this._origin = defaultImageOrigin(tiledImage);
        const matrix = computeImageToClipMatrix(
            this.viewer,
            tiledImage,
            this._origin,
            width,
            height
        );
        const zoom = this.viewer.viewport.getZoom(true);
        const homeZoom = this.viewer.viewport.getHomeZoom();
        this._renderer.draw(
            matrix,
            this._origin,
            this._style,
            width,
            height,
            zoom,
            homeZoom,
            this._opacity
        );
    }
}

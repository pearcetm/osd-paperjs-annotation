import { PaperOverlay } from '../src/js/paper-overlay.mjs';
import { WebglFeatureOverlay } from '../src/js/webgl/webgl-feature-overlay.mjs';
import { getPrimaryTiledImage } from '../src/js/webgl/camera-from-osd.mjs';
import { paper } from '../src/js/paperjs.mjs';

/**
 * @param {OpenSeadragon.TiledImage} tiledImage
 * @returns {{ width: number, height: number }}
 */
function getImageSize(tiledImage) {
    const size = tiledImage.source?.dimensions
        || tiledImage.getContentSize?.()
        || { x: 5000, y: 3750 };
    return { width: size.x, height: size.y };
}

/**
 * Lay out `count` polygons in a grid that fits inside the image bounds.
 * @param {number} count
 * @param {number} imageWidth
 * @param {number} imageHeight
 */
function buildSyntheticFC(count, imageWidth, imageHeight) {
    const features = [];
    const margin = Math.min(imageWidth, imageHeight) * 0.05;
    const usableW = Math.max(1, imageWidth - 2 * margin);
    const usableH = Math.max(1, imageHeight - 2 * margin);
    const cols = Math.max(1, Math.ceil(Math.sqrt(count * (usableW / usableH))));
    const rows = Math.max(1, Math.ceil(count / cols));
    const cellW = usableW / cols;
    const cellH = usableH / rows;
    const size = Math.min(cellW, cellH) * 0.65;

    for (let i = 0; i < count; i += 1) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = margin + col * cellW + (cellW - size) / 2;
        const y = margin + row * cellH + (cellH - size) / 2;
        features.push({
            type: 'Feature',
            geometry: {
                type: 'Polygon',
                coordinates: [[
                    [x, y],
                    [x + size, y],
                    [x + size, y + size],
                    [x, y + size],
                    [x, y],
                ]],
            },
            properties: {
                fillColor: `hsl(${(i * 7) % 360}, 70%, 50%)`,
                fillOpacity: 0.6,
            },
        });
    }
    return {
        type: 'FeatureCollection',
        label: 'Synthetic polygons',
        properties: { id: 'synthetic', renderer: 'webgl' },
        features,
    };
}

/**
 * Image-space corners for the shared debug triangle.
 * @param {number} width
 * @param {number} height
 */
function debugTriangleCorners(width, height) {
    const cx = width * 0.5;
    const cy = height * 0.5;
    const s = Math.min(width, height) * 0.08;
    return {
        x0: cx - s, y0: cy + s * 0.6,
        x1: cx + s, y1: cy + s * 0.6,
        x2: cx, y2: cy - s,
        cx, cy,
    };
}

function getStrokeOpts() {
    return {
        width: parseFloat(document.getElementById('stroke-width').value) || 0,
        rescale: document.getElementById('stroke-rescale').checked,
    };
}

const viewer = window.viewer = OpenSeadragon({
    element: 'viewer',
    prefixUrl: 'https://openseadragon.github.io/openseadragon/images/',
    tileSources: {
        type: 'image',
        url: 'https://openseadragon.github.io/example-images/grand-canyon-landscape-overlooking.jpg',
        buildPyramid: false,
    },
    minZoomImageRatio: 0.01,
    visibilityRatio: 0,
    crossOriginPolicy: 'Anonymous',
    showFlipControl: true,
    showRotationControl: true,
});

let paperOverlay;
let webglOverlay;
/** @type {paper.Item[]} Paper items for the debug triangle only */
let paperTriangleItems = [];

function getRendererMode() {
    const checked = document.querySelector('input[name="renderer-mode"]:checked');
    return checked?.value || 'webgl';
}

function applyRendererMode() {
    const mode = getRendererMode();
    const showWebgl = mode === 'webgl' || mode === 'both';
    // Keep Paper visible in all modes so PointText labels remain readable;
    // WebGL-only mode omits Paper polygon fills (see reload).
    if (webglOverlay?._canvasdiv) {
        webglOverlay._canvasdiv.style.opacity = showWebgl ? '1' : '0';
    }

    if (paperOverlay) {
        paperOverlay.paperScope.activate();
        paperOverlay._paperLayerMap.forEach((layer) => {
            layer.opacity = 1;
        });
        paperOverlay.paperScope.view.update();
    }
}

function updateStatus(count, width, height) {
    const el = document.getElementById('status');
    if (el) {
        el.textContent = `${count} polygons · image ${Math.round(width)}×${Math.round(height)}`;
    }
}

/**
 * Apply Paper stroke width using rescale (screen px) or plain image units.
 * @param {paper.Path} path
 * @param {{ width: number, rescale: boolean }} opts
 */
function applyPaperStroke(path, opts) {
    path.strokeColor = '#d91a1a';
    if (opts.rescale) {
        path.rescale = { strokeWidth: opts.width };
        path.applyRescale?.();
    } else {
        path.rescale = null;
        path.strokeWidth = opts.width;
    }
}

/**
 * @param {paper.Layer} layer
 * @param {object} corners
 * @param {{ width: number, rescale: boolean }} strokeOpts
 * @param {{ drawPath?: boolean }} [options]
 */
function addPaperDebugTriangle(layer, corners, strokeOpts, options = {}) {
    const { drawPath = true } = options;

    if (drawPath) {
        const path = new paper.Path([
            new paper.Point(corners.x0, corners.y0),
            new paper.Point(corners.x1, corners.y1),
            new paper.Point(corners.x2, corners.y2),
        ]);
        path.closed = true;
        path.fillColor = new paper.Color(1, 0, 0, 0.35);
        applyPaperStroke(path, strokeOpts);
        layer.addChild(path);
        paperTriangleItems.push(path);
    }

    const label = new paper.PointText({
        point: new paper.Point(corners.cx, corners.cy),
        content: 'Debug triangle (Paper text)',
        fillColor: '#111',
        fontFamily: 'sans-serif',
        justification: 'center',
    });
    label.rescale = {
        fontSize: (z) => 14 / z,
        strokeWidth: (z) => 0.5 / z,
    };
    label.strokeColor = '#fff';
    label.applyRescale?.();
    layer.addChild(label);
    paperTriangleItems.push(label);
}

/**
 * A few sample labels — text stays on Paper by design.
 * @param {paper.Layer} layer
 * @param {object} fc
 */
function addPaperSampleLabels(layer, fc) {
    const samples = [0, Math.floor(fc.features.length / 2), fc.features.length - 1]
        .filter((i, idx, arr) => i >= 0 && i < fc.features.length && arr.indexOf(i) === idx);
    samples.forEach((i) => {
        const ring = fc.features[i].geometry.coordinates[0];
        let sx = 0;
        let sy = 0;
        ring.slice(0, -1).forEach(([x, y]) => {
            sx += x;
            sy += y;
        });
        const n = Math.max(1, ring.length - 1);
        const label = new paper.PointText({
            point: new paper.Point(sx / n, sy / n),
            content: `#${i}`,
            fillColor: '#102a43',
            fontFamily: 'sans-serif',
            justification: 'center',
        });
        label.rescale = { fontSize: (z) => 12 / z };
        label.applyRescale?.();
        layer.addChild(label);
    });
}

function clearPaperTriangleItems() {
    paperTriangleItems.forEach((item) => item.remove());
    paperTriangleItems = [];
}

function syncDebugTriangle() {
    const show = document.getElementById('show-triangle').checked;
    const strokeOpts = getStrokeOpts();
    const tiledImage = getPrimaryTiledImage(viewer);
    if (!tiledImage || !webglOverlay) {
        return;
    }
    const { width, height } = getImageSize(tiledImage);
    const corners = debugTriangleCorners(width, height);

    if (show) {
        webglOverlay.setDebugTriangle(
            corners.x0, corners.y0,
            corners.x1, corners.y1,
            corners.x2, corners.y2
        );
        webglOverlay.setDebugTriangleStroke(strokeOpts);
    } else {
        webglOverlay.clearDebugTriangle();
    }

    if (paperOverlay) {
        paperOverlay.paperScope.activate();
        clearPaperTriangleItems();
        const layer = paperOverlay.getPaperLayer(tiledImage);
        if (layer && show) {
            const mode = getRendererMode();
            // In WebGL-only mode, skip Paper fill/stroke so WebGL owns geometry; keep PointText.
            addPaperDebugTriangle(layer, corners, strokeOpts, {
                drawPath: mode === 'paper' || mode === 'both',
            });
        }
        paperOverlay.paperScope.view.update();
    }
}

function reload() {
    const tiledImage = getPrimaryTiledImage(viewer);
    if (!tiledImage) {
        return;
    }
    const { width, height } = getImageSize(tiledImage);
    const count = parseInt(document.getElementById('poly-count').value, 10) || 2000;
    const fc = buildSyntheticFC(count, width, height);
    webglOverlay?.loadFeatureCollections([fc]);

    if (paperOverlay) {
        paperOverlay.paperScope.activate();
        const layer = paperOverlay.getPaperLayer(tiledImage);
        paperTriangleItems = [];
        layer?.removeChildren();
        if (layer) {
            const mode = getRendererMode();
            if (mode === 'paper' || mode === 'both') {
                fc.features.forEach((feature) => {
                    const ring = feature.geometry.coordinates[0];
                    const path = new paper.Path(ring.map(([x, y]) => new paper.Point(x, y)));
                    path.closed = true;
                    path.fillColor = feature.properties.fillColor;
                    if (feature.properties.fillOpacity !== undefined) {
                        path.fillColor.alpha = feature.properties.fillOpacity;
                    }
                    layer.addChild(path);
                });
            }
            addPaperSampleLabels(layer, fc);
        }
        paperOverlay.paperScope.view.update();
    }

    syncDebugTriangle();
    applyRendererMode();
    updateStatus(count, width, height);
}

viewer.addHandler('open', () => {
    webglOverlay = new WebglFeatureOverlay(viewer);
    paperOverlay = new PaperOverlay(viewer, { overlayType: 'image' });

    applyRendererMode();

    document.querySelectorAll('input[name="renderer-mode"]').forEach((input) => {
        input.addEventListener('change', () => {
            applyRendererMode();
            reload();
        });
    });
    document.getElementById('show-triangle').addEventListener('change', syncDebugTriangle);
    document.getElementById('stroke-width').addEventListener('change', syncDebugTriangle);
    document.getElementById('stroke-width').addEventListener('input', syncDebugTriangle);
    document.getElementById('stroke-rescale').addEventListener('change', syncDebugTriangle);
    document.getElementById('toggle-item-flip').addEventListener('click', () => {
        const tiledImage = getPrimaryTiledImage(viewer);
        if (!tiledImage) {
            return;
        }
        const next = !(typeof tiledImage.getFlip === 'function'
            ? tiledImage.getFlip()
            : tiledImage.flipped);
        if (typeof tiledImage.setFlip === 'function') {
            tiledImage.setFlip(next);
        } else {
            tiledImage.flipped = next;
        }
    });
    document.getElementById('reload').addEventListener('click', reload);

    // Keep Paper rescale strokes/fonts updated while zooming.
    viewer.addHandler('viewport-change', () => {
        if (!paperOverlay) {
            return;
        }
        paperOverlay.paperScope.activate();
        paperOverlay.paperScope.project.getItems({ class: paper.Item }).forEach((item) => {
            if (item.rescale) {
                item.applyRescale?.();
            }
        });
        paperOverlay.paperScope.view.update();
    });

    reload();
});

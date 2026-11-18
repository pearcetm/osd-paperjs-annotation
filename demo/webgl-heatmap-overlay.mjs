import { WebglHeatmapOverlay } from '../src/js/overlays/heatmap/webgl-heatmap.mjs';
import { getPrimaryTiledImage } from '../src/js/webgl/camera-from-osd.mjs';

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
 * @returns {number}
 */
function randn() {
    let u = 0;
    let v = 0;
    while (u === 0) {
        u = Math.random();
    }
    while (v === 0) {
        v = Math.random();
    }
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Three centroids in different quadrants (UL / UR / LL).
 * @param {number} count
 * @param {number} imageWidth
 * @param {number} imageHeight
 */
function buildSyntheticPoints(count, imageWidth, imageHeight) {
    const margin = Math.min(imageWidth, imageHeight) * 0.08;
    const usableW = Math.max(1, imageWidth - 2 * margin);
    const usableH = Math.max(1, imageHeight - 2 * margin);
    const sigma = Math.min(usableW, usableH) * 0.12;

    const clusters = [
        { cx: margin + usableW * 0.25, cy: margin + usableH * 0.25, share: 0.5, intensityScale: 1.0 },
        { cx: margin + usableW * 0.75, cy: margin + usableH * 0.25, share: 0.3, intensityScale: 0.65 },
        { cx: margin + usableW * 0.25, cy: margin + usableH * 0.75, share: 0.2, intensityScale: 0.4 },
    ];

    const points = [];
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    clusters.forEach((cluster, clusterIndex) => {
        let n = Math.round(count * cluster.share);
        if (clusterIndex === clusters.length - 1) {
            n = count - points.length;
        }
        for (let i = 0; i < n; i += 1) {
            points.push({
                x: clamp(cluster.cx + randn() * sigma, margin, imageWidth - margin),
                y: clamp(cluster.cy + randn() * sigma, margin, imageHeight - margin),
                intensity: (0.35 + Math.random() * 0.65) * cluster.intensityScale,
            });
        }
    });

    return points;
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

let heatmap;

function updateStatus(count, width, height) {
    const el = document.getElementById('status');
    if (el) {
        el.textContent = `${count.toLocaleString()} points · 3 centroids · image ${Math.round(width)}×${Math.round(height)} · WebGL splat`;
    }
}

function reload() {
    const tiledImage = getPrimaryTiledImage(viewer);
    if (!tiledImage || !heatmap) {
        return;
    }
    const { width, height } = getImageSize(tiledImage);
    const count = parseInt(document.getElementById('point-count').value, 10) || 50000;
    const radius = parseFloat(document.getElementById('radius').value) || 25;
    const blur = parseFloat(document.getElementById('blur').value) || 15;

    heatmap.setStyle({ radius, blurRadius: blur });
    heatmap.setData(buildSyntheticPoints(count, width, height));
    updateStatus(count, width, height);
}

viewer.addHandler('open', () => {
    heatmap = new WebglHeatmapOverlay(viewer);
    document.getElementById('reload').addEventListener('click', reload);
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
    reload();
});

import { OpenSeadragon } from '../../osd-loader.mjs';
import { changeDpiBlob } from './changedpi.mjs';

const BASE_SCREEN_DPI = 96;

/**
 * Waits for `n` requestAnimationFrame ticks (falls back to setTimeout).
 * Useful to ensure painted state after OSD viewport operations.
 * @param {number} n - Number of frames to wait
 * @returns {Promise<void>}
 */
export function waitForNextPaintFrames(n = 2){
    n = Math.max(0, Math.floor(Number(n) || 0));
    if(n === 0) return Promise.resolve();
    const raf = (typeof window !== 'undefined' && window.requestAnimationFrame)
        ? window.requestAnimationFrame.bind(window)
        : null;
    if(!raf){
        return new Promise(resolve => setTimeout(resolve, 50));
    }
    return new Promise(resolve => {
        const tick = () => {
            n -= 1;
            if(n <= 0) resolve();
            else raf(tick);
        };
        raf(tick);
    });
}

/**
 * Builds a JSON signature string that uniquely identifies a render request,
 * used for cache invalidation.
 * @param {object} params
 * @param {number} params.w - Output width in device pixels
 * @param {number} params.h - Output height in device pixels
 * @param {OpenSeadragon.Rect} params.viewportRect - Viewport-space rectangle
 * @param {number} params.rotation - Viewport rotation
 * @param {object} params.tileSource - The OSD tile source object
 * @returns {string}
 */
export function computeRenderSignature({ w, h, viewportRect, rotation, tileSource }){
    const vr = viewportRect;
    const ts = tileSource;
    return JSON.stringify({
        viewportRect: { x: vr.x, y: vr.y, width: vr.width, height: vr.height, degrees: vr.degrees },
        outW: w,
        outH: h,
        rotation,
        tileSourceKey: ts?.url || ts?.tilesUrl || ts?.tileUrl || ts?.Image?.Url || null,
    });
}

/**
 * Creates an off-screen OpenSeadragon viewer, renders the specified viewport
 * region at the given pixel dimensions, and returns the result as a Blob.
 *
 * @param {object} params
 * @param {number} params.w - Output width in device pixels
 * @param {number} params.h - Output height in device pixels
 * @param {OpenSeadragon.Rect} params.viewportRect - Viewport-space rectangle to render
 * @param {object} params.viewer - The main OSD viewer (for config like crossOriginPolicy)
 * @param {object} params.tiledImage - The active tiled image
 * @param {function} [params.onProgress] - Optional progress callback(loaded, total)
 * @returns {Promise<{blob: Blob, pixelRatio: number, signature: string}>}
 */
export async function renderBaseScreenshot({ w, h, viewportRect, viewer, tiledImage, onProgress }){
    const pixelRatio = OpenSeadragon.pixelDensityRatio;
    const cssW = w / pixelRatio;
    const cssH = h / pixelRatio;

    const ti = tiledImage;
    const ts = ti.source || viewer.tileSources[viewer.currentPage()];
    const rotation = viewer.viewport.getRotation(true);

    const signature = computeRenderSignature({ w, h, viewportRect, rotation, tileSource: ts });

    const d = document.createElement('div');
    document.body.appendChild(d);
    d.style.cssText = `width:${cssW}px;height:${cssH}px;position:fixed;left:-${cssW*2}px;`;

    let ssViewer = null;
    try{
        ssViewer = OpenSeadragon({
            element: d,
            tileSources: [ts],
            crossOriginPolicy: viewer.crossOriginPolicy,
            prefixUrl: viewer.prefixUrl,
            immediateRender: true,
        });
        ssViewer.viewport.setRotation(rotation, true);

        if(onProgress){
            ssViewer.addHandler('tile-drawn', (ev) => {
                const coverage = ev.tiledImage.coverage;
                const levels = Object.keys(coverage);
                const maxLevel = levels[levels.length - 1];
                if(ev.tile.level == maxLevel){
                    const full = coverage[maxLevel];
                    const status = Object.values(full).map(o => Object.values(o)).flat();
                    onProgress(status.filter(x => x).length, status.length);
                }
            });
        }

        await new Promise((resolve, reject) => {
            ssViewer.addHandler('open', () => {
                try{
                    ssViewer.world.getItemAt(0).setRotation(ti.getRotation(true), true);
                    ssViewer.viewport.fitBounds(viewportRect, true);
                    ssViewer.world.getItemAt(0).addOnceHandler('fully-loaded-change', () => {
                        resolve();
                    });
                }catch(e){
                    reject(e);
                }
            });
            ssViewer.addHandler('open-failed', reject);
        });

        await waitForNextPaintFrames(2);

        let blob = await new Promise((resolve) => ssViewer.drawer.canvas.toBlob(resolve));
        if(!blob) throw new Error('Failed to export screenshot canvas.');
        if(pixelRatio !== 1){
            blob = await changeDpiBlob(blob, BASE_SCREEN_DPI * pixelRatio);
        }

        return { blob, pixelRatio, signature };
    } finally {
        try{
            const container = ssViewer?.element;
            ssViewer?.destroy?.();
            container?.remove?.();
        }catch{ /* ignore */ }
        try{ d.remove(); }catch{ /* ignore */ }
    }
}

/**
 * Composes a scalebar onto a base screenshot blob.
 *
 * @param {object} params
 * @param {Blob} params.baseBlob - The base screenshot blob
 * @param {number} params.pixelRatio - Device pixel ratio used during base render
 * @param {number} params.scaleFactor - Output scale factor (output pixels / base pixels)
 * @param {object} params.scalebar - Scalebar configuration
 * @param {boolean} params.scalebar.include - Whether to draw a scalebar
 * @param {number} params.scalebar.widthMm - Scalebar physical length in mm
 * @param {number} params.scalebar.heightPx - Scalebar bar height in pixels
 * @param {number} params.scalebar.mppX - Microns per pixel along X axis
 * @param {object} [params.scalebar.label] - Label fit info from _scalebarLabelFit
 * @returns {Promise<Blob>}
 */
export async function composeScreenshotWithScalebar({ baseBlob, pixelRatio, scaleFactor, scalebar }){
    const img = (typeof createImageBitmap === 'function')
        ? await createImageBitmap(baseBlob)
        : await new Promise((resolve, reject) => {
            const url = URL.createObjectURL(baseBlob);
            const image = new Image();
            image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
            image.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
            image.src = url;
        });

    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    if(scalebar.include && scalebar.mppX){
        const PADDING = 12;
        const pxLen = Math.max(1, Math.round(scalebar.widthMm * 1000 / scalebar.mppX * scaleFactor));
        const pxH = Math.max(1, Math.round(scalebar.heightPx));
        const x2 = canvas.width - PADDING;
        const y2 = canvas.height - PADDING;
        const x1 = Math.max(PADDING, x2 - pxLen);
        const y1 = Math.max(PADDING, y2 - pxH);
        ctx.fillStyle = '#000';
        ctx.fillRect(x1, y1, x2 - x1, y2 - y1);

        if(scalebar.label?.enabled && scalebar.label?.fits && scalebar.label?.label){
            ctx.save();
            ctx.font = `${scalebar.label.fontPx || 12}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(scalebar.label.label, (x1 + x2) / 2, (y1 + y2) / 2);
            ctx.restore();
        }
    }

    let blob = await new Promise((resolve) => canvas.toBlob(resolve));
    if(!blob) throw new Error('Failed to export composed screenshot.');
    if(pixelRatio !== 1){
        blob = await changeDpiBlob(blob, BASE_SCREEN_DPI * pixelRatio);
    }
    return blob;
}

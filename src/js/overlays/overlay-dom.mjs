/**
 * Shared DOM canvas overlay helpers for OSD-synced overlays.
 */

let overlayCounter = 1;

/**
 * @param {OpenSeadragon.Viewer} viewer
 * @param {string} className
 * @returns {{ div: HTMLDivElement, canvas: HTMLCanvasElement, id: string }}
 */
export function createOverlayCanvas(viewer, className) {
    const id = `${className}-${overlayCounter}`;
    overlayCounter += 1;
    const div = document.createElement('div');
    div.setAttribute('id', id);
    div.classList.add(className);
    div.style.position = 'absolute';
    div.style.left = '0';
    div.style.top = '0';
    div.style.width = '100%';
    div.style.height = '100%';
    div.style.pointerEvents = 'none';

    const canvas = document.createElement('canvas');
    canvas.setAttribute('id', `${id}-canvas`);
    div.appendChild(canvas);
    viewer.canvas.appendChild(div);
    return { div, canvas, id };
}

/**
 * @param {OpenSeadragon.Viewer} viewer
 * @returns {object[]}
 */
export function getViewerOverlayStack(viewer) {
    const keys = ['PaperOverlays', 'WebglFeatureOverlays', 'WebglHeatmapOverlays'];
    const overlays = [];
    keys.forEach((key) => {
        (viewer[key] || []).forEach((overlay) => overlays.push(overlay));
    });
    const canvas = viewer.canvas;
    const hasDom = canvas?.children && overlays.some((overlay) => overlay._canvasdiv);
    if (!hasDom) {
        return overlays;
    }
    return overlays
        .filter((o) => o._canvasdiv)
        .sort((a, b) => {
            const ai = [...canvas.children].indexOf(a._canvasdiv);
            const bi = [...canvas.children].indexOf(b._canvasdiv);
            return ai - bi;
        });
}

/**
 * @param {OpenSeadragon.Viewer} viewer
 * @param {string} registryKey
 * @param {object} overlay
 */
export function registerOverlay(viewer, registryKey, overlay) {
    if (!viewer[registryKey]) {
        Object.defineProperty(viewer, registryKey, {
            get() {
                return this[`_${registryKey}`] || (this[`_${registryKey}`] = []);
            },
        });
    }
    viewer[registryKey].push(overlay);
}

/**
 * @param {OpenSeadragon.Viewer} viewer
 * @param {string} registryKey
 * @param {object} overlay
 */
export function unregisterOverlay(viewer, registryKey, overlay) {
    const list = viewer[registryKey];
    if (!list) {
        return;
    }
    const idx = list.indexOf(overlay);
    if (idx >= 0) {
        list.splice(idx, 1);
    }
}

/**
 * @param {OpenSeadragon.Viewer} viewer
 * @param {string} registryKey
 * @param {object} overlay
 */
export function bringOverlayToFront(viewer, registryKey, overlay) {
    const list = viewer[registryKey];
    if (!list) {
        return;
    }
    const idx = list.indexOf(overlay);
    if (idx >= 0) {
        list.splice(idx, 1);
        list.push(overlay);
    }
    list.forEach((o) => {
        if (o._canvasdiv) {
            viewer.canvas.appendChild(o._canvasdiv);
        }
    });
}

/**
 * @param {OpenSeadragon.Viewer} viewer
 * @param {object} overlay
 * @param {() => void} onViewportChange
 * @param {() => void} onResize
 * @returns {() => void} cleanup
 */
export function bindViewerOverlayEvents(viewer, overlay, onViewportChange, onResize) {
    const onDestroy = () => overlay.destroy(true);
    const onResetSize = () => {
        setTimeout(() => {
            if (overlay.destroyed) {
                return;
            }
            onResize();
            onViewportChange();
        });
    };
    viewer.addHandler('viewport-change', onViewportChange);
    viewer.addHandler('resize', onResize);
    viewer.addHandler('reset-size', onResetSize);
    viewer.addHandler('rotate', onViewportChange);
    viewer.addHandler('flip', onViewportChange);
    viewer.addOnceHandler('destroy', onDestroy);
    return () => {
        viewer.removeHandler('viewport-change', onViewportChange);
        viewer.removeHandler('resize', onResize);
        viewer.removeHandler('reset-size', onResetSize);
        viewer.removeHandler('rotate', onViewportChange);
        viewer.removeHandler('flip', onViewportChange);
    };
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLDivElement} div
 * @param {OpenSeadragon.Viewer} viewer
 * @returns {{ width: number, height: number, scaleFactor: number }}
 */
export function resizeOverlayCanvas(canvas, div, viewer) {
    const width = viewer.container.clientWidth;
    const height = viewer.container.clientHeight;
    if (div.clientWidth !== width) {
        div.style.width = `${width}px`;
    }
    if (div.clientHeight !== height) {
        div.style.height = `${height}px`;
    }
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const scaleFactor = viewer.drawer?.canvas?.clientWidth || width;
    return { width, height, scaleFactor };
}

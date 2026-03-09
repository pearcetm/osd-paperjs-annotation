import { AnnotationToolkit } from '../src/js/annotationtoolkit.mjs';

const commonViewerOpts = {
    prefixUrl: "https://openseadragon.github.io/openseadragon/images/",
    tileSources: [{
        tileSource: {
            type: 'image',
            url: './grand-canyon-landscape-overlooking.jpg',
            buildPyramid: false,
        },
        x: 0,
    }, "https://openseadragon.github.io/example-images/highsmith/highsmith.dzi"],
    sequenceMode: true,
    minZoomImageRatio: 0.01,
    visibilityRatio: 0,
    crossOriginPolicy: 'Anonymous',
    ajaxWithCredentials: false,
    drawer: 'webgl',
};

function setupListenerApiPanel(toolkit) {
    const container = document.getElementById('listener-api-controls');
    const toolOutlet = document.getElementById('listener-api-tool-outlet');
    if (!container) return;

    const rulerTool = toolkit.getTool('ruler');
    const defaultTool = toolkit.getTool('default');
    if (!rulerTool || !defaultTool) return;

    container.replaceChildren();

    function setOutletForTool(tool) {
        if (!toolOutlet) return;
        const ctrl = tool && tool.getToolbarControl && tool.getToolbarControl();
        if (ctrl && ctrl.dropdown) toolOutlet.replaceChildren(ctrl.dropdown);
        else toolOutlet.replaceChildren();
    }

    const statusEl = document.createElement('div');
    statusEl.setAttribute('aria-live', 'polite');
    statusEl.style.marginBottom = '0.5em';
    statusEl.textContent = 'Not listening.';

    const subscribeBtn = document.createElement('button');
    subscribeBtn.type = 'button';
    subscribeBtn.textContent = 'Subscribe';
    subscribeBtn.classList.add('btn', 'btn-sm');

    const unsubscribeBtn = document.createElement('button');
    unsubscribeBtn.type = 'button';
    unsubscribeBtn.textContent = 'Unsubscribe';
    unsubscribeBtn.classList.add('btn', 'btn-sm');
    unsubscribeBtn.disabled = true;

    function setListening(active) {
        subscribeBtn.disabled = active;
        unsubscribeBtn.disabled = !active;
        if (!active) statusEl.textContent = 'Not listening.';
    }

    function onActivated() {
        statusEl.textContent = 'Listening. Last event: activated (tool)';
    }

    function onDeactivated() {
        statusEl.textContent = 'Listening. Last event: deactivated (tool)';
    }

    function formatMeasurementFromPayload(payload) {
        if (payload.distance == null) return payload.label || 'Measurement';
        const ruler = payload.item?.data?.ruler;
        const units = ruler?.units ?? 'px';
        const unitsPerPixel = ruler?.unitsPerPixel != null ? Number(ruler.unitsPerPixel) : 1;
        const value = payload.distance * unitsPerPixel;
        return `${Number(value).toFixed(2)} ${units}`;
    }

    function onMeasurementUpdated(payload) {
        const formatted = formatMeasurementFromPayload(payload);
        statusEl.textContent = `Listening. Last event: measurement updated — ${formatted} (project)`;
    }

    subscribeBtn.addEventListener('click', () => {
        rulerTool.addEventListener('activated', onActivated);
        rulerTool.addEventListener('deactivated', onDeactivated);
        const project = toolkit.paperScope?.project;
        if (project) project.on('ruler-measurement-updated', onMeasurementUpdated);
        statusEl.textContent = 'Listening. Last event: —';
        setListening(true);
    });

    unsubscribeBtn.addEventListener('click', () => {
        rulerTool.removeEventListener('activated', onActivated);
        rulerTool.removeEventListener('deactivated', onDeactivated);
        const project = toolkit.paperScope?.project;
        if (project) project.off('ruler-measurement-updated', onMeasurementUpdated);
        setListening(false);
    });

    const btnRow = document.createElement('div');
    btnRow.classList.add('btn-group', 'btn-group-sm');
    btnRow.style.marginBottom = '0.5em';
    btnRow.append(subscribeBtn, unsubscribeBtn);

    const hint = document.createElement('p');
    hint.style.fontSize = '0.9em';
    hint.style.color = '#666';
    hint.textContent = 'Subscribe to hear tool events (activated/deactivated) and project events (ruler-measurement-updated). Activate the Ruler, draw or edit a segment, then Unsubscribe — status stops updating.';

    const activateRulerBtn = document.createElement('button');
    activateRulerBtn.type = 'button';
    activateRulerBtn.textContent = 'Activate ruler';
    activateRulerBtn.classList.add('btn', 'btn-sm');

    const activateDefaultBtn = document.createElement('button');
    activateDefaultBtn.type = 'button';
    activateDefaultBtn.textContent = 'Activate default';
    activateDefaultBtn.classList.add('btn', 'btn-sm');

    activateRulerBtn.addEventListener('click', () => {
        const selected = toolkit.paperScope?.findSelectedItems?.() ?? [];
        const single = selected.length === 1 ? selected[0] : null;
        const isMeasurement = single?.annotationItem?.getGeoJSONType?.()?.subtype === 'Measurement';
        rulerTool.activate(isMeasurement ? {} : { createNewItem: true });
        setOutletForTool(rulerTool);
    });

    activateDefaultBtn.addEventListener('click', () => {
        defaultTool.activate();
        setOutletForTool(defaultTool);
    });

    rulerTool.addEventListener && rulerTool.addEventListener('activated', () => setOutletForTool(rulerTool));
    rulerTool.addEventListener && rulerTool.addEventListener('deactivated', () => {
        const active = toolkit.paperScope?.getActiveTool?.() || defaultTool;
        setOutletForTool(active);
    });

    const toolRow = document.createElement('div');
    toolRow.classList.add('btn-group', 'btn-group-sm');
    toolRow.append(activateRulerBtn, activateDefaultBtn);

    container.append(statusEl, btnRow, hint, toolRow);

    setOutletForTool(defaultTool);
}

const viewer = window.viewer = OpenSeadragon({
    element: 'listener-api-viewer',
    ...commonViewerOpts,
});

viewer.addOnceHandler('open', () => {
    const tk = new AnnotationToolkit(viewer, { addUI: false, cacheAnnotations: true });
    tk.addTools(['default', 'ruler']);
    window.tk = tk;
    setupListenerApiPanel(tk);
});

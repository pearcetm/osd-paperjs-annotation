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
    crossOriginPolicy: 'Anonymous',
    ajaxWithCredentials: false,
    drawer: 'webgl',
};

const HEADLESS_TOOL_NAMES = ['default', 'ruler'];

function setupRulerHeadlessButtonsAndOutlet(toolkit) {
    const headlessControls = document.getElementById('ruler-headless-controls');
    const buttonContainer = headlessControls?.querySelector('.headless-tool-buttons');
    const outlet = document.getElementById('ruler-headless-tool-outlet');
    if (!headlessControls || !buttonContainer || !outlet) return;

    buttonContainer.replaceChildren();
    outlet.replaceChildren();

    const defaultTool = toolkit.getTool('default');
    const project = toolkit.paperScope?.project;

    const wrapper = document.createElement('div');
    wrapper.className = 'headless-toolbar-and-list';
    const toolbarCol = document.createElement('div');
    toolbarCol.className = 'headless-toolbar-outlet';
    const measurementsPanel = document.createElement('div');
    measurementsPanel.className = 'headless-measurements-panel';
    const measurementsHeading = document.createElement('h5');
    measurementsHeading.textContent = 'Measurements';
    const measurementsList = document.createElement('ul');
    measurementsList.className = 'headless-measurements-list';
    measurementsPanel.append(measurementsHeading, measurementsList);
    wrapper.append(toolbarCol, measurementsPanel);
    outlet.append(wrapper);

    const itemToRow = new WeakMap();

    function setOutletForTool(tool) {
        if (!tool) return;
        const ctrl = tool.getToolbarControl && tool.getToolbarControl();
        if (ctrl && ctrl.dropdown) toolbarCol.replaceChildren(ctrl.dropdown);
        else toolbarCol.replaceChildren();
    }

    function formatMeasurementLabel(payload) {
        if (payload.label && payload.label !== 'Measurement') return payload.label;
        if (payload.distance != null) {
            const ruler = payload.item?.data?.ruler;
            const units = ruler?.units ?? 'px';
            const unitsPerPixel = ruler?.unitsPerPixel != null ? Number(ruler.unitsPerPixel) : 1;
            const value = payload.distance * unitsPerPixel;
            return `Length: ${Number(value).toFixed(2)} ${units}`;
        }
        return payload.label || 'Measurement';
    }

    function addOrUpdateMeasurementRow(payload) {
        const item = payload.item;
        let row = itemToRow.get(item);
        const labelText = formatMeasurementLabel(payload);
        if (row) {
            const labelEl = row.querySelector('.headless-measurement-label');
            if (labelEl) labelEl.textContent = labelText;
            return;
        }
        row = document.createElement('li');
        row.className = 'headless-measurement-row';
        row._paperItem = item;

        const labelEl = document.createElement('span');
        labelEl.className = 'headless-measurement-label';
        labelEl.textContent = labelText;
        labelEl.addEventListener('click', () => {
            if (item.project && typeof item.select === 'function') item.select();
        });

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'headless-measurement-remove';
        removeBtn.setAttribute('aria-label', 'Remove measurement');
        removeBtn.textContent = 'Remove';
        removeBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (item.remove) item.remove();
        });

        row.append(labelEl, removeBtn);
        measurementsList.appendChild(row);
        itemToRow.set(item, row);
    }

    function removeMeasurementRow(item) {
        const row = itemToRow.get(item);
        if (row) {
            row.remove();
            itemToRow.delete(item);
        }
    }

    function updateListSelectionHighlight() {
        const selected = toolkit.paperScope?.findSelectedItems?.() ?? [];
        const single = selected.length === 1 ? selected[0] : null;
        measurementsList.querySelectorAll('.headless-measurement-row').forEach((row) => {
            row.classList.toggle('selected', row._paperItem === single);
        });
    }

    if (project) {
        project.on('ruler-measurement-updated', (payload) => {
            addOrUpdateMeasurementRow(payload);
            updateListSelectionHighlight();
        });
        project.on('item-removed', (ev) => removeMeasurementRow(ev.item));
        project.on('item-selected', updateListSelectionHighlight);
        project.on('item-deselected', updateListSelectionHighlight);
    }

    function updateButtonActiveState() {
        buttonContainer.querySelectorAll('button[data-tool-name]').forEach((btn) => {
            const name = btn.getAttribute('data-tool-name');
            const tool = toolkit.getTool(name);
            if (tool && tool.isActive && tool.isActive()) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    HEADLESS_TOOL_NAMES.forEach((name) => {
        const tool = toolkit.getTool(name);
        if (!tool || !tool.getToolbarControl) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('data-tool-name', name);
        btn.textContent = name.charAt(0).toUpperCase() + name.slice(1);

        btn.addEventListener('click', () => {
            if (tool.isActive()) {
                tool.deactivate(true);
                setOutletForTool(defaultTool);
                updateButtonActiveState();
            } else {
                if (name === 'ruler') {
                    const selected = toolkit.paperScope?.findSelectedItems?.() ?? [];
                    const single = selected.length === 1 ? selected[0] : null;
                    const isMeasurement = single?.annotationItem?.getGeoJSONType?.()?.subtype === 'Measurement';
                    tool.activate(isMeasurement ? {} : { createNewItem: true });
                } else {
                    tool.activate({});
                }
                setOutletForTool(tool);
                updateButtonActiveState();
            }
        });

        tool.addEventListener && tool.addEventListener('activated', () => {
            setOutletForTool(tool);
            updateButtonActiveState();
        });
        tool.addEventListener && tool.addEventListener('deactivated', () => {
            if (name === 'ruler') {
                toolkit.paperScope?.findSelectedItems?.()?.forEach((item) => item.deselect());
            }
            const active = toolkit.paperScope?.getActiveTool?.() || defaultTool;
            setOutletForTool(active);
            updateButtonActiveState();
        });

        buttonContainer.appendChild(btn);
    });

    setOutletForTool(defaultTool);
    updateButtonActiveState();
}

const viewer = window.viewer = OpenSeadragon({
    element: 'ruler-viewer-headless',
    ...commonViewerOpts,
});

viewer.addOnceHandler('open', () => {
    const tk = new AnnotationToolkit(viewer, { addUI: false, cacheAnnotations: true });
    tk.addTools(['default', 'ruler']);
    window.tk = tk;

    setupRulerHeadlessButtonsAndOutlet(tk);
});

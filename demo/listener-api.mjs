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
    const panel = document.getElementById('listener-api-panel');
    if (!panel) return;

    // Prefer toolkit-level helpers (project-only): tk.on/off == tk.paperScope.project.on/off
    if (!toolkit.on || !toolkit.off) return;

    panel.replaceChildren();

    const STORAGE_KEY = 'osd-paperjs-annotation.listenerApi.selectedEvents.v1';
    const PANEL_KEY = 'osd-paperjs-annotation.listenerApi.panelOpen.v1';

    const logEl = document.getElementById('listener-api-log');
    const logClearBtn = document.getElementById('listener-api-log-clear');
    const MAX_LOG_ENTRIES = 400;

    function normalizeForDisplay(payload) {
        // Avoid circular refs and keep payloads readable in the demo.
        // NOTE: This is only for display.
        try {
            return JSON.parse(JSON.stringify(payload, (k, v) => {
                if (k === 'tool' || k === 'fromTool' || k === 'toTool') return v?.toolName || v?.constructor?.name || '[tool]';
                if (k === 'primary' && v && v.id != null) return { id: v.id, name: v.name, toolName: v.toolName };
                return v;
            }));
        } catch (e) {
            return payload;
        }
    }

    function isPlainObject(v) {
        if (v == null || typeof v !== 'object') return false;
        const proto = Object.getPrototypeOf(v);
        return proto === Object.prototype || proto === null;
    }

    function previewValue(v) {
        if (v == null) return String(v);
        const t = typeof v;
        if (t === 'string') {
            const s = v.length > 80 ? v.slice(0, 77) + '…' : v;
            return JSON.stringify(s);
        }
        if (t === 'number' || t === 'boolean') return String(v);
        if (Array.isArray(v)) return `Array(${v.length})`;
        if (isPlainObject(v)) {
            const keys = Object.keys(v);
            return `{${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ', …' : ''}}`;
        }
        return v.constructor?.name ? `[${v.constructor.name}]` : '[object]';
    }

    function renderTreeNode(keyLabel, value) {
        const container = document.createElement('div');
        container.classList.add('tree-node');

        const isObj = isPlainObject(value);
        const isArr = Array.isArray(value);

        const makeRow = ({ keyText, expandable, valueText }) => {
            const row = document.createElement('div');
            row.classList.add('tree-row');

            const keyEl = document.createElement('span');
            keyEl.classList.add('tree-key');
            keyEl.textContent = keyText ?? '';

            const markerEl = document.createElement('span');
            markerEl.classList.add('tree-marker');
            markerEl.textContent = expandable ? '▸' : '';

            const valueEl = document.createElement('span');
            valueEl.classList.add('tree-value');
            valueEl.textContent = valueText ?? '';

            row.append(keyEl, markerEl, valueEl);
            return row;
        };

        if (!isObj && !isArr) {
            const row = makeRow({
                keyText: keyLabel ? `${keyLabel}:` : '',
                expandable: false,
                valueText: previewValue(value),
            });
            container.appendChild(row);
            return container;
        }

        const details = document.createElement('details');
        details.open = false; // collapsed by default
        details.classList.add('tree-details');

        const summary = document.createElement('summary');
        summary.classList.add('tree-summary');
        const rowConfig = {
            keyText: keyLabel ? `${keyLabel}:` : '',
            expandable: true,
            valueText: previewValue(value),
        };
        summary.appendChild(makeRow(rowConfig));
        // Align child keys with the parent marker's left edge.
        details.style.setProperty('--tree-key-ch', `${rowConfig.keyText.length}ch`);
        details.appendChild(summary);

        // Lazy render children on first expand
        let rendered = false;
        const childrenWrap = document.createElement('div');
        childrenWrap.classList.add('tree-children');
        details.appendChild(childrenWrap);

        details.addEventListener('toggle', () => {
            // keep marker direction in sync
            const marker = summary.querySelector('.tree-marker');
            if (marker) marker.textContent = details.open ? '▾' : '▸';
            if (!details.open || rendered) return;
            rendered = true;

            if (isArr) {
                value.forEach((item, idx) => {
                    childrenWrap.appendChild(renderTreeNode(String(idx), item));
                });
            } else {
                Object.keys(value).forEach((k) => {
                    childrenWrap.appendChild(renderTreeNode(k, value[k]));
                });
            }
        });

        container.appendChild(details);
        return container;
    }

    function appendLog(name, payload) {
        if (!logEl) return;
        const atBottom = Math.abs(logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight) < 4;

        const row = document.createElement('div');
        row.classList.add('listener-log-row');
        const ts = new Date().toLocaleTimeString();

        const header = document.createElement('div');
        header.textContent = `[${ts}] ${name}`;
        header.classList.add('listener-log-header');

        const displayPayload = normalizeForDisplay(payload);
        const tree = renderTreeNode('', displayPayload);
        tree.classList.add('listener-log-payload');

        row.append(header, tree);
        logEl.appendChild(row);

        // Trim old entries
        while (logEl.childElementCount > MAX_LOG_ENTRIES) {
            logEl.removeChild(logEl.firstElementChild);
        }

        if (atBottom) logEl.scrollTop = logEl.scrollHeight;
    }

    logClearBtn?.addEventListener('click', () => {
        if (logEl) logEl.replaceChildren();
    });

    const panelToggleBtn = document.getElementById('listener-api-panel-toggle');
    const body = document.body;
    function setPanelOpen(open) {
        body.classList.toggle('listener-panel-collapsed', !open);
        if (panelToggleBtn) panelToggleBtn.textContent = open ? 'Hide events' : 'Show events';
        try { localStorage.setItem(PANEL_KEY, JSON.stringify(!!open)); } catch (e) {}
    }
    function getPanelOpen() {
        try {
            const raw = localStorage.getItem(PANEL_KEY);
            if (raw == null) return true;
            const parsed = JSON.parse(raw);
            return parsed !== false;
        } catch (e) {
            return true;
        }
    }
    setPanelOpen(getPanelOpen());
    panelToggleBtn?.addEventListener('click', () => setPanelOpen(body.classList.contains('listener-panel-collapsed')));

    const EVENT_GROUPS = [
        {
            id: 'core',
            title: 'Core hooks',
            events: [
                'active-tool-changed',
                'tool-activated',
                'tool-deactivated',
                'mode-changed',
            ],
        },
        {
            id: 'selection',
            title: 'Selection hooks',
            events: [
                'selection-changed',
                'item-selected',
                'item-deselected',
            ],
        },
        {
            id: 'items',
            title: 'Item lifecycle hooks',
            events: [
                'item-created',
                'item-updated',
                'item-converted',
                'item-removed',
                'items-changed',
            ],
        },
        {
            id: 'toolUi',
            title: 'Tool UI / settings hooks',
            events: [
                // Ruler
                'ruler-measurement-updated',
                'ruler-details-open-changed',
                'ruler-setting-changed',
                // Brush
                'brush-radius-changed',
                'brush-erase-mode-changed',
                // Linestring
                'linestring-width-changed',
                'linestring-erase-mode-changed',
                // Wand
                'wand-threshold-changed',
                'wand-mode-changed',
                'wand-preview-changed',
                // Polygon
                'polygon-erase-mode-changed',
                'polygon-simplified',
                'polygon-history-changed',
                // Style
                'style-colorpicker-open-changed',
                'style-color-changed',
                'style-stroke-width-changed',
                'style-opacity-changed',
                'style-pick-from-image-clicked',
                'style-pick-from-average-clicked',
                'style-target-selection-toggled',
                'style-hierarchy-cycled',
                // Text
                'text-value-changed',
                // Raster
                'rasterized',
            ],
        },
    ];

    const allEvents = EVENT_GROUPS.map((g) => g.events).flat();

    const selectedEvents = new Set();
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        if (Array.isArray(parsed)) parsed.forEach((e) => selectedEvents.add(e));
        // default: enable core hooks if no prior selection
        if (!raw) EVENT_GROUPS.find((g) => g.id === 'core')?.events.forEach((e) => selectedEvents.add(e));
    } catch (e) {
        EVENT_GROUPS.find((g) => g.id === 'core')?.events.forEach((ev) => selectedEvents.add(ev));
    }

    const handlers = new Map();
    function setLast(name, payload) {
        statusEl.textContent = `Listening. Last event: ${name}`;
        try {
            payloadEl.textContent = JSON.stringify(payload, (k, v) => {
                if (k === 'tool' || k === 'fromTool' || k === 'toTool') return v?.toolName || v?.constructor?.name || '[tool]';
                if (k === 'primary' && v && v.id != null) return { id: v.id, name: v.name, toolName: v.toolName };
                return v;
            }, 2);
        } catch (e) {
            payloadEl.textContent = String(payload);
        }
    }

    allEvents.forEach((name) => {
        handlers.set(name, (payload) => {
            setLast(name, payload);
            appendLog(name, payload);
        });
    });

    let listening = false;

    function persistSelection() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(selectedEvents)));
        } catch (e) {}
    }

    function attach() {
        if (listening) return;
        selectedEvents.forEach((name) => toolkit.on(name, handlers.get(name)));
        listening = true;
        subscribeBtn.disabled = true;
        unsubscribeBtn.disabled = false;
        setLast('—', {});
    }

    function detach() {
        if (!listening) return;
        selectedEvents.forEach((name) => toolkit.off(name, handlers.get(name)));
        listening = false;
        subscribeBtn.disabled = false;
        unsubscribeBtn.disabled = true;
        statusEl.textContent = 'Not listening.';
    }

    // UI
    const title = document.createElement('h4');
    title.textContent = 'Event picker';

    const statusEl = document.createElement('div');
    statusEl.setAttribute('aria-live', 'polite');
    statusEl.classList.add('listener-row');
    statusEl.textContent = 'Not listening.';

    const controlsRow = document.createElement('div');
    controlsRow.classList.add('btn-group', 'btn-group-sm', 'listener-row');

    const subscribeBtn = document.createElement('button');
    subscribeBtn.type = 'button';
    subscribeBtn.classList.add('btn', 'btn-sm');
    subscribeBtn.textContent = 'Subscribe';

    const unsubscribeBtn = document.createElement('button');
    unsubscribeBtn.type = 'button';
    unsubscribeBtn.classList.add('btn', 'btn-sm');
    unsubscribeBtn.textContent = 'Unsubscribe';
    unsubscribeBtn.disabled = true;

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.classList.add('btn', 'btn-sm');
    clearBtn.textContent = 'Clear payload';

    controlsRow.append(subscribeBtn, unsubscribeBtn, clearBtn);

    const searchRow = document.createElement('div');
    searchRow.classList.add('listener-row');
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = 'Search events…';
    search.classList.add('listener-search');
    searchRow.appendChild(search);

    const bulkRow = document.createElement('div');
    bulkRow.classList.add('btn-group', 'btn-group-sm', 'listener-row');
    const selectAllBtn = document.createElement('button');
    selectAllBtn.type = 'button';
    selectAllBtn.classList.add('btn', 'btn-sm');
    selectAllBtn.textContent = 'Select all';
    const selectNoneBtn = document.createElement('button');
    selectNoneBtn.type = 'button';
    selectNoneBtn.classList.add('btn', 'btn-sm');
    selectNoneBtn.textContent = 'Select none';
    bulkRow.append(selectAllBtn, selectNoneBtn);

    const list = document.createElement('div');
    list.classList.add('listener-event-list');

    const payloadEl = document.createElement('pre');
    payloadEl.classList.add('listener-last');
    payloadEl.textContent = '';

    function makeCheckbox(name) {
        const label = document.createElement('label');
        label.classList.add('listener-check');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = selectedEvents.has(name);
        cb.addEventListener('change', () => {
            if (cb.checked) selectedEvents.add(name);
            else selectedEvents.delete(name);

            // If currently listening, update live subscriptions.
            if (listening) {
                if (cb.checked) toolkit.on(name, handlers.get(name));
                else toolkit.off(name, handlers.get(name));
            }
            persistSelection();
            render();
        });
        const text = document.createElement('span');
        text.textContent = name;
        label.append(cb, text);
        label.dataset.eventName = name;
        return label;
    }

    const groupDetails = new Map();

    function render() {
        const q = (search.value || '').trim().toLowerCase();
        list.replaceChildren();

        EVENT_GROUPS.forEach((g) => {
            const details = document.createElement('details');
            details.open = true;
            const summary = document.createElement('summary');
            const selectedInGroup = g.events.filter((e) => selectedEvents.has(e)).length;
            summary.textContent = `${g.title} (${selectedInGroup}/${g.events.length})`;
            details.appendChild(summary);

            const groupBtnRow = document.createElement('div');
            groupBtnRow.classList.add('btn-group', 'btn-group-sm');
            groupBtnRow.style.margin = '0.35rem 0 0.25rem 0';
            const gAll = document.createElement('button');
            gAll.type = 'button';
            gAll.classList.add('btn', 'btn-sm');
            gAll.textContent = 'All';
            const gNone = document.createElement('button');
            gNone.type = 'button';
            gNone.classList.add('btn', 'btn-sm');
            gNone.textContent = 'None';
            groupBtnRow.append(gAll, gNone);
            details.appendChild(groupBtnRow);

            gAll.addEventListener('click', () => {
                g.events.forEach((name) => selectedEvents.add(name));
                if (listening) g.events.forEach((name) => toolkit.on(name, handlers.get(name)));
                persistSelection();
                render();
            });
            gNone.addEventListener('click', () => {
                g.events.forEach((name) => {
                    selectedEvents.delete(name);
                    if (listening) toolkit.off(name, handlers.get(name));
                });
                persistSelection();
                render();
            });

            g.events.forEach((name) => {
                if (q && !name.toLowerCase().includes(q)) return;
                details.appendChild(makeCheckbox(name));
            });

            list.appendChild(details);
            groupDetails.set(g.id, details);
        });
    }

    subscribeBtn.addEventListener('click', attach);
    unsubscribeBtn.addEventListener('click', detach);
    clearBtn.addEventListener('click', () => { payloadEl.textContent = ''; });
    selectAllBtn.addEventListener('click', () => {
        allEvents.forEach((name) => selectedEvents.add(name));
        if (listening) allEvents.forEach((name) => toolkit.on(name, handlers.get(name)));
        persistSelection();
        render();
    });
    selectNoneBtn.addEventListener('click', () => {
        allEvents.forEach((name) => {
            selectedEvents.delete(name);
            if (listening) toolkit.off(name, handlers.get(name));
        });
        persistSelection();
        render();
    });
    search.addEventListener('input', render);

    const hint = document.createElement('div');
    hint.style.fontSize = '0.9em';
    hint.style.color = '#666';
    hint.classList.add('listener-row');
    hint.textContent = 'Select events, then Subscribe. While subscribed, checking/unchecking events will attach/detach listeners immediately.';

    const header = document.createElement('div');
    header.classList.add('listener-panel-header');
    header.append(title, statusEl, controlsRow, searchRow, bulkRow, hint);

    panel.append(header, list, payloadEl);
    render();
}

const viewer = window.viewer = OpenSeadragon({
    element: 'listener-api-viewer',
    ...commonViewerOpts,
});

viewer.addOnceHandler('open', () => {
    const tk = new AnnotationToolkit(viewer, { cacheAnnotations: true, events: { project: true, toolkit: false } });
    tk.addAnnotationUI({ autoOpen: true });
    window.tk = tk;
    setupListenerApiPanel(tk);
});

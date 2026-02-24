/**
 * Demo: full suite of toolkit configurations. Select from dropdown to switch
 * configuration; code snippets show the application code for each.
 */
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

const tools = ['default', 'style', 'select', 'transform', 'brush', 'ruler'];

const CONTAINER_ID = 'viewer-container';

/**
 * Configuration entries: id, label, group (for optgroup), apply(viewer), snippet.
 */
const configurations = [
    {
        id: 'headless',
        label: 'Headless (no UI)',
        group: 'Headless',
        apply: (viewer) => {
            const tk = new AnnotationToolkit(viewer, { addUI: false, cacheAnnotations: true });
            tk.addTools(['default', 'ruler']);
            return tk;
        },
        snippet: `const tk = new AnnotationToolkit(viewer, { addUI: false });
tk.addTools(['default', 'ruler']);
// Add your own buttons to toggle tools: tk.getTool(name).activate() / .deactivate(true).
// Attach the active tool's UI to a container: outlet.replaceChildren(tk.getTool(name).getToolbarControl().dropdown);`,
    },
    {
        id: 'full-annotation-ui',
        label: 'Full AnnotationUI',
        group: 'AnnotationUI',
        apply: (viewer) => {
            const tk = new AnnotationToolkit(viewer, { cacheAnnotations: true });
            tk.addAnnotationUI({ autoOpen: true, tools, addToolbar: true, addLayerUI: true, addFileButton: true });
            return tk;
        },
        snippet: `const tk = new AnnotationToolkit(viewer, { cacheAnnotations: true });
tk.addAnnotationUI({
  autoOpen: true,
  tools: ['default', 'style', 'select', 'transform', 'brush', 'ruler'],
  addToolbar: true,
  addLayerUI: true,
  addFileButton: true,
});`,
    },
    {
        id: 'annotation-ui-initial-closed',
        label: 'AnnotationUI: initial closed',
        group: 'AnnotationUI',
        apply: (viewer) => {
            const tk = new AnnotationToolkit(viewer, { cacheAnnotations: true });
            tk.addAnnotationUI({ autoOpen: false, tools, addToolbar: true, addLayerUI: true, addFileButton: true });
            return tk;
        },
        snippet: `const tk = new AnnotationToolkit(viewer, { cacheAnnotations: true });
tk.addAnnotationUI({
  autoOpen: false,
  tools,
  addToolbar: true,
  addLayerUI: true,
  addFileButton: true,
});`,
    },
    {
        id: 'annotation-ui-no-toggle',
        label: 'AnnotationUI: no toggle button',
        group: 'AnnotationUI',
        apply: (viewer) => {
            const tk = new AnnotationToolkit(viewer, { cacheAnnotations: true });
            tk.addAnnotationUI({ autoOpen: true, addButton: false, tools, addToolbar: true, addLayerUI: true, addFileButton: true });
            return tk;
        },
        snippet: `const tk = new AnnotationToolkit(viewer, { cacheAnnotations: true });
tk.addAnnotationUI({
  autoOpen: true,
  addButton: false,
  tools,
  addToolbar: true,
  addLayerUI: true,
  addFileButton: true,
});`,
    },
    {
        id: 'new-layout-full',
        label: 'New layout: full',
        group: 'New layout',
        apply: (viewer) => {
            const tk = new AnnotationToolkit(viewer, { addUI: false, cacheAnnotations: true });
            tk.getToolbar({ tools });
            tk.getLayerUI({ addFileButton: true });
            tk.addAnnotationLayout({ addButton: true, initialOpen: true });
            return tk;
        },
        snippet: `const tk = new AnnotationToolkit(viewer, { addUI: false, cacheAnnotations: true });
tk.getToolbar({ tools });
tk.getLayerUI({ addFileButton: true });
tk.addAnnotationLayout({ addButton: true, initialOpen: true });`,
    },
    {
        id: 'new-layout-toolbar-only',
        label: 'New layout: toolbar only',
        group: 'New layout',
        apply: (viewer) => {
            const tk = new AnnotationToolkit(viewer, { addUI: false, cacheAnnotations: true });
            tk.getToolbar({ tools });
            tk.addAnnotationLayout({ addButton: true, initialOpen: true });
            return tk;
        },
        snippet: `const tk = new AnnotationToolkit(viewer, { addUI: false, cacheAnnotations: true });
tk.getToolbar({ tools });
tk.addAnnotationLayout({ addButton: true, initialOpen: true });`,
    },
    {
        id: 'new-layout-layer-only',
        label: 'New layout: layer UI only',
        group: 'New layout',
        apply: (viewer) => {
            const tk = new AnnotationToolkit(viewer, { addUI: false, cacheAnnotations: true });
            tk.getLayerUI({ addFileButton: true });
            tk.addAnnotationLayout({ addButton: true, initialOpen: true });
            return tk;
        },
        snippet: `const tk = new AnnotationToolkit(viewer, { addUI: false, cacheAnnotations: true });
tk.getLayerUI({ addFileButton: true });
tk.addAnnotationLayout({ addButton: true, initialOpen: true });`,
    },
    {
        id: 'new-layout-initial-closed',
        label: 'New layout: initial closed',
        group: 'New layout',
        apply: (viewer) => {
            const tk = new AnnotationToolkit(viewer, { addUI: false, cacheAnnotations: true });
            tk.getToolbar({ tools });
            tk.getLayerUI({ addFileButton: true });
            tk.addAnnotationLayout({ addButton: true, initialOpen: false });
            return tk;
        },
        snippet: `const tk = new AnnotationToolkit(viewer, { addUI: false, cacheAnnotations: true });
tk.getToolbar({ tools });
tk.getLayerUI({ addFileButton: true });
tk.addAnnotationLayout({ addButton: true, initialOpen: false });`,
    },
    {
        id: 'new-layout-no-toggle',
        label: 'New layout: no toggle button',
        group: 'New layout',
        apply: (viewer) => {
            const tk = new AnnotationToolkit(viewer, { addUI: false, cacheAnnotations: true });
            tk.getToolbar({ tools });
            tk.getLayerUI({ addFileButton: true });
            tk.addAnnotationLayout({ addButton: false, initialOpen: true });
            return tk;
        },
        snippet: `const tk = new AnnotationToolkit(viewer, { addUI: false, cacheAnnotations: true });
tk.getToolbar({ tools });
tk.getLayerUI({ addFileButton: true });
tk.addAnnotationLayout({ addButton: false, initialOpen: true });`,
    },
    {
        id: 'custom-placement',
        label: 'New layout: custom placement (UI outside viewer)',
        group: 'New layout',
        apply: (viewer) => {
            const tk = new AnnotationToolkit(viewer, { addUI: false, cacheAnnotations: true });
            tk.getToolbar({ tools });
            tk.getLayerUI({ addFileButton: true });
            document.getElementById('toolbar-container').appendChild(tk.getToolbar().element);
            document.getElementById('layerui-container').appendChild(tk.getLayerUI().element);
            return tk;
        },
        snippet: `const tk = new AnnotationToolkit(viewer, { addUI: false, cacheAnnotations: true });
tk.getToolbar({ tools });
tk.getLayerUI({ addFileButton: true });
// No addAnnotationLayout – place UI in your own layout (use your container refs):
toolbarContainer.appendChild(tk.getToolbar().element);
layerUIContainer.appendChild(tk.getLayerUI().element);`,
    },
    {
        id: 'constructor-full-layout',
        label: 'Constructor: full layout',
        group: 'Constructor',
        apply: (viewer) => {
            const tk = new AnnotationToolkit(viewer, {
                cacheAnnotations: true,
                toolbar: { tools },
                layerUI: { addFileButton: true },
                layout: { addButton: true, initialOpen: true },
            });
            return tk;
        },
        snippet: `const tk = new AnnotationToolkit(viewer, {
  cacheAnnotations: true,
  toolbar: { tools },
  layerUI: { addFileButton: true },
  layout: { addButton: true, initialOpen: true },
});`,
    },
    {
        id: 'constructor-layout-initial-closed',
        label: 'Constructor: layout initial closed',
        group: 'Constructor',
        apply: (viewer) => {
            const tk = new AnnotationToolkit(viewer, {
                cacheAnnotations: true,
                toolbar: { tools },
                layerUI: { addFileButton: true },
                layout: { addButton: true, initialOpen: false },
            });
            return tk;
        },
        snippet: `const tk = new AnnotationToolkit(viewer, {
  cacheAnnotations: true,
  toolbar: { tools },
  layerUI: { addFileButton: true },
  layout: { addButton: true, initialOpen: false },
});`,
    },
    {
        id: 'constructor-toolbar-layout-only',
        label: 'Constructor: toolbar + layout only',
        group: 'Constructor',
        apply: (viewer) => {
            const tk = new AnnotationToolkit(viewer, {
                cacheAnnotations: true,
                toolbar: { tools },
                layout: { addButton: true, initialOpen: true },
            });
            return tk;
        },
        snippet: `const tk = new AnnotationToolkit(viewer, {
  cacheAnnotations: true,
  toolbar: { tools },
  layout: { addButton: true, initialOpen: true },
});`,
    },
    {
        id: 'constructor-add-ui',
        label: 'Constructor addUI (deprecated)',
        group: 'Other',
        apply: (viewer) => {
            const tk = new AnnotationToolkit(viewer, {
                cacheAnnotations: true,
                addUI: { autoOpen: true, tools, addToolbar: true, addLayerUI: true, addFileButton: true },
            });
            return tk;
        },
        snippet: `// Deprecated: use toolbar/layerUI/layout options instead (see "Constructor: full layout").
const tk = new AnnotationToolkit(viewer, {
  cacheAnnotations: true,
  addUI: {
    autoOpen: true,
    tools: ['default', 'style', 'select', 'transform', 'brush', 'ruler'],
    addToolbar: true,
    addLayerUI: true,
    addFileButton: true,
  },
});`,
    },
];

let currentViewer = null;
let currentToolkit = null;
const codeEl = document.getElementById('config-code');
const selectEl = document.getElementById('config-select');

function getConfigById(id) {
    return configurations.find((c) => c.id === id) || configurations[0];
}

const LAYOUT_MAIN_ID = 'layout-main';
const HEADLESS_TOOL_NAMES = ['default', 'ruler'];

function hideHeadlessControls() {
    const headlessControls = document.getElementById('headless-controls');
    const outlet = document.getElementById('headless-tool-outlet');
    if (headlessControls) headlessControls.style.display = 'none';
    if (outlet) outlet.replaceChildren();
}

function setupHeadlessToolButtonsAndOutlet(toolkit) {
    const headlessControls = document.getElementById('headless-controls');
    const buttonContainer = headlessControls?.querySelector('.headless-tool-buttons');
    const outlet = document.getElementById('headless-tool-outlet');
    if (!headlessControls || !buttonContainer || !outlet) return;

    headlessControls.style.display = '';
    buttonContainer.replaceChildren();
    outlet.replaceChildren();

    const defaultTool = toolkit.getTool('default');

    function setOutletForTool(tool) {
        if (!tool) return;
        const ctrl = tool.getToolbarControl && tool.getToolbarControl();
        if (ctrl && ctrl.dropdown) outlet.replaceChildren(ctrl.dropdown);
    }

    function updateButtonActiveState(activeTool) {
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
                updateButtonActiveState(null);
            } else {
                tool.activate(name === 'default' ? {} : { createNewItem: true });
                setOutletForTool(tool);
                updateButtonActiveState(tool);
            }
        });

        tool.addEventListener && tool.addEventListener('activated', () => {
            setOutletForTool(tool);
            updateButtonActiveState(tool);
        });
        tool.addEventListener && tool.addEventListener('deactivated', () => {
            const active = toolkit.paperScope?.getActiveTool?.() || defaultTool;
            setOutletForTool(active);
            updateButtonActiveState(active);
        });

        buttonContainer.appendChild(btn);
    });

    setOutletForTool(defaultTool);
    updateButtonActiveState(toolkit.paperScope && toolkit.paperScope.getActiveTool ? toolkit.paperScope.getActiveTool() : defaultTool);
}

function applyConfiguration(configId) {
    const config = getConfigById(configId);
    if (!config) return;

    hideHeadlessControls();

    const layoutMain = document.getElementById(LAYOUT_MAIN_ID);
    if (layoutMain) {
        if (configId === 'custom-placement') {
            layoutMain.classList.add('custom-placement');
        } else {
            layoutMain.classList.remove('custom-placement');
        }
    }

    if (currentToolkit) {
        currentToolkit.destroy();
        currentToolkit = null;
    }
    if (currentViewer) {
        currentViewer.destroy();
        currentViewer = null;
    }

    currentViewer = OpenSeadragon({
        element: CONTAINER_ID,
        ...commonViewerOpts,
    });

    currentViewer.addOnceHandler('open', () => {
        currentToolkit = config.apply(currentViewer);
        window.tk = currentToolkit;
        window.viewer = currentViewer;
        if (configId === 'headless') {
            setupHeadlessToolButtonsAndOutlet(currentToolkit);
        }
    });

    codeEl.textContent = config.snippet;
}

function buildSelect() {
    const groups = {};
    configurations.forEach((c) => {
        if (!groups[c.group]) groups[c.group] = [];
        groups[c.group].push(c);
    });
    const order = ['Headless', 'AnnotationUI', 'New layout', 'Constructor', 'Other'];
    order.forEach((groupName) => {
        const opts = groups[groupName];
        if (!opts || opts.length === 0) return;
        const optgroup = document.createElement('optgroup');
        optgroup.label = groupName;
        opts.forEach((c) => {
            const option = document.createElement('option');
            option.value = c.id;
            option.textContent = c.label;
            optgroup.appendChild(option);
        });
        selectEl.appendChild(optgroup);
    });
}

buildSelect();
const initialId = configurations[0].id;
selectEl.value = initialId;
applyConfiguration(initialId);

selectEl.addEventListener('change', () => {
    applyConfiguration(selectEl.value);
});

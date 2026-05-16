/**
 * OpenSeadragon paperjs overlay plugin based on paper.js
 * @version 0.7.2
 *
 * Copyright (c) 2022-2026, Thomas Pearce
 * All rights reserved.
 */

import { ToolBase } from './papertools/base.mjs';
import { DefaultTool } from './papertools/default.mjs';
import { WandTool } from './papertools/wand.mjs';
import { BrushTool } from './papertools/brush.mjs';
import { PointTool } from './papertools/point.mjs';
import { PointTextTool } from './papertools/pointtext.mjs';
import { RectangleTool } from './papertools/rectangle.mjs';
import { EllipseTool } from './papertools/ellipse.mjs';
import { StyleTool } from './papertools/style.mjs';
import { LinestringTool } from './papertools/linestring.mjs';
import { RulerTool } from './papertools/ruler.mjs';
import { PolygonTool } from './papertools/polygon.mjs';
import { SelectTool } from './papertools/select.mjs';
import { TransformTool } from './papertools/transform.mjs';
import { RasterTool } from './papertools/raster.mjs';

/**
 * Map of tool names to constructors.
 * @type {Object.<string, Function>}
 */
const toolConstructors = {
    default: DefaultTool,
    select: SelectTool,
    transform: TransformTool,
    style: StyleTool,
    rectangle: RectangleTool,
    ellipse: EllipseTool,
    point: PointTool,
    text: PointTextTool,
    polygon: PolygonTool,
    brush: BrushTool,
    wand: WandTool,
    linestring: LinestringTool,
    ruler: RulerTool,
    raster: RasterTool,
};

/**
 * Manages the tool layer, tool instances, and mode logic. No DOM.
 * AnnotationToolbar is an optional visual wrapper over a toolset.
 * @memberof OSDPaperjsAnnotation
 * @class
 */
class AnnotationToolset {
    /**
     * @param {paper.PaperScope} paperScope - The Paper.js scope.
     * @param {string[]} [toolNames] - Array of tool names to create. If omitted, all tools are created. 'default' is always included.
     */
    constructor(paperScope, toolNames) {
        if (toolNames != null && !Array.isArray(toolNames)) {
            throw new Error('toolNames must be an array of tool name strings');
        }
        this.paperScope = paperScope;
        this.currentMode = null;
        this.setModeTimeout = null;
        /** @type {Function|null} Called when mode changes: (mode) => void */
        this.onModeChanged = null;

        const toolLayer = new paperScope.Layer();
        toolLayer.isGeoJSONFeatureCollection = false;
        toolLayer.name = 'toolLayer';
        toolLayer.applyMatrix = false;
        paperScope.project.addLayer(toolLayer);
        this.toolLayer = toolLayer;

        let toolsToUse = toolNames || Object.keys(toolConstructors);
        if (toolsToUse.indexOf('default') === -1) {
            toolsToUse = ['default', ...toolsToUse];
        }

        this.tools = {};
        paperScope.activate();

        toolsToUse.forEach((t) => {
            if (typeof t === 'string') {
                if (!toolConstructors[t]) {
                    console.warn(`The requested tool is invalid: ${t}. No constructor found.`);
                    return;
                }
            } else if (!(t instanceof ToolBase)) {
                console.warn('Tool must inherit from ToolBase');
                return;
            }
            const ToolConstructor = typeof t === 'string' ? toolConstructors[t] : t;
            const toolObj = new ToolConstructor(this.paperScope);
            const toolKey = typeof t === 'string' ? t : ToolConstructor.name;
            toolObj.toolName = toolKey;
            this.tools[toolKey] = toolObj;
            toolObj.addEventListener('deactivated', (ev) => {
                if (ev.target === this.paperScope.getActiveTool()) {
                    this.tools.default.activate();
                }
            });
        });

        this.tools.default.activate();

        const boundSetMode = () => this.setMode();
        paperScope.project.on({
            'item-replaced': boundSetMode,
            'item-selected': boundSetMode,
            'item-deselected': boundSetMode,
            'item-removed': boundSetMode,
            'items-changed': boundSetMode,
        });
        this._projectHandlers = boundSetMode;

        this.setMode();
    }

    /**
     * Compute current mode from selection and optionally deactivate active tool if not enabled for that mode.
     * Notifies via onModeChanged so toolbar can update buttons.
     */
    setMode() {
        this.setModeTimeout && clearTimeout(this.setModeTimeout);
        this.setModeTimeout = setTimeout(() => {
            this.setModeTimeout = null;
            const selection = this.paperScope.findSelectedItems();
            const activeTool = this.paperScope.getActiveTool();
            const prevMode = this.currentMode;
            if (selection.length === 0) {
                this.currentMode = 'select';
            } else if (selection.length === 1) {
                const item = selection[0];
                const def = item.annotationItem || {};
                let type = def.type;
                if (def.subtype) type += ':' + def.subtype;
                this.currentMode = type === null ? 'new' : type;
            } else {
                this.currentMode = 'multiselection';
            }
            if (activeTool && activeTool.getToolbarControl().isEnabledForMode(this.currentMode) === false) {
                activeTool.deactivate(true);
                this.tools.default.activate();
            }
            if (this.onModeChanged) this.onModeChanged(this.currentMode);
            const tk = this.paperScope?.annotationToolkit;
            if (tk && tk._emitIntegrationEvent && prevMode !== this.currentMode) {
                const updated = this.paperScope.getActiveTool();
                tk._emitIntegrationEvent('mode-changed', {
                    from: prevMode ?? null,
                    to: this.currentMode,
                    selectionCount: selection.length,
                    activeTool: { name: updated?.toolName ?? null, tool: updated ?? null },
                }, { tool: updated ?? undefined });
            }
            // In headless usage there may be no AnnotationToolbar to call selectionChanged().
            // Ensure the active tool refreshes its cached selection (items + itemToCreate)
            // whenever the selection/mode changes.
            const updatedActiveTool = this.paperScope.getActiveTool();
            if (updatedActiveTool) updatedActiveTool.selectionChanged();
        }, 0);
    }

    /**
     * @param {string} name - Tool name (e.g. 'ruler', 'default').
     * @returns {ToolBase|null}
     */
    getTool(name) {
        return this.tools[name] ?? null;
    }

    /**
     * Remove project listeners. Call when toolset is no longer needed.
     */
    destroy() {
        this.setModeTimeout && clearTimeout(this.setModeTimeout);
        this.setModeTimeout = null;
        if (this._projectHandlers) {
            const h = this._projectHandlers;
            const p = this.paperScope.project;
            p.off('item-replaced', h);
            p.off('item-selected', h);
            p.off('item-deselected', h);
            p.off('item-removed', h);
            p.off('items-changed', h);
            this._projectHandlers = null;
        }
    }
}

export { AnnotationToolset, toolConstructors };

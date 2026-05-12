/**
 * OpenSeadragon paperjs overlay plugin based on paper.js
 * @version 0.7.0
 *
 * Copyright (c) 2022-2026, Thomas Pearce
 * All rights reserved.
 */

/**
 * Optional visual wrapper over an AnnotationToolset. Builds the toolbar DOM and wires
 * button enable/disable and selectionChanged to the toolset's mode.
 * @memberof OSDPaperjsAnnotation
 * @class
 */
class AnnotationToolbar {
    /**
     * @param {AnnotationToolset} toolset - The toolset to wrap (provides tools and mode).
     */
    constructor(toolset) {
        this.toolset = toolset;
        this.paperScope = toolset.paperScope;
        this.currentMode = toolset.currentMode;

        this.ui = this._makeUI();

        Object.keys(this.toolset.tools).forEach((name) => {
            const tool = this.toolset.getTool(name);
            const toolbarControl = tool && tool.getToolbarControl();
            if (toolbarControl) {
                this.addToolbarControl(toolbarControl);
            }
        });

        this._syncButtonsFromMode(this.toolset.currentMode);

        this.toolset.onModeChanged = (mode) => {
            this.currentMode = mode;
            this._syncButtonsFromMode(mode);
            const activeTool = this.paperScope.getActiveTool();
            if (activeTool) activeTool.selectionChanged();
        };
    }

    get element() {
        return this._element;
    }

    _syncButtonsFromMode(mode) {
        Object.keys(this.toolset.tools).forEach((name) => {
            const tool = this.toolset.getTool(name);
            const t = tool && tool.getToolbarControl();
            if (t) {
                t.isEnabledForMode(mode) ? t.button.enable() : t.button.disable();
            }
        });
    }

    addToolbarControl(toolbarControl) {
        const button = toolbarControl.button.element;
        const dropdown = toolbarControl.dropdown;
        this._buttonbar.appendChild(button);
        this._dropdowns.appendChild(dropdown);
        toolbarControl.isEnabledForMode(this.currentMode) ? toolbarControl.button.enable() : toolbarControl.button.disable();
    }

    show() {
        this.element.style.display = 'inline-block';
    }

    hide() {
        this.element.style.display = 'none';
    }

    destroy() {
        this.toolset.onModeChanged = null;
        this.element.remove();
    }

    _makeUI() {
        this._element = document.createElement('div');
        this._buttonbar = document.createElement('div');
        this._dropdowns = document.createElement('div');
        const dropdownContainer = document.createElement('div');
        this._element.appendChild(this._buttonbar);
        this._element.appendChild(dropdownContainer);
        dropdownContainer.appendChild(this._dropdowns);

        const classes = 'annotation-ui-drawing-toolbar btn-group btn-group-sm mode-selection'.split(' ');
        classes.forEach((c) => this._element.classList.add(c));

        dropdownContainer.classList.add('dropdowns-container');
        this._dropdowns.classList.add('dropdowns');
        this._buttonbar.classList.add('annotation-ui-buttonbar');

        return this._element;
    }
}

export { AnnotationToolbar };

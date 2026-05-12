/**
 * OpenSeadragon paperjs overlay plugin based on paper.js
 * @version 0.7.0
 * 
 * Includes additional open source libraries which are subject to copyright notices
 * as indicated accompanying those segments of code.
 * 
 * Original code:
 * Copyright (c) 2022-2026, Thomas Pearce
 * All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 * 
 * * Redistributions of source code must retain the above copyright notice, this
 *   list of conditions and the following disclaimer.
 * 
 * * Redistributions in binary form must reproduce the above copyright notice,
 *   this list of conditions and the following disclaimer in the documentation
 *   and/or other materials provided with the distribution.
 * 
 * * Neither the name of osd-paperjs-annotation nor the names of its
 *   contributors may be used to endorse or promote products derived from
 *   this software without specific prior written permission.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 * 
 */

import { PaperOverlay } from '../../paper-overlay.mjs';
import { domObjectFromHTML } from '../../utils/domObjectFromHTML.mjs';
import { makeFaIcon } from '../../utils/faIcon.mjs';

/**
 * A unified configuration widget that appears as a gear button on the OpenSeadragon viewer.
 * Opens a dialog allowing users to manage registered overlays (show/hide buttons,
 * activate/deactivate) and provides a container for custom configuration sections.
 *
 * @class
 * @memberof OSDPaperjsAnnotation
 */
export class ConfigurationWidget {
    /**
     * @param {OpenSeadragon.Viewer} viewer - The OpenSeadragon viewer instance.
     */
    constructor(viewer) {
        this.viewer = viewer;
        this.viewer.configurationWidget = this;
        this._overlays = [];
        this._sections = [];
        this._open = false;

        this.overlay = new PaperOverlay(viewer, { overlayType: 'viewer', renderless: true });
        this.button = this.overlay.addViewerButton({
            faIconClass: 'fa-gear',
            tooltip: 'Configuration',
            onClick: () => this._open ? this.close() : this.open(),
        });
        this.button.element.querySelector('svg.icon')?.style.setProperty('width', '1em');

        this._makeDialog();
    }

    /**
     * Register an overlay with the configuration widget.
     * @param {Object} overlay - The overlay instance (must have activate/deactivate methods).
     * @param {Object} [opts]
     * @param {string} [opts.label] - Display label. Falls back to overlay.constructor.label or constructor name.
     * @param {string} [opts.faIconClass] - FA icon class for the row. Falls back to overlay.constructor.faIconClass.
     */
    register(overlay, opts = {}) {
        if (this._overlays.find(e => e.overlay === overlay)) return;
        const label = opts.label || overlay.constructor.label || overlay.constructor.name;
        const faIconClass = opts.faIconClass || overlay.constructor.faIconClass || null;
        const showButton = opts.showButton !== false;
        const entry = { overlay, label, faIconClass, showButton, opts };
        this._overlays.push(entry);
        this._addOverlayRow(entry);
        this._updateEmptyState();
    }

    /**
     * Unregister an overlay from the configuration widget.
     * @param {Object} overlay - The overlay instance to remove.
     */
    unregister(overlay) {
        const idx = this._overlays.findIndex(e => e.overlay === overlay);
        if (idx >= 0) {
            const entry = this._overlays[idx];
            if (entry._activeChangeHandler && entry.overlay.removeHandler) {
                entry.overlay.removeHandler('active-change', entry._activeChangeHandler);
            }
            this._overlays.splice(idx, 1);
            this._rebuildOverlayRows();
            this._updateEmptyState();
        }
    }

    /**
     * Add a custom section to the configuration dialog.
     * @param {string} label - Section heading text.
     * @param {HTMLElement} element - The DOM element to inject.
     * @returns {HTMLElement} The element, for chaining.
     */
    addSection(label, element) {
        const entry = { label, element };
        this._sections.push(entry);
        const container = this.dialog.querySelector('.config-custom-sections');
        const wrapper = document.createElement('div');
        wrapper.classList.add('config-section-wrapper');
        const heading = document.createElement('div');
        heading.classList.add('config-section-heading');
        heading.textContent = label;
        wrapper.appendChild(heading);
        wrapper.appendChild(element);
        container.appendChild(wrapper);
        entry._wrapper = wrapper;
        this._updateEmptyState();
        return element;
    }

    /**
     * Remove a custom section from the configuration dialog.
     * @param {HTMLElement} element - The element previously passed to addSection.
     */
    removeSection(element) {
        const idx = this._sections.findIndex(s => s.element === element);
        if (idx >= 0) {
            const entry = this._sections[idx];
            if (entry._wrapper) entry._wrapper.remove();
            this._sections.splice(idx, 1);
            this._updateEmptyState();
        }
    }

    /**
     * Open the configuration dialog.
     */
    open() {
        this._open = true;
        this.dialog.classList.remove('hidden');
    }

    /**
     * Close the configuration dialog.
     */
    close() {
        this._open = false;
        this.dialog.classList.add('hidden');
    }

    /**
     * Destroy the configuration widget and clean up.
     */
    destroy() {
        this.dialog.remove();
        this.overlay.destroy();
        if (this.viewer.configurationWidget === this) {
            this.viewer.configurationWidget = null;
        }
    }

    _makeDialog() {
        const css = `<style data-type="osd-configuration-widget">
.config-dialog {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(380px, calc(100% - 24px));
    max-height: calc(100% - 24px);
    overflow-y: auto;
    background: white;
    border-radius: 10px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.18);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 14px;
    z-index: 10000;
    padding: 0;
    color: #222;
}
.config-dialog.hidden {
    display: none;
}
.config-dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid #eee;
}
.config-dialog-header h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
}
.config-dialog-close {
    cursor: pointer;
    background: none;
    border: none;
    font-size: 20px;
    line-height: 1;
    color: #666;
    padding: 4px 8px;
    border-radius: 4px;
}
.config-dialog-close:hover {
    background: #f0f0f0;
    color: #222;
}
.config-dialog-body {
    padding: 12px 16px;
}
.config-overlay-list {
    display: grid;
    grid-template-columns: 18px 1fr auto auto;
    column-gap: 10px;
    row-gap: 0;
    align-items: center;
}
.config-overlay-heading-row {
    display: contents;
}
.config-overlay-heading-row .config-heading-title {
    grid-column: 1 / 3;
    font-weight: 600;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #666;
    padding-bottom: 8px;
    white-space: nowrap;
}
.config-overlay-heading-row .config-col-header {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    color: #999;
    padding-bottom: 8px;
    justify-self: center;
}
.config-overlay-row {
    display: contents;
}
.config-overlay-row > *:not(.config-toggle) {
    padding: 8px 0;
    border-bottom: 1px solid #f5f5f5;
}
.config-overlay-row:last-of-type > *:not(.config-toggle) {
    border-bottom: none;
}
.config-overlay-row > .config-toggle {
    border-bottom: 1px solid #f5f5f5;
}
.config-overlay-row:last-of-type > .config-toggle {
    border-bottom: none;
}
.config-overlay-icon {
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #555;
}
.config-overlay-icon svg {
    width: 14px;
    height: 14px;
}
.config-overlay-label {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.config-overlay-row button {
    cursor: pointer;
    background: #f0f0f0;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 12px;
    line-height: 1;
    color: #333;
}
.config-overlay-row button:hover {
    background: #e0e0e0;
}
.config-overlay-row button.active {
    background: #2a6ef5;
    border-color: #2a6ef5;
    color: white;
}
.config-toggle {
    position: relative;
    width: 32px;
    height: 18px;
    display: inline-block;
    justify-self: center;
}
.config-toggle input {
    opacity: 0;
    width: 0;
    height: 0;
}
.config-toggle-slider {
    position: absolute;
    cursor: pointer;
    top: 0; left: 0; right: 0; bottom: 0;
    background: #ccc;
    border-radius: 18px;
    transition: background 0.2s;
}
.config-toggle-slider:before {
    content: "";
    position: absolute;
    width: 14px;
    height: 14px;
    left: 2px;
    bottom: 2px;
    background: white;
    border-radius: 50%;
    transition: transform 0.2s;
}
.config-toggle input:checked + .config-toggle-slider {
    background: #2a6ef5;
}
.config-toggle input:checked + .config-toggle-slider:before {
    transform: translateX(14px);
}
.config-custom-sections:not(:empty) {
    border-top: 1px solid #eee;
    margin-top: 12px;
    padding-top: 12px;
}
.config-section-wrapper + .config-section-wrapper {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid #eee;
}
.config-section-heading {
    font-weight: 600;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #666;
    margin-bottom: 8px;
}
.config-empty-message {
    font-size: 13px;
    color: #999;
    font-style: italic;
    padding: 8px 0;
}
.config-custom-sections:empty {
    display: none;
}
</style>`;

        const html = `<div class="config-dialog hidden">
    <div class="config-dialog-header">
        <h3>Configuration</h3>
        <button class="config-dialog-close" title="Close">&times;</button>
    </div>
    <div class="config-dialog-body">
        <div class="config-empty-message">No configurable options have been set up for this viewer.</div>
        <div class="config-overlay-list"><div class="config-overlay-heading-row"><span class="config-heading-title">Available Overlays</span><span class="config-col-header" title="Include a button directly in the viewer's toolbar">Show Button</span><span></span></div></div>
        <div class="config-custom-sections"></div>
    </div>
</div>`;

        if (!document.querySelector('style[data-type="osd-configuration-widget"]')) {
            document.querySelector('head')?.appendChild(domObjectFromHTML(css));
        }

        const el = domObjectFromHTML(html);
        this.viewer.container.appendChild(el);
        el.addEventListener('mousemove', ev => ev.stopPropagation());

        el.querySelector('.config-dialog-close').addEventListener('click', () => this.close());

        this.dialog = el;

        for (const entry of this._overlays) {
            this._addOverlayRow(entry);
        }
        this._updateEmptyState();
    }

    _addOverlayRow(entry) {
        const list = this.dialog.querySelector('.config-overlay-list');
        const row = document.createElement('div');
        row.classList.add('config-overlay-row');
        row.dataset.overlayIdx = this._overlays.indexOf(entry);

        const iconEl = document.createElement('div');
        iconEl.classList.add('config-overlay-icon');
        if (entry.faIconClass) {
            iconEl.appendChild(makeFaIcon(entry.faIconClass));
        }
        row.appendChild(iconEl);

        const labelEl = document.createElement('div');
        labelEl.classList.add('config-overlay-label');
        labelEl.textContent = entry.label;
        row.appendChild(labelEl);

        // Activate/deactivate button
        const activateBtn = document.createElement('button');
        activateBtn.textContent = 'Activate';
        activateBtn.title = 'Activate / Deactivate';
        activateBtn.addEventListener('click', () => {
            const overlay = entry.overlay;
            if (overlay._active) {
                overlay.deactivate();
            } else {
                overlay.activate();
                this.close();
            }
        });
        entry._activateBtn = activateBtn;
        if (entry.overlay.addHandler) {
            entry._activeChangeHandler = (ev) => {
                if (ev.active) {
                    activateBtn.classList.add('active');
                    activateBtn.textContent = 'Deactivate';
                } else {
                    activateBtn.classList.remove('active');
                    activateBtn.textContent = 'Activate';
                }
            };
            entry.overlay.addHandler('active-change', entry._activeChangeHandler);
        }

        // Show/hide button toggle
        const toggle = document.createElement('label');
        toggle.classList.add('config-toggle');
        toggle.title = 'Include a button directly in the viewer\'s toolbar';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = true;
        const slider = document.createElement('span');
        slider.classList.add('config-toggle-slider');
        toggle.appendChild(checkbox);
        toggle.appendChild(slider);

        const overlayBtn = entry.overlay.button || (entry.overlay._viewerButtons && entry.overlay._viewerButtons[0]);
        const originalDisplay = (overlayBtn && overlayBtn.element) ? (overlayBtn.element.style.display || 'inline-block') : 'inline-block';
        if (!entry.showButton) {
            checkbox.checked = false;
            if (overlayBtn && overlayBtn.element) {
                overlayBtn.element.style.display = 'none';
            }
        }
        checkbox.addEventListener('change', () => {
            if (overlayBtn && overlayBtn.element) {
                overlayBtn.element.style.display = checkbox.checked ? originalDisplay : 'none';
            }
        });

        row.appendChild(toggle);
        row.appendChild(activateBtn);
        list.appendChild(row);
        entry._row = row;
    }

    _rebuildOverlayRows() {
        const list = this.dialog.querySelector('.config-overlay-list');
        list.innerHTML = '';
        for (const entry of this._overlays) {
            this._addOverlayRow(entry);
        }
    }

    _updateEmptyState() {
        const empty = this._overlays.length === 0 && this._sections.length === 0;
        this.dialog.querySelector('.config-empty-message').style.display = empty ? '' : 'none';
        this.dialog.querySelector('.config-overlay-list').style.display = this._overlays.length === 0 ? 'none' : '';
        const customSections = this.dialog.querySelector('.config-custom-sections');
        if (this._overlays.length === 0) {
            customSections.style.borderTop = 'none';
            customSections.style.marginTop = '0';
            customSections.style.paddingTop = '0';
        } else {
            customSections.style.borderTop = '';
            customSections.style.marginTop = '';
            customSections.style.paddingTop = '';
        }
    }
}

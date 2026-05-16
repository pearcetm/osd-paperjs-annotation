/**
 * OpenSeadragon paperjs overlay plugin based on paper.js
 * @version 0.7.2
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

import { OpenSeadragon } from '../osd-loader.mjs';

/**
 * Base class for viewer overlay types (screenshot, fieldofview, rotation, etc.).
 * Extends OpenSeadragon.EventSource to provide event handling (addHandler/removeHandler/raiseEvent).
 * Provides the shared activate/deactivate lifecycle via _setActive(), which fires 'active-change'.
 *
 * Subclasses should override activate() and deactivate(), call _setActive(true/false) within them,
 * and provide static label and faIconClass getters.
 *
 * @class
 * @memberof OSDPaperjsAnnotation
 * @extends OpenSeadragon.EventSource
 */
export class ViewerOverlayBase extends OpenSeadragon.EventSource {
    static get label() { return 'Overlay'; }
    static get faIconClass() { return null; }

    /**
     * @param {OpenSeadragon.Viewer} viewer
     * @param {Object} [opts]
     * @param {boolean} [opts.registerWithConfig=true] Set false to suppress auto-registration with ConfigurationWidget
     * @param {boolean} [opts.showButton=true] Set false to hide the toolbar button initially (manageable via ConfigurationWidget toggle)
     */
    constructor(viewer, opts = {}) {
        super();
        this.viewer = viewer;
        this._active = false;
        this._registerWithConfig = opts.registerWithConfig !== false;
        this._showButton = opts.showButton !== false;
    }

    /**
     * Set the active state and fire 'active-change' event.
     * Subclasses should call this instead of setting this._active directly.
     * @param {boolean} active
     */
    _setActive(active) {
        this._active = active;
        this.raiseEvent('active-change', { active });
    }

    /**
     * Auto-register with the ConfigurationWidget if one exists on the viewer.
     * Call at the end of the subclass constructor.
     */
    _autoRegister() {
        if (!this._registerWithConfig) return;
        const cw = this.viewer.configurationWidget;
        if (cw) cw.register(this, { showButton: this._showButton });
    }

    /**
     * Destroy the overlay and unregister from ConfigurationWidget.
     * Subclasses should call super.destroy() or this method in their own destroy.
     */
    destroy() {
        const cw = this.viewer.configurationWidget;
        if (cw) cw.unregister(this);
    }
}

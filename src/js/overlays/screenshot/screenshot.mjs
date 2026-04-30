/**
 * OpenSeadragon paperjs overlay plugin based on paper.js
 * @version 0.5.0
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


import { ToolBase } from '../../papertools/base.mjs';
import { PaperOverlay } from '../../paper-overlay.mjs';
import { OpenSeadragon } from '../../osd-loader.mjs';
import { paper } from '../../paperjs.mjs';
import { changeDpiBlob } from './changedpi.mjs';
import { domObjectFromHTML } from '../../utils/domObjectFromHTML.mjs';
import { loadScreenshotSettings, normalizeScreenshotSettings, saveScreenshotSettings } from './screenshot-settings.mjs';
import { buildDownsampleOptions, computeOutputSize } from './screenshot-sizing.mjs';

class ScreenshotOverlay{
    /**
     * Creates an instance of the ScreenshotOverlay.
     *
     * @param {OpenSeadragon.Viewer} viewer - The OpenSeadragon viewer object.
     * @param {Object} [options]
     * @param {String} [options.downloadMessage] - A message to display in the download window
     */
    constructor(viewer, options){
        this.viewer = viewer;
        let overlay = this.overlay = new PaperOverlay(viewer,{overlayType:'viewer'});
        let tool = this.tool = new ScreenshotTool(this.overlay.paperScope, this);
        this.dummyTool = new this.overlay.paperScope.Tool();//to capture things like mouseMove, keyDown etc (when actual tool is not active)
        this.dummyTool.activate();
        this._mouseNavEnabledAtActivation = true;
        this._active = false;
        this._state = 'inactive'; // inactive | config | freeSelectArmed | fixedPlaceArmed | regionChosen | regionEdit | creating | created
        this._saveSettingsTimeout = null;
        this.settings = loadScreenshotSettings();
        this._currentImageBounds = null; // OpenSeadragon image-space rect (base pixels)
        this._baseScreenshot = null; // { blob, url, pixelRatio, signature }
        this._lastScreenshotRequest = null; // { data, signature }

        const button = overlay.addViewerButton({
            faIconClass:'fa-camera',
            tooltip:'Take Screenshot',
            onClick:()=>{
                this._active ? this.deactivate() : this.activate();
            }
        });

        button.element.querySelector('svg.icon')?.style.setProperty('width', '1em');

        this._makeDialog(options); //creates this.dialog

        this.tool.addEventListener('region-selected',(payload)=>this._onRegionSelected(payload));
     
    }
    /**
     * Activates the overlay.
     */
    activate(){
        let reactivate = this.overlay.setOSDMouseNavEnabled(false);
        this._mouseNavEnabledAtActivation = this._mouseNavEnabledAtActivation || reactivate;
        this.overlay.bringToFront();
        this._active = true;
        this.tool.activate();
        this.tool.setMode('idle');
        this._setState('config');
    }
    /**
     * Deactivates the overlay.
     */
    deactivate(){
        this._active = false;
        this._setState('inactive');
        this.tool.setMode('idle');
        this.tool.deactivate(true);
        this.dummyTool.activate();
        this.overlay.setOSDMouseNavEnabled(this._mouseNavEnabledAtActivation);
        this._mouseNavEnabledAtActivation = false;
        this.overlay.sendToBack();
    }

    _setState(next){
        this._state = next;
        if(!this.dialog) return;
        const el = this.dialog;
        const setup = el.querySelector('.screenshot-setup');
        const after = el.querySelector('.screenshot-after');
        const results = el.querySelector('.screenshot-results');
        const edit = el.querySelector('.screenshot-edit');

        if(next === 'inactive'){
            el.classList.add('hidden');
            results?.classList.remove('pending','created');
            setup?.classList.remove('hidden');
            after?.classList.add('hidden');
            edit?.classList.add('hidden');
            return;
        }

        if(next === 'config'){
            el.classList.remove('hidden');
            results?.classList.remove('pending','created');
            setup?.classList.remove('hidden');
            after?.classList.add('hidden');
            edit?.classList.add('hidden');
            this._syncDialogFromSettings();
            return;
        }

        if(next === 'freeSelectArmed' || next === 'fixedPlaceArmed'){
            el.classList.add('hidden');
            return;
        }

        if(next === 'regionChosen'){
            el.classList.remove('hidden');
            setup?.classList.add('hidden');
            after?.classList.remove('hidden');
            edit?.classList.add('hidden');
            results?.classList.remove('pending','created');
            return;
        }

        if(next === 'regionEdit'){
            el.classList.remove('hidden');
            setup?.classList.add('hidden');
            after?.classList.add('hidden');
            edit?.classList.remove('hidden');
            return;
        }

        if(next === 'creating'){
            el.classList.remove('hidden');
            setup?.classList.add('hidden');
            after?.classList.remove('hidden');
            edit?.classList.add('hidden');
            results?.classList.add('pending');
            results?.classList.remove('created');
            return;
        }

        if(next === 'created'){
            el.classList.remove('hidden');
            setup?.classList.add('hidden');
            after?.classList.remove('hidden');
            edit?.classList.add('hidden');
            results?.classList.remove('pending');
            results?.classList.add('created');
            return;
        }
    }

    _scheduleSaveSettings(){
        this._saveSettingsTimeout && clearTimeout(this._saveSettingsTimeout);
        this._saveSettingsTimeout = setTimeout(()=>{
            this._saveSettingsTimeout = null;
            saveScreenshotSettings(this.settings);
        }, 200);
    }

    _revokeObjectURL(url){
        if(url){
            try{ URL.revokeObjectURL(url); } catch { /* ignore */ }
        }
    }

    _invalidateScreenshotCache(){
        if(this._baseScreenshot?.url){
            this._revokeObjectURL(this._baseScreenshot.url);
        }
        this._baseScreenshot = null;
        if(this.blobURL){
            this._revokeObjectURL(this.blobURL);
            this.blobURL = null;
        }
        this._lastScreenshotRequest = null;
    }

    _parsePositiveNumber(raw, { minExclusive = 0 } = {}){
        const s = String(raw ?? '').trim();
        if(s === '') return { ok: false, reason: 'Required' };
        const n = Number(s);
        if(!Number.isFinite(n)) return { ok: false, reason: 'Not a number' };
        if(n <= minExclusive) return { ok: false, reason: `Must be > ${minExclusive}` };
        return { ok: true, value: n };
    }

    _isFocused(el){
        return Boolean(el && typeof document !== 'undefined' && document.activeElement === el);
    }

    _setIfNotFocused(input, valueString){
        if(!input) return;
        if(this._isFocused(input)) return;
        input.value = String(valueString ?? '');
    }

    _parsePositiveFloatDraft(text){
        return this._parsePositiveNumber(text, { minExclusive: 0 });
    }

    _parsePositiveIntDraft(text){
        const p = this._parsePositiveNumber(text, { minExclusive: 0 });
        if(!p.ok) return p;
        return { ok: true, value: Math.round(p.value) };
    }

    _syncAspectValidationUI(){
        if(!this.dialog) return true;
        const lock = this.dialog.querySelector('.lock-aspect-ratio');
        const enabled = Boolean(lock?.checked);
        const aw = this.dialog.querySelector('.aspect-width');
        const ah = this.dialog.querySelector('.aspect-height');
        const err = this.dialog.querySelector('.aspect-error');
        const start = this.dialog.querySelector('button.start');

        if(!enabled){
            if(err){
                err.textContent = '';
                err.classList.add('hidden');
            }
            if(start) start.disabled = false;
            return true;
        }

        const pw = this._parsePositiveFloatDraft(aw?.value);
        const ph = this._parsePositiveFloatDraft(ah?.value);
        const ok = pw.ok && ph.ok;
        if(err){
            if(ok){
                err.textContent = '';
                err.classList.add('hidden');
            }else{
                err.textContent = 'Enter numbers > 0';
                err.classList.remove('hidden');
            }
        }
        if(start) start.disabled = !ok;
        return ok;
    }

    _syncFixedBaseValidationUI(){
        if(!this.dialog) return true;
        const el = this.dialog;
        const modeFixed = this.settings?.mode === 'fixed';
        const bw = el.querySelector('.fixed-base-width');
        const bh = el.querySelector('.fixed-base-height');
        const err = el.querySelector('.fixed-base-error');
        const start = el.querySelector('button.start');

        const pw = this._parsePositiveIntDraft(bw?.value);
        const ph = this._parsePositiveIntDraft(bh?.value);
        const ok = pw.ok && ph.ok;

        if(err){
            if(ok || !modeFixed){
                err.textContent = '';
                err.classList.add('hidden');
            }else{
                err.textContent = 'Enter integers ≥ 1';
                err.classList.remove('hidden');
            }
        }
        if(start && modeFixed){
            start.disabled = !ok;
        }
        return ok;
    }

    _getCurrentOutputFactorFromUI(kind = 'result'){
        const sel = this.dialog?.querySelector(kind === 'fixed' ? '.select-output-size-fixed' : '.select-output-size-result');
        const opt = sel?.options?.[sel.selectedIndex];
        if(opt?.value === '__other__' || this.settings.output.mode === 'other'){
            return Number(this.settings.output.otherFactor);
        }
        const v = Number(opt?.value);
        return Number.isFinite(v) && v > 0 ? v : Number(this.settings.output.presetFactor);
    }

    _computeSmartScalebarLengthMm(){
        if(!this._mpp || !this._mpp.x || !this._currentImageBounds) return null;
        const built = this._buildCurrentScreenshotRequestFromUI();
        if(!built) return null;
        const outW = Number(built.data.w);
        const scaleFactor = Number(built.data.scaleFactor);
        if(!Number.isFinite(outW) || outW <= 0 || !Number.isFinite(scaleFactor) || scaleFactor <= 0) return null;

        const targetPx = Math.max(24, Math.round(outW * 0.125)); // ~12.5% of output width
        const candidatesMm = [1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01];

        let best = null;
        for(const mm of candidatesMm){
            const px = Math.max(1, Math.round(mm * 1000 / this._mpp.x * scaleFactor));
            // Prefer bars that land in a reasonable range, but always pick a closest.
            const tooSmall = px < 16;
            const tooBig = px > Math.round(outW * 0.4);
            const penalty = (tooSmall || tooBig) ? outW : 0;
            const score = Math.abs(px - targetPx) + penalty;
            if(!best || score < best.score){
                best = { mm, px, score };
            }
        }
        return best?.mm ?? null;
    }

    _maybeApplySmartScalebarDefaults(){
        // Don’t override user-edited values.
        if(this._scalebarWasTouched) return;
        if(!this._mpp) return;

        if(!Number.isFinite(this._scalebarHeight) || this._scalebarHeight < 1){
            this._scalebarHeight = 4;
        }

        const mm = this._computeSmartScalebarLengthMm();
        if(mm != null){
            this._scalebarWidth = mm;
        }
    }

    _validateScalebarDraft(){
        if(!this.dialog) return { enabled:false, ok:true };
        const hasMpp = Boolean(this._mpp && this._mpp.x);
        const enabled = Boolean(this._includeScalebar) && hasMpp;
        if(!enabled) return { enabled:false, ok:true };

        const lenInput = this.dialog.querySelector('.scalebar-width');
        const hInput = this.dialog.querySelector('.scalebar-height');
        const lenText = String(lenInput?.value ?? '').trim();
        const hText = String(hInput?.value ?? '').trim();

        const lenParsed = this._parsePositiveFloatDraft(lenText);
        const heightNum = Number(hText);
        const heightOk = Number.isFinite(heightNum) && heightNum >= 1;
        const lengthOk = lenParsed.ok;
        const ok = lengthOk && heightOk;

        return {
            enabled,
            ok,
            lengthOk,
            heightOk,
            lengthMm: lenParsed.ok ? lenParsed.value : null,
            heightPx: heightOk ? Math.round(heightNum) : null,
            lenText,
            hText,
        };
    }

    _renderScalebarValidation({ mode = 'soft' } = {}){
        if(!this.dialog) return { ok:true };
        const errRow = this.dialog.querySelector('.scalebar-error-row');
        const err = this.dialog.querySelector('.scalebar-error');
        const createBtn = this.dialog.querySelector('.create-screenshot');

        const v = this._validateScalebarDraft();
        if(createBtn) createBtn.disabled = v.enabled ? !v.ok : false;

        if(!errRow || !err) return v;
        if(!v.enabled){
            err.textContent = '';
            errRow.classList.add('hidden');
            return v;
        }
        if(v.ok){
            err.textContent = '';
            errRow.classList.add('hidden');
            return v;
        }

        const parts = [];
        if(mode === 'soft'){
            if(v.lenText === '') parts.push('Enter a length');
            else if(!v.lengthOk) parts.push('Length must be > 0');

            if(v.hText === '') parts.push('Enter a height');
            else if(!v.heightOk) parts.push('Height must be ≥ 1');
        }else{
            if(!v.lengthOk) parts.push('Enter a length > 0');
            if(!v.heightOk) parts.push('Enter a height ≥ 1');
        }
        err.textContent = parts.join(' · ');
        errRow.classList.remove('hidden');
        return v;
    }

    _syncScalebarUI(){
        if(!this.dialog) return;
        const row = this.dialog.querySelector('.scalebar-main');
        const include = this.dialog.querySelector('.include-scalebar');
        const reason = this.dialog.querySelector('.scalebar-disabled-reason');
        const opts = this.dialog.querySelector('.scalebar-opts');
        const lenInput = this.dialog.querySelector('.scalebar-width');
        const hInput = this.dialog.querySelector('.scalebar-height');
        const hint = this.dialog.querySelector('.scalebar-px-hint');
        const errRow = this.dialog.querySelector('.scalebar-error-row');
        const err = this.dialog.querySelector('.scalebar-error');

        const hasMpp = Boolean(this._mpp && this._mpp.x);
        if(row){
            if(hasMpp) row.classList.remove('hidden');
            else row.classList.add('hidden');
        }
        if(include){
            include.disabled = !hasMpp;
        }
        if(reason){
            if(!hasMpp){
                reason.textContent = 'Requires mpp metadata';
                reason.classList.remove('hidden');
            }else{
                reason.textContent = '';
                reason.classList.add('hidden');
            }
        }

        // Render from numeric source of truth when not focused.
        this._setIfNotFocused(lenInput, String(this._scalebarWidth));
        this._setIfNotFocused(hInput, String(this._scalebarHeight));
        if(include) include.checked = Boolean(this._includeScalebar);

        if(opts){
            if(hasMpp && this._includeScalebar) opts.classList.remove('hidden');
            else opts.classList.add('hidden');
        }

        if(errRow && err){
            // Default state: hidden; validation will toggle these.
            if(!this._includeScalebar || !hasMpp){
                err.textContent = '';
                errRow.classList.add('hidden');
            }
        }

        if(hint){
            // Keep hint in layout (no jumping); hide via visibility when not applicable.
            if(!(hasMpp && this._includeScalebar)){
                hint.style.visibility = 'hidden';
                hint.textContent = '';
            }else if(hasMpp && this._includeScalebar && this._currentImageBounds){
                const v = this._validateScalebarDraft();
                if(!v.lengthOk){
                    hint.style.visibility = 'hidden';
                    hint.textContent = '';
                }else{
                    hint.style.visibility = 'visible';
                const baseW = Number(this._currentImageBounds.width);
                const factor = this._getCurrentOutputFactorFromUI('result');
                const safeFactor = Number.isFinite(factor) && factor > 0 ? factor : 1;
                const { outW } = computeOutputSize(baseW, Number(this._currentImageBounds.height), safeFactor);
                const scaleFactor = outW / baseW;
                const pxLen = Math.max(1, Math.round(v.lengthMm * 1000 / this._mpp.x * scaleFactor));
                hint.textContent = `≈ ${pxLen} px at output`;
                }
            }else{
                hint.style.visibility = 'hidden';
                hint.textContent = '';
            }
        }
        this._renderScalebarValidation({ mode: 'soft' });
    }

    _buildCurrentScreenshotRequestFromUI(){
        if(!this.dialog || !this._currentImageBounds || !this._lastBasePxForOutput) return null;
        const ibEl = this.dialog.querySelector('[data-last-imagebounds-json]');
        if(!ibEl) return null;
        const imageBounds = JSON.parse(ibEl.getAttribute('data-last-imagebounds-json'));
        const base = this._lastBasePxForOutput;
        const factor = this._getCurrentOutputFactorFromUI('result');
        const safeFactor = Number.isFinite(factor) && factor > 0 ? factor : 1;
        const { outW, outH } = computeOutputSize(base.baseW, base.baseH, safeFactor);
        return {
            data: {
                w: outW,
                h: outH,
                imageBounds,
                scaleFactor: outW / base.baseW,
            },
            base,
        };
    }

    async _recomposeFromCachedBaseIfPossible(){
        if(!this._baseScreenshot || !this.dialog) return false;
        const built = this._buildCurrentScreenshotRequestFromUI();
        if(!built) return false;
        const { data } = built;
        const sig = this._computeRenderSignature({ w: data.w, h: data.h, imageBounds: data.imageBounds });
        if(sig !== this._baseScreenshot.signature) return false;

        // Update output quickly without offscreen OSD render.
        let finalUrl = null;
        if(this._includeScalebar && this._mpp){
            const blob = await this._composeScreenshotWithScalebar({
                baseBlob: this._baseScreenshot.blob,
                pixelRatio: this._baseScreenshot.pixelRatio,
                scaleFactor: data.scaleFactor,
            });
            if(this.blobURL) this._revokeObjectURL(this.blobURL);
            this.blobURL = URL.createObjectURL(blob);
            finalUrl = this.blobURL;
        }else{
            // Reuse cached base directly.
            if(this.blobURL && this.blobURL !== this._baseScreenshot.url){
                this._revokeObjectURL(this.blobURL);
            }
            this.blobURL = this._baseScreenshot.url;
            finalUrl = this.blobURL;
        }

        this.dialog.querySelectorAll('.screenshot-link').forEach(a=>a.href = finalUrl);
        return true;
    }

    _formatDownsampleLabel(factor){
        const f = Number(factor);
        if(!Number.isFinite(f) || f <= 0) return '';
        if(f === 1) return '1/1';
        if(Number.isInteger(f)) return `1/${f}`;
        return `d=${f}`;
    }

    _syncAspectInputsEnabled(){
        if(!this.dialog) return;
        const el = this.dialog;
        const lock = el.querySelector('.lock-aspect-ratio');
        const enabled = Boolean(lock?.checked);
        el.querySelectorAll('.aspect-width, .aspect-height').forEach(inp=>{
            inp.disabled = !enabled;
        });
    }

    _armFreeSelect(){
        this.tool.setMode('freeSelect');
        this._setState('freeSelectArmed');
    }

    _armFixedPlace(){
        this.tool.setMode('fixedPlace');
        this._setState('fixedPlaceArmed');
    }

    _handleFixedPlacement(payload){
        const imageBounds = payload?.screenshotData?.imageBounds;
        if(!imageBounds){
            alert('Missing fixed placement region metadata.');
            this._setState('regionChosen');
            return;
        }

        // Always populate the UI from base pixels first (even in auto-create).
        this._setupScreenshotDialogFromImageBounds(imageBounds);

        if(payload.autoCreate && payload.screenshotData){
            this._setState('creating');
            this._createScreenshot(payload.screenshotData).then(()=>{
                this.dialog.querySelectorAll('.screenshot-link').forEach(a=>a.href = this.blobURL);
                const cs = this.dialog.querySelector('.created-summary');
                if(cs){
                    cs.textContent = `Region ${Math.round(imageBounds.width)}×${Math.round(imageBounds.height)} → Output ${payload.screenshotData.w}×${payload.screenshotData.h}`;
                }
                this._setState('created');
            }).catch(e=>{
                alert('There was a problem creating the screenshot. ' + e);
                this._setState('regionChosen');
            });
            return;
        }

        this._setState('regionChosen');
    }

    _onRegionSelected(payload){
        if(!payload) return;
        const isObjectPayload = payload && typeof payload === 'object' && payload.bounds;
        const bounds = isObjectPayload ? payload.bounds : payload;

        if(isObjectPayload && payload.kind === 'fixed'){
            this._handleFixedPlacement(payload);
            return;
        }

        // Convert viewer-element rectangle to base image-space rect once,
        // and drive the UI from base pixels for consistent UX.
        const vp = this.viewer.viewport;
        this._resolveActiveTiledImageOrThrow();
        const boundsRect = new OpenSeadragon.Rect(bounds.x, bounds.y, bounds.width, bounds.height);
        const viewportRect = vp.viewerElementToViewportRectangle(boundsRect);
        const imageBounds = vp.viewportToImageRectangle(viewportRect);
        this._setupScreenshotDialogFromImageBounds(imageBounds);
        this._setState('regionChosen');
    }

    _makeDialog(options){
        let html = `<div class="screenshot-dialog hidden">
            <div class="ss-header">
                <div class="ss-title">Screenshot</div>
                <button class="close ss-close" type="button" aria-label="Close">×</button>
            </div>

            <div class="screenshot-setup">
                <div class="screenshot-mode">
                    <label class="ss-radio"><input type="radio" name="screenshot-mode" value="free" class="mode-free"> Free select</label>
                    <label class="ss-radio"><input type="radio" name="screenshot-mode" value="fixed" class="mode-fixed"> Defined size</label>
                </div>

                <div class="setup-free">
                    <div class="ss-row">
                        <label class="ss-check"><input class="lock-aspect-ratio" type="checkbox"/> Use fixed aspect ratio</label>
                        <span class="ss-inline">
                            <span class="ss-muted">Aspect:</span>
                            <input type="number" step="any" inputmode="decimal" value="1" class="aspect-width"/> :
                            <input type="number" step="any" inputmode="decimal" value="1" class="aspect-height"/>
                            <span class="aspect-error ss-muted hidden"></span>
                        </span>
                    </div>
                    <div class="setup-hint">Start selection, then drag. Esc cancels.</div>
                </div>

                <div class="setup-fixed">
                    <div class="ss-row">
                        <span class="ss-muted">Base region:</span>
                        <input class="fixed-base-width" type="number" min="1" step="1" value="256"/> ×
                        <input class="fixed-base-height" type="number" min="1" step="1" value="256"/> <span class="ss-muted">px</span>
                        <span class="fixed-base-error ss-muted hidden"></span>
                    </div>
                    <div class="ss-row fixed-output-controls">
                        <span class="ss-muted">Output:</span>
                        <select class="select-output-size-fixed"></select>
                        <span class="fixed-output-other hidden">
                            <span class="ss-muted" title="Downsample factor">1 /</span>
                            <input class="fixed-output-other-factor" type="number" step="any" inputmode="decimal" value="1"/>
                            <span class="fixed-output-readout ss-muted"></span>
                            <span class="downsample-error ss-muted hidden"></span>
                        </span>
                        <span class="output-help ss-muted hidden"></span>
                    </div>
                    <div class="ss-row">
                        <label class="ss-check"><input type="checkbox" class="fixed-auto-create"/> Auto-create on click</label>
                    </div>
                    <div class="setup-hint">Click Start, then click to place.</div>
                </div>

                <div class="ss-actions">
                    <button class="start ss-primary" type="button">Start selection</button>
                </div>
            </div>

            <div class="screenshot-after hidden">
                <div class="ss-section">
                    <div class="screenshot-results">
                        <div class="instructions">
                            <div class="ss-row ss-space-between">
                                <div class="output-context ss-muted ss-mono"></div>
                                <button class="edit-region" type="button">Edit region…</button>
                            </div>
                            <div class="ss-row">
                                <span class="ss-muted">Output:</span>
                                <select class="select-output-size-result"></select>
                                <span class="result-output-other hidden">
                                    <span class="ss-muted" title="Downsample factor">1 /</span>
                                    <input class="result-output-other-factor" type="number" step="any" inputmode="decimal" value="1"/>
                                    <span class="result-output-readout ss-muted"></span>
                                    <span class="downsample-error ss-muted hidden"></span>
                                </span>
                            </div>
                            <div class="output-help ss-muted hidden"></div>
                        </div>

                        <div class="scalebar-main hidden">
                            <div class="scalebar-grid">
                                <label class="ss-check scalebar-toggle"><input class="include-scalebar" type="checkbox"> Scale bar</label>
                                <span class="scalebar-disabled-reason ss-muted hidden"></span>

                                <div class="scalebar-opts hidden">
                                    <div class="scalebar-row scalebar-length">
                                        <span class="ss-muted">Length</span>
                                        <input class="scalebar-width" type="number" step="any" inputmode="decimal">
                                        <span class="ss-muted ss-unit">mm</span>
                                        <span class="ss-muted scalebar-px-hint"></span>
                                    </div>
                                    <div class="scalebar-row scalebar-height">
                                        <span class="ss-muted">Height</span>
                                        <input class="scalebar-height" type="number" value="4" step="1" inputmode="numeric">
                                        <span class="ss-muted ss-unit">px</span>
                                    </div>
                                    <div class="ss-row scalebar-error-row hidden">
                                        <span class="scalebar-error ss-muted"></span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="ss-row ss-create-row">
                            <button class="create-screenshot ss-primary" type="button">Create</button>
                        </div>

                        <div class="download">
                            <div class="created-confirm ss-muted">Screenshot created.</div>
                            <div class="created-summary ss-muted"></div>
                            <div class="ss-row">
                                <a class="open-screenshot screenshot-link" target="_blank"><button type="button">Open</button></a>
                                <a class="download-screenshot screenshot-link" download="screenshot.png"><button type="button">Download</button></a>
                                <button class="cancel-screenshot" type="button">Change output</button>
                            </div>
                        </div>

                        <div class="pending-message">
                            <div class="ss-row ss-space-between">
                                <span class="ss-muted">Creating…</span>
                                <button class="cancel-screenshot" type="button">Change output</button>
                            </div>
                            <div class="screenshot-progress">
                                <progress></progress>
                                <div class="ss-muted">Loaded <span class="loaded"></span> of <span class="total"><span> tiles</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="ss-footer">
                    <button class="back-to-setup" type="button">Back</button>
                    <button class="rect" type="button">Select new area</button>
                </div>
            </div>

            <div class="screenshot-edit hidden">
                <div class="ss-section">
                    <div class="ss-label">Edit region</div>
                    <div class="ss-row">
                        <span class="ss-muted">Size:</span>
                        <input class="region-width region-dim" type="number" min="1" step="1"/> ×
                        <input class="region-height region-dim" type="number" min="1" step="1"/> <span class="ss-muted">px</span>
                    </div>
                    <div class="region-mm ss-muted hidden"></div>
                </div>
                <div class="ss-footer">
                    <button class="done-edit" type="button">Done</button>
                    <button class="rect" type="button">Select new area</button>
                </div>
            </div>
        </div>`;

        let css = `<style data-type="screenshot-tool">
            .screenshot-dialog{
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                box-sizing: border-box;
                width: min(400px, calc(100% - 24px));
                max-height: calc(100% - 24px);
                overflow: auto;
                background: #fff;
                color: #111;
                border: 1px solid rgba(0,0,0,0.14);
                border-radius: 10px;
                box-shadow: 0 14px 40px rgba(0,0,0,0.22);
                font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif;
                font-size: 13px;
                line-height: 1.25;
            }
            .screenshot-dialog.hidden{ display:none; }
            .hidden{ display:none !important; }
            .screenshot-after.hidden, .screenshot-setup.hidden{ display:none; }

            .ss-header{
                display:flex;
                align-items:center;
                justify-content:space-between;
                padding: 10px 12px;
                border-bottom: 1px solid rgba(0,0,0,0.08);
                position: sticky;
                top: 0;
                background: #fff;
                z-index: 1;
            }
            .ss-title{
                font-weight: 600;
                font-size: 14px;
            }
            .ss-close{
                border: none;
                background: transparent;
                font-size: 18px;
                line-height: 1;
                padding: 2px 6px;
                cursor: pointer;
                color: rgba(0,0,0,0.6);
            }
            .ss-close:hover{ color: rgba(0,0,0,0.9); }

            .screenshot-setup, .screenshot-after{ padding: 10px 12px; }
            .ss-section{ padding: 8px 0; }
            .ss-footer{
                display:flex;
                gap: 8px;
                padding-top: 8px;
                border-top: 1px solid rgba(0,0,0,0.08);
            }

            .screenshot-mode{
                display:flex;
                gap: 14px;
                align-items:center;
                margin-bottom: 8px;
            }
            .ss-radio{ display:flex; gap:6px; align-items:center; }
            .ss-check{ display:flex; gap:6px; align-items:center; }
            .ss-row{
                display:flex;
                gap: 8px;
                align-items:center;
                flex-wrap: wrap;
                margin: 6px 0;
            }
            .ss-space-between{ justify-content:space-between; }
            .ss-inline{ display:flex; gap:6px; align-items:center; }
            .ss-label{ font-weight: 600; margin-bottom: 2px; }
            .ss-muted{ color: rgba(0,0,0,0.60); }
            .ss-mono{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace; }

            .setup-hint{ margin-top: 6px; color: rgba(0,0,0,0.60); }
            .ss-actions{ margin-top: 10px; display:flex; justify-content:flex-end; }

            button{
                font: inherit;
                padding: 5px 10px;
                border: 1px solid rgba(0,0,0,0.18);
                background: #fff;
                border-radius: 8px;
                cursor: pointer;
            }
            button:hover{ border-color: rgba(0,0,0,0.30); }
            button.ss-primary{
                background: #111;
                color: #fff;
                border-color: #111;
            }
            button.ss-primary:hover{ background: #000; border-color: #000; }
            input[type=number]{
                width: 6.5em;
                padding: 4px 6px;
                border: 1px solid rgba(0,0,0,0.18);
                border-radius: 8px;
                font: inherit;
            }
            .scalebar-main input[type=number]{ width: 5.0em; }
            .scalebar-grid{
                display: grid;
                grid-template-columns: 1fr;
                gap: 6px;
                margin: 6px 0;
            }
            .scalebar-toggle{ margin: 0; }
            .scalebar-opts{
                display: grid;
                grid-template-columns: max-content max-content max-content 1fr;
                align-items: center;
                gap: 6px 8px;
            }
            .scalebar-row{ display: contents; }
            .scalebar-error-row{
                grid-column: 1 / -1;
                margin-top: 2px;
            }
            .scalebar-px-hint{ white-space: nowrap; }
            .ss-unit{ white-space: nowrap; }
            select{
                padding: 4px 6px;
                border: 1px solid rgba(0,0,0,0.18);
                border-radius: 8px;
                font: inherit;
                background: #fff;
            }

            .screenshot-results>*{ display:none; }
            .screenshot-results.created .download{ display:block; }
            .screenshot-results.pending .pending-message{ display:block; }
            .screenshot-results:not(.created):not(.pending) .instructions{ display:block; }
            .screenshot-results.created .scalebar-main{ display:block; }
            .screenshot-results:not(.created):not(.pending) .scalebar-main{ display:block; }
            .screenshot-results:not(.pending) .ss-create-row{ display:flex; justify-content:flex-end; }
        </style>`;
        if(!document.querySelector('style[data-type="screenshot-tool"]')){
            document.querySelector('head').appendChild(domObjectFromHTML(css));
        }

        const el = domObjectFromHTML(html);
        this.viewer.container.appendChild(el);

        el.addEventListener('mousemove',ev=>ev.stopPropagation());
        el.querySelectorAll('.close').forEach(e=>e.addEventListener('click',()=>this.deactivate()));
        el.querySelectorAll('.back-to-setup').forEach(e=>e.addEventListener('click',()=>{ this.tool.setMode('idle'); this._setState('config'); }));
        el.querySelectorAll('.rect').forEach(e=>e.addEventListener('click',()=>{
            if(this.settings.mode === 'fixed'){
                this._armFixedPlace();
            } else {
                this._armFreeSelect();
            }
        }));
        el.querySelectorAll('.edit-region').forEach(e=>e.addEventListener('click',()=>{
            this._setState('regionEdit');
        }));
        el.querySelectorAll('.done-edit').forEach(e=>e.addEventListener('click',()=>{
            this._setState('regionChosen');
        }));
        el.querySelectorAll('.cancel-screenshot').forEach(e=>e.addEventListener('click',()=>{
            // Restore a real semantic state, not just CSS classes.
            if(this._currentImageBounds){
                this._setupScreenshotDialogFromImageBounds(this._currentImageBounds);
                this._setState('regionChosen');
                return;
            }
            el.querySelector('.screenshot-results').classList.remove('pending','created');
        }));
        el.querySelectorAll('.create-screenshot').forEach(e=>e.addEventListener('click',()=>{
            // Hard block on invalid scalebar inputs (when enabled).
            const sb = this._renderScalebarValidation({ mode: 'hard' });
            if(sb && sb.ok === false){
                return;
            }
            const sel = el.querySelector('.select-output-size-result');
            const selectedOption = sel.options[sel.selectedIndex];
            let data;
            const ibEl = this.dialog.querySelector('[data-last-imagebounds-json]');
            if(!ibEl){
                alert('Missing screenshot region metadata.');
                return;
            }
            const imageBounds = JSON.parse(ibEl.getAttribute('data-last-imagebounds-json'));
            const base = this._lastBasePxForOutput;
            if(!base){
                alert('Missing base pixel sizing metadata.');
                return;
            }
            let factor;
            if(selectedOption?.value === '__other__' || this.settings.output.mode === 'other'){
                // Hard validate the current draft when Other… is selected.
                const otherInput = el.querySelector('.result-output-other-factor');
                const draft = String(otherInput?.value ?? '').trim();
                const parsed = this._parsePositiveFloatDraft(draft);
                if(!parsed.ok){
                    const wrap = el.querySelector('.result-output-other');
                    const err = wrap?.querySelector('.downsample-error');
                    if(err){
                        err.textContent = 'Enter a number > 0';
                        err.classList.remove('hidden');
                    }
                    return;
                }
                factor = parsed.value;
            }else{
                const fromSelect = Number(selectedOption?.value);
                factor = Number.isFinite(fromSelect) && fromSelect > 0 ? fromSelect : Number(this.settings.output.presetFactor);
            }
            const safeFactor = Number.isFinite(factor) && factor > 0 ? factor : 1;
            const { outW, outH } = computeOutputSize(base.baseW, base.baseH, safeFactor);
            data = {
                w: outW,
                h: outH,
                imageBounds,
                scaleFactor: outW / base.baseW,
            };
            this.dialog.querySelector('.screenshot-results').classList.add('pending');
            this._createScreenshot(data).then(blobURL=>{
                const x = this.dialog.querySelector('.screenshot-results');
                x.classList.remove('pending');
                x.classList.add('created');
                this.dialog.querySelectorAll('.screenshot-link').forEach(a=>a.href = this.blobURL);
                const cs = this.dialog.querySelector('.created-summary');
                if(cs){
                    cs.textContent = `Region ${Math.round(base.baseW)}×${Math.round(base.baseH)} → Output ${outW}×${outH}`;
                }
            }).catch(e=>{
                alert('There was a problem creating the screenshot. ' + e );
            });
        }));
        el.querySelectorAll('button.download-screenshot').forEach(e=>e.addEventListener('click',()=>{
            let a = el.querySelectorAll('a.download-screenshot');
            a.dispatchEvent(new Event('change'));
        }));
        el.querySelectorAll('.aspect-width').forEach(e=>{
            const onDraft = ()=>{
                // Draft lives in DOM; soft-validate only (no commits while typing).
                this._syncAspectValidationUI();
            };
            e.addEventListener('input', onDraft);
            e.addEventListener('change', onDraft);
            e.addEventListener('blur',()=>{
                const parsed = this._parsePositiveFloatDraft(e.value);
                if(parsed.ok){
                    this.settings.free.aspectWidth = parsed.value;
                    this.settings = normalizeScreenshotSettings(this.settings);
                    this.tool.setAspectWidth(this.settings.free.aspectWidth);
                    this._scheduleSaveSettings();
                    e.value = String(this.settings.free.aspectWidth);
                }else{
                    e.value = String(this.settings.free.aspectWidth);
                }
                this._syncAspectValidationUI();
            });
        });
        el.querySelectorAll('.aspect-height').forEach(e=>{
            const onDraft = ()=>{
                this._syncAspectValidationUI();
            };
            e.addEventListener('input', onDraft);
            e.addEventListener('change', onDraft);
            e.addEventListener('blur',()=>{
                const parsed = this._parsePositiveFloatDraft(e.value);
                if(parsed.ok){
                    this.settings.free.aspectHeight = parsed.value;
                    this.settings = normalizeScreenshotSettings(this.settings);
                    this.tool.setAspectHeight(this.settings.free.aspectHeight);
                    this._scheduleSaveSettings();
                    e.value = String(this.settings.free.aspectHeight);
                }else{
                    e.value = String(this.settings.free.aspectHeight);
                }
                this._syncAspectValidationUI();
            });
        });
        el.querySelectorAll('.lock-aspect-ratio').forEach(e=>{
            e.addEventListener('change',ev=>{
                this.settings.free.aspectLocked = ev.target.checked;
                this.settings = normalizeScreenshotSettings(this.settings);
                this.tool.setAspectLocked(this.settings.free.aspectLocked);
                this._syncAspectInputsEnabled();
                this._syncAspectValidationUI();
                this._syncFixedBaseValidationUI();
                this._scheduleSaveSettings();
            });
        });
        el.querySelectorAll('.region-dim').forEach(e=>e.addEventListener('change',()=>this._updateROI()));
        el.querySelectorAll('.scalebar-width').forEach(e=>{
            const onInput = (ev)=>{
                const text = String(ev.target.value ?? '');
                if(!this._scalebarWasTouched) this._scalebarWasTouched = true;
                // Soft validation derives from DOM draft.
                const v = this._renderScalebarValidation({ mode: 'soft' });
                // If draft is valid, update numeric state so preview/compose can use it.
                const parsed = this._parsePositiveFloatDraft(text.trim());
                if(parsed.ok){
                    this._scalebarWidth = parsed.value;
                }
                this._syncScalebarUI();
                const isCreated = this.dialog?.querySelector('.screenshot-results')?.classList.contains('created');
                if(isCreated && this._baseScreenshot && v?.ok){
                    this._recomposeFromCachedBaseIfPossible().catch(()=>this._resetScreenshotResults());
                }else{
                    this._resetScreenshotResults();
                }
            };
            e.addEventListener('input', onInput);
            e.addEventListener('change', onInput);
            e.addEventListener('blur',()=>{
                const text = String(e.value ?? '').trim();
                const parsed = this._parsePositiveFloatDraft(text);
                if(parsed.ok){
                    this._scalebarWidth = parsed.value;
                    e.value = String(parsed.value);
                }else{
                    e.value = String(this._scalebarWidth);
                }
                this._syncScalebarUI();
            });
        });
        el.querySelectorAll('.scalebar-height').forEach(e=>{
            const onInput = (ev)=>{
                const text = String(ev.target.value ?? '');
                if(!this._scalebarWasTouched) this._scalebarWasTouched = true;
                const v = Number(text.trim());
                if(Number.isFinite(v) && v >= 1){
                    this._scalebarHeight = Math.round(v);
                }
                this._syncScalebarUI();

                const vv = this._renderScalebarValidation({ mode: 'soft' });
                const isCreated = this.dialog?.querySelector('.screenshot-results')?.classList.contains('created');
                if(isCreated && this._baseScreenshot && vv?.ok){
                    this._recomposeFromCachedBaseIfPossible().catch(()=>this._resetScreenshotResults());
                }else{
                    this._resetScreenshotResults();
                }
            };
            e.addEventListener('input', onInput);
            e.addEventListener('change', onInput);
            e.addEventListener('blur',()=>{
                const text = String(e.value ?? '').trim();
                const v = Number(text);
                if(Number.isFinite(v) && v >= 1){
                    this._scalebarHeight = Math.round(v);
                    e.value = String(this._scalebarHeight);
                }else{
                    e.value = String(this._scalebarHeight);
                }
                this._syncScalebarUI();
            });
        });
        el.querySelectorAll('.include-scalebar').forEach(e=>{
            e.addEventListener('change',ev=>{
                this._includeScalebar = Boolean(ev.target.checked);
                if(this._includeScalebar){
                    this._maybeApplySmartScalebarDefaults();
                }
                this._syncScalebarUI();
                const isCreated = this.dialog?.querySelector('.screenshot-results')?.classList.contains('created');
                const v = this._renderScalebarValidation({ mode: 'soft' });
                if(isCreated && this._baseScreenshot && v?.ok){
                    this._recomposeFromCachedBaseIfPossible().catch(()=>this._resetScreenshotResults());
                }else{
                    this._resetScreenshotResults();
                }
            });
        });
        this.dialog = el;

        // mode + fixed-size controls
        el.querySelectorAll('input[name="screenshot-mode"]').forEach(r=>{
            r.addEventListener('change',()=>{
                const checked = el.querySelector('input[name="screenshot-mode"]:checked');
                this.settings.mode = checked?.value === 'fixed' ? 'fixed' : 'free';
                this.settings = normalizeScreenshotSettings(this.settings);
                this._syncDialogFromSettings();
                this._scheduleSaveSettings();
            });
        });
        el.querySelectorAll('.fixed-base-width').forEach(i=>{
            const onDraft = ()=>{
                this._syncFixedBaseValidationUI();
                // If draft is valid, update the fixed readout preview.
                const bw = el.querySelector('.fixed-base-width');
                const bh = el.querySelector('.fixed-base-height');
                const ui = this._fixedOutputUI;
                const pw = this._parsePositiveIntDraft(bw?.value);
                const ph = this._parsePositiveIntDraft(bh?.value);
                if(ui?.readout && pw.ok && ph.ok){
                    const factor = this.settings.output.mode === 'other'
                        ? Number(this.settings.output.otherFactor)
                        : Number(this.settings.output.presetFactor);
                    const safe = Number.isFinite(factor) && factor > 0 ? factor : 1;
                    const { outW, outH } = computeOutputSize(pw.value, ph.value, safe);
                    ui.readout.textContent = `→ ${outW} × ${outH} (${this._formatDownsampleLabel(safe)})`;
                }
            };
            i.addEventListener('input', onDraft);
            i.addEventListener('change', onDraft);
            i.addEventListener('blur',()=>{
                const parsed = this._parsePositiveIntDraft(i.value);
                if(parsed.ok){
                    this.settings.fixed.baseWidthPx = parsed.value;
                    this.settings = normalizeScreenshotSettings(this.settings);
                    this._scheduleSaveSettings();
                    // Re-sync to repopulate fixed output options/readout/tool params.
                    this._syncDialogFromSettings();
                }else{
                    i.value = String(this.settings.fixed.baseWidthPx);
                }
                this._syncFixedBaseValidationUI();
            });
        });
        el.querySelectorAll('.fixed-base-height').forEach(i=>{
            const onDraft = ()=>{
                this._syncFixedBaseValidationUI();
                const bw = el.querySelector('.fixed-base-width');
                const bh = el.querySelector('.fixed-base-height');
                const ui = this._fixedOutputUI;
                const pw = this._parsePositiveIntDraft(bw?.value);
                const ph = this._parsePositiveIntDraft(bh?.value);
                if(ui?.readout && pw.ok && ph.ok){
                    const factor = this.settings.output.mode === 'other'
                        ? Number(this.settings.output.otherFactor)
                        : Number(this.settings.output.presetFactor);
                    const safe = Number.isFinite(factor) && factor > 0 ? factor : 1;
                    const { outW, outH } = computeOutputSize(pw.value, ph.value, safe);
                    ui.readout.textContent = `→ ${outW} × ${outH} (${this._formatDownsampleLabel(safe)})`;
                }
            };
            i.addEventListener('input', onDraft);
            i.addEventListener('change', onDraft);
            i.addEventListener('blur',()=>{
                const parsed = this._parsePositiveIntDraft(i.value);
                if(parsed.ok){
                    this.settings.fixed.baseHeightPx = parsed.value;
                    this.settings = normalizeScreenshotSettings(this.settings);
                    this._scheduleSaveSettings();
                    this._syncDialogFromSettings();
                }else{
                    i.value = String(this.settings.fixed.baseHeightPx);
                }
                this._syncFixedBaseValidationUI();
            });
        });
        if(el.querySelector('.fixed-output-controls')){
            this._wireOutputSizingControls(el.querySelector('.fixed-output-controls'), 'fixed');
        }
        el.querySelectorAll('.fixed-auto-create').forEach(cb=>{
            cb.addEventListener('change',()=>{
                this.settings.fixed.autoCreateOnClick = cb.checked;
                this.settings = normalizeScreenshotSettings(this.settings);
                // Keep the live fixed-placement tool params in sync immediately.
                this.tool.setFixedParams({ autoCreateOnClick: this.settings.fixed.autoCreateOnClick });
                this._scheduleSaveSettings();
            });
        });
        el.querySelectorAll('.start').forEach(b=>{
            b.addEventListener('click',()=>{
                if(this.settings.mode === 'fixed'){
                    this._armFixedPlace();
                } else {
                    this._armFreeSelect();
                }
            });
        });

        this._syncDialogFromSettings();
        this._syncAspectInputsEnabled();
        this._syncAspectValidationUI();
        if(el.querySelector('.screenshot-results')){
            this._wireOutputSizingControls(el.querySelector('.instructions'), 'result');
        }
    }

    _wireOutputSizingControls(container, kind){
        if(!container) return;
        const select = container.querySelector(kind === 'fixed' ? '.select-output-size-fixed' : '.select-output-size-result');
        const otherWrap = container.querySelector(kind === 'fixed' ? '.fixed-output-other' : '.result-output-other');
        const otherInput = container.querySelector(kind === 'fixed' ? '.fixed-output-other-factor' : '.result-output-other-factor');
        const readout = container.querySelector(kind === 'fixed' ? '.fixed-output-readout' : '.result-output-readout');
        const otherErr = otherWrap?.querySelector('.downsample-error');

        select?.addEventListener('change',()=>{
            const opt = select.options[select.selectedIndex];
            const isOther = opt?.value === '__other__';
            if(isOther){
                this.settings.output.mode = 'other';
                otherWrap?.classList.remove('hidden');
            }else{
                this.settings.output.mode = 'preset';
                const f = Number(opt?.value);
                if(Number.isFinite(f)) this.settings.output.presetFactor = f;
                otherWrap?.classList.add('hidden');
            }
            this.settings = normalizeScreenshotSettings(this.settings);
            if(isOther){
                // Ensure revealed input reflects committed settings (without clobbering mid-edit).
                this._setIfNotFocused(otherInput, String(this.settings.output.otherFactor));
            }
            this._scheduleSaveSettings();
            this._invalidateScreenshotCache();
            this._resetScreenshotResults();
            if(kind === 'fixed'){
                this._syncFixedOutputReadout();
            }else{
                this._syncResultOutputReadout();
                this._syncScalebarUI();
            }
        });

        const setOtherError = (msg)=>{
            if(!otherErr) return;
            if(!msg){
                otherErr.textContent = '';
                otherErr.classList.add('hidden');
            }else{
                otherErr.textContent = msg;
                otherErr.classList.remove('hidden');
            }
        };

        const softSyncOtherDraft = ()=>{
            if(!otherInput) return;
            const draft = String(otherInput.value ?? '').trim();
            const parsed = this._parsePositiveFloatDraft(draft);
            if(parsed.ok){
                setOtherError('');
                // Update readout using draft without committing/mutating settings.
                if(readout){
                    if(kind === 'fixed'){
                        const bw = Number(this.settings.fixed.baseWidthPx);
                        const bh = Number(this.settings.fixed.baseHeightPx);
                        const { outW, outH } = computeOutputSize(bw, bh, parsed.value);
                        readout.textContent = `→ ${outW} × ${outH} (${this._formatDownsampleLabel(parsed.value)})`;
                    }else{
                        const base = this._lastBasePxForOutput;
                        if(base){
                            const { outW, outH } = computeOutputSize(base.baseW, base.baseH, parsed.value);
                            readout.textContent = `→ ${outW} × ${outH} (${this._formatDownsampleLabel(parsed.value)})`;
                        }
                    }
                }
                if(kind !== 'fixed'){
                    // Preview affects scalebar px hint, which uses current output factor.
                    this._syncScalebarUI();
                }
            }else{
                // Allow empty/partial while typing; show a soft warning.
                setOtherError(draft === '' ? 'Enter a number > 0' : 'Enter a number > 0');
            }
        };

        otherInput?.addEventListener('input', softSyncOtherDraft);
        otherInput?.addEventListener('change', softSyncOtherDraft);
        otherInput?.addEventListener('blur', ()=>{
            if(!otherInput) return;
            const draft = String(otherInput.value ?? '').trim();
            const parsed = this._parsePositiveFloatDraft(draft);
            if(parsed.ok){
                // Commit on blur.
                this.settings.output.otherFactor = parsed.value;
                this.settings.output.mode = 'other';
                this.settings = normalizeScreenshotSettings(this.settings);
                this._scheduleSaveSettings();
                this._invalidateScreenshotCache();
                this._resetScreenshotResults();
                setOtherError('');
                // Ensure the field renders the committed value after normalization.
                otherInput.value = String(this.settings.output.otherFactor);
                if(kind === 'fixed') this._syncFixedOutputReadout();
                else { this._syncResultOutputReadout(); this._syncScalebarUI(); }
            }else{
                // Revert to last committed value.
                otherInput.value = String(this.settings.output.otherFactor);
                setOtherError('');
                if(kind === 'fixed') this._syncFixedOutputReadout();
                else { this._syncResultOutputReadout(); this._syncScalebarUI(); }
            }
        });

        // stash refs for convenience
        if(kind === 'fixed'){
            this._fixedOutputUI = { select, otherWrap, otherInput, readout };
        }else{
            this._resultOutputUI = { select, otherWrap, otherInput, readout };
        }
    }

    _populateOutputSelect(selectEl, baseW, baseH){
        if(!selectEl) return;
        selectEl.replaceChildren();
        const opts = buildDownsampleOptions({ baseW, baseH });
        let anyDisabled = false;
        opts.forEach(o=>{
            if(o.kind === 'other'){
                const opt = document.createElement('option');
                opt.value = '__other__';
                opt.textContent = 'Other…';
                selectEl.appendChild(opt);
                return;
            }
            const opt = document.createElement('option');
            opt.value = String(o.factor);
            opt.textContent = o.label;
            if(o.disabled){
                anyDisabled = true;
                opt.setAttribute('disabled','true');
                if(o.disabledReason) opt.setAttribute('data-disabled-reason', String(o.disabledReason));
            }
            selectEl.appendChild(opt);
        });

        // Compact helper message (shown only if relevant) for disabled output options.
        const root = selectEl.closest('.instructions') || selectEl.closest('.fixed-output-controls') || this.dialog;
        const help = root?.querySelector('.output-help');
        if(help){
            if(anyDisabled){
                help.textContent = 'Some output sizes are disabled (too large).';
                help.classList.remove('hidden');
            }else{
                help.textContent = '';
                help.classList.add('hidden');
            }
        }
    }

    _applyOutputUISelection(kind){
        const ui = kind === 'fixed' ? this._fixedOutputUI : this._resultOutputUI;
        if(!ui?.select) return;
        const s = this.settings.output;
        if(s.mode === 'other'){
            ui.select.value = '__other__';
            ui.otherWrap?.classList.remove('hidden');
            if(ui.otherInput) ui.otherInput.value = String(s.otherFactor);
        }else{
            const desired = String(s.presetFactor);
            let matched = Array.from(ui.select.options).find(o=>o.value === desired && !o.disabled);
            if(!matched){
                const desiredNum = Number(desired);
                if(Number.isFinite(desiredNum)){
                    const candidates = Array.from(ui.select.options).filter(o=>{
                        if(o.value === '__other__' || o.disabled) return false;
                        const n = Number(o.value);
                        return Number.isFinite(n);
                    }).map(o=>({ o, n: Number(o.value) }));
                    candidates.sort((a,b)=>Math.abs(a.n - desiredNum) - Math.abs(b.n - desiredNum));
                    matched = candidates[0]?.o;
                }
            }
            if(!matched){
                matched = Array.from(ui.select.options).find(o=>o.value !== '__other__' && !o.disabled);
            }
            if(matched){
                ui.select.value = matched.value;
            }
            ui.otherWrap?.classList.add('hidden');
        }
        if(kind === 'fixed') this._syncFixedOutputReadout();
        else this._syncResultOutputReadout();
    }

    _syncFixedOutputReadout(){
        const ui = this._fixedOutputUI;
        if(!ui?.readout) return;
        const bw = Number(this.settings.fixed.baseWidthPx);
        const bh = Number(this.settings.fixed.baseHeightPx);
        const factor = this.settings.output.mode === 'other'
            ? Number(this.settings.output.otherFactor)
            : Number(this.settings.output.presetFactor);
        const { outW, outH } = computeOutputSize(bw, bh, factor);
        ui.readout.textContent = `→ ${outW} × ${outH} (${this._formatDownsampleLabel(factor)})`;
    }

    _syncResultOutputReadout(){
        const ui = this._resultOutputUI;
        if(!ui?.readout || !this._lastBasePxForOutput) return;
        const { baseW, baseH } = this._lastBasePxForOutput;
        const factor = this.settings.output.mode === 'other'
            ? Number(this.settings.output.otherFactor)
            : Number(this.settings.output.presetFactor);
        const { outW, outH } = computeOutputSize(baseW, baseH, factor);
        ui.readout.textContent = `→ ${outW} × ${outH} (${this._formatDownsampleLabel(factor)})`;
    }

    _syncDialogFromSettings(){
        if(!this.dialog) return;
        const s = this.settings = normalizeScreenshotSettings(this.settings);
        const el = this.dialog;

        // mode
        const freeRadio = el.querySelector('input[name="screenshot-mode"][value="free"]');
        const fixedRadio = el.querySelector('input[name="screenshot-mode"][value="fixed"]');
        if(freeRadio) freeRadio.checked = s.mode === 'free';
        if(fixedRadio) fixedRadio.checked = s.mode === 'fixed';

        // toggle setup sections
        const setupFree = el.querySelector('.setup-free');
        const setupFixed = el.querySelector('.setup-fixed');
        if(setupFree && setupFixed){
            if(s.mode === 'fixed'){
                setupFree.classList.add('hidden');
                setupFixed.classList.remove('hidden');
            }else{
                setupFixed.classList.add('hidden');
                setupFree.classList.remove('hidden');
            }
        }

        // free-select values
        const aw = el.querySelector('.aspect-width');
        const ah = el.querySelector('.aspect-height');
        const al = el.querySelector('.lock-aspect-ratio');
        this._setIfNotFocused(aw, s.free.aspectWidth);
        this._setIfNotFocused(ah, s.free.aspectHeight);
        if(al) al.checked = s.free.aspectLocked;
        this.tool.setAspectWidth(s.free.aspectWidth);
        this.tool.setAspectHeight(s.free.aspectHeight);
        this.tool.setAspectLocked(s.free.aspectLocked);
        this._syncAspectInputsEnabled();
        this._syncAspectValidationUI();

        // fixed-size values
        const bw = el.querySelector('.fixed-base-width');
        const bh = el.querySelector('.fixed-base-height');
        this._setIfNotFocused(bw, s.fixed.baseWidthPx);
        this._setIfNotFocused(bh, s.fixed.baseHeightPx);
        const fixedSel = el.querySelector('.select-output-size-fixed');
        this._populateOutputSelect(fixedSel, s.fixed.baseWidthPx, s.fixed.baseHeightPx);
        this._applyOutputUISelection('fixed');

        const auto = el.querySelector('.fixed-auto-create');
        if(auto) auto.checked = Boolean(s.fixed.autoCreateOnClick);

        this.tool.setFixedParams({
            fullResWidthPx: s.fixed.baseWidthPx,
            fullResHeightPx: s.fixed.baseHeightPx,
            baseWidthPx: s.fixed.baseWidthPx,
            baseHeightPx: s.fixed.baseHeightPx,
            autoCreateOnClick: s.fixed.autoCreateOnClick,
        });
        this._syncFixedBaseValidationUI();
    }

    _computeFixedPlacementAtProjectPoint(projectPoint, fixedParams){
        const ps = this.overlay.paperScope;
        const vp = this.viewer.viewport;
        const fp = fixedParams || this.settings?.fixed || {};

        const baseW = Number(fp.fullResWidthPx ?? fp.baseWidthPx ?? this.settings.fixed.baseWidthPx);
        const baseH = Number(fp.fullResHeightPx ?? fp.baseHeightPx ?? this.settings.fixed.baseHeightPx);
        const factor = this.settings.output.mode === 'other'
            ? Number(this.settings.output.otherFactor)
            : Number(this.settings.output.presetFactor);
        const safeFactor = Number.isFinite(factor) && factor > 0 ? factor : 1;
        const { outW, outH } = computeOutputSize(baseW, baseH, safeFactor);

        const viewPt = ps.view.projectToView(projectPoint);
        const viewerPt = new OpenSeadragon.Point(viewPt.x, viewPt.y);
        const viewportPt = vp.viewerElementToViewportCoordinates(viewerPt);
        const imagePt = vp.viewportToImageCoordinates(viewportPt);

        const imageBounds = new OpenSeadragon.Rect(
            imagePt.x - baseW / 2,
            imagePt.y - baseH / 2,
            baseW,
            baseH
        );

        const viewportRect = vp.imageToViewportRectangle(imageBounds);
        const viewerRect = vp.viewportToViewerElementRectangle(viewportRect);

        const tl = ps.view.viewToProject(new paper.Point(viewerRect.x, viewerRect.y));
        const br = ps.view.viewToProject(new paper.Point(viewerRect.x + viewerRect.width, viewerRect.y + viewerRect.height));
        const bounds = new paper.Rectangle(tl, br);

        return {
            kind: 'fixed',
            autoCreate: Boolean(fp.autoCreateOnClick ?? this.settings.fixed.autoCreateOnClick),
            bounds,
            screenshotData: {
                w: outW,
                h: outH,
                imageBounds,
                scaleFactor: outW / baseW,
            },
        };
    }

    _resolveActiveTiledImageOrThrow(){
        const world = this.viewer?.world;
        const count = world?.getItemCount ? world.getItemCount() : 0;
        if(count === 0){
            throw new Error('Screenshot overlay: no active image found (viewer.world has 0 items). Is the viewer open?');
        }
        if(count > 1){
            throw new Error(`Screenshot overlay: multiple images are active in viewer.world (itemCount=${count}). This overlay currently supports exactly one active image and cannot disambiguate which one to screenshot.`);
        }
        return world.getItemAt(0);
    }

    _setupScreenshotDialogFromImageBounds(imageBounds){
        this._resetScreenshotResults();

        // Normalize to a plain object (safe for JSON + later reconstruction).
        const ib = imageBounds && typeof imageBounds === 'object'
            ? {
                x: Number(imageBounds.x) || 0,
                y: Number(imageBounds.y) || 0,
                width: Math.max(0, Number(imageBounds.width) || 0),
                height: Math.max(0, Number(imageBounds.height) || 0),
                degrees: Number(imageBounds.degrees) || 0,
            }
            : { x: 0, y: 0, width: 0, height: 0, degrees: 0 };

        this._currentImageBounds = ib;

        const bw = Math.round(ib.width);
        const bh = Math.round(ib.height);

        // Invalidate cached screenshots when region changes.
        const nextKey = JSON.stringify({ x: ib.x, y: ib.y, width: ib.width, height: ib.height, degrees: ib.degrees });
        if(this._lastImageBoundsKey !== nextKey){
            this._lastImageBoundsKey = nextKey;
            this._invalidateScreenshotCache();
        }

        // Compact context line near output controls, including physical size when available.
        const ctx = this.dialog.querySelector('.output-context');
        const wEl = this.dialog.querySelector('.region-width');
        const hEl = this.dialog.querySelector('.region-height');
        if(wEl) wEl.value = bw;
        if(hEl) hEl.value = bh;

        // mm display should also be derived from base pixels.
        let calculated_mm = false;
        this._mpp = null;
        // Default scalebar config values (session-only for now).
        if(this._includeScalebar == null) this._includeScalebar = false;
        if(!Number.isFinite(this._scalebarWidth)) this._scalebarWidth = 0.5; // mm
        if(!Number.isFinite(this._scalebarHeight)) this._scalebarHeight = 4; // px
        if(this._scalebarWasTouched == null) this._scalebarWasTouched = false;

        if(this.viewer.world.getItemCount() === 1){
            const mpp = this.viewer.world.getItemAt(0).source.mpp;
            if(mpp){
                const mmEl = this.dialog.querySelector('.region-mm');
                if(mmEl){
                    mmEl.textContent = `${(mpp.x / 1000 * ib.width).toFixed(3)} × ${(mpp.y / 1000 * ib.height).toFixed(3)} mm`;
                    mmEl.classList.remove('hidden');
                }
                calculated_mm = true;
                this._mpp = mpp;

                if(ctx){
                    ctx.textContent = `Region ${bw}×${bh} px (${(mpp.x / 1000 * ib.width).toFixed(2)}×${(mpp.y / 1000 * ib.height).toFixed(2)} mm)`;
                }
            }
        }
        if(!calculated_mm){
            const mmEl = this.dialog.querySelector('.region-mm');
            if(mmEl){
                mmEl.textContent = '';
                mmEl.classList.add('hidden');
            }
            if(ctx){
                ctx.textContent = `Region ${bw}×${bh}`;
            }
        }

        const instructions = this.dialog.querySelector('.instructions');
        instructions?.setAttribute('data-last-imagebounds-json', JSON.stringify(ib));

        const select = this.dialog.querySelector('.select-output-size-result');
        const baseW = ib.width;
        const baseH = ib.height;
        this._lastBasePxForOutput = { baseW, baseH };
        this._populateOutputSelect(select, baseW, baseH);
        this._applyOutputUISelection('result');
        // If scalebar is enabled and user hasn't touched length, re-evaluate a good default for this region/output.
        if(this._includeScalebar){
            this._maybeApplySmartScalebarDefaults();
        }
        this._syncScalebarUI();
    }

    _setupScreenshotDialog(bounds){
        // Back-compat wrapper: convert viewer-element rectangle -> imageBounds, then drive UI from imageBounds.
        const vp = this.viewer.viewport;
        this._resolveActiveTiledImageOrThrow();
        const boundsRect = new OpenSeadragon.Rect(bounds.x, bounds.y, bounds.width, bounds.height);
        const viewportRect = vp.viewerElementToViewportRectangle(boundsRect);
        const imageBounds = vp.viewportToImageRectangle(viewportRect);
        this._setupScreenshotDialogFromImageBounds(imageBounds);
    }

    _updateROI(){
        if(!this._currentImageBounds) return;
        const baseWIn = Number(this.dialog.querySelector('.region-width').value);
        const baseHIn = Number(this.dialog.querySelector('.region-height').value);
        const baseW = Math.max(1, Math.round(baseWIn));
        const baseH = Math.max(1, Math.round(baseHIn));

        const ib = this._currentImageBounds;
        const cx = ib.x + ib.width / 2;
        const cy = ib.y + ib.height / 2;
        let nextW = baseW;
        let nextH = baseH;

        if(this.dialog.querySelector('.lock-aspect-ratio').checked){
            const desiredRatio = this.tool._aspectWidth / this.tool._aspectHeight;
            const currentRatio = nextW / nextH;
            if(currentRatio / desiredRatio > 1){
                nextW = Math.round(nextH * desiredRatio);
            } else if (currentRatio / desiredRatio < 1){
                nextH = Math.round(nextW / desiredRatio);
            }
            nextW = Math.max(1, nextW);
            nextH = Math.max(1, nextH);
        }

        const next = {
            x: cx - nextW / 2,
            y: cy - nextH / 2,
            width: nextW,
            height: nextH,
            degrees: ib.degrees,
        };

        this._setupScreenshotDialogFromImageBounds(next);
    }
    _applyAspectRatio(){
        if(!this._currentImageBounds) return;
        const ib = this._currentImageBounds;
        const cx = ib.x + ib.width / 2;
        const cy = ib.y + ib.height / 2;

        // adjust by the smallest amount to match the aspect ratio (base pixels)
        const desiredRatio = this.tool._aspectWidth / this.tool._aspectHeight;
        let nextW = Math.max(1, Math.round(ib.width));
        let nextH = Math.max(1, Math.round(ib.height));
        const currentRatio = nextW / nextH;
        if(currentRatio / desiredRatio > 1){
            nextW = Math.max(1, Math.round(nextH * desiredRatio));
        } else if (currentRatio / desiredRatio < 1){
            nextH = Math.max(1, Math.round(nextW / desiredRatio));
        }

        const next = {
            x: cx - nextW / 2,
            y: cy - nextH / 2,
            width: nextW,
            height: nextH,
            degrees: ib.degrees,
        };
        this._setupScreenshotDialogFromImageBounds(next);
    }

    _resetScreenshotResults(){
        this.dialog?.querySelector('.screenshot-results').classList.remove('created','pending');
    }

    _setProgress(loaded, total){
        if(this.dialog){
            const progress = this.dialog.querySelector('progress');
            progress.value = loaded;
            progress.max = total;
            this.dialog.querySelector('.loaded').textContent = loaded;
            this.dialog.querySelector('.total').textContent = total;
        }
    }

    _waitForNextPaintFrames(n = 2){
        n = Math.max(0, Math.floor(Number(n) || 0));
        if(n === 0) return Promise.resolve();
        const raf = (typeof window !== 'undefined' && window.requestAnimationFrame) ? window.requestAnimationFrame.bind(window) : null;
        if(!raf){
            return new Promise(resolve=>setTimeout(resolve, 50));
        }
        return new Promise(resolve=>{
            const tick = () => {
                n -= 1;
                if(n <= 0) resolve();
                else raf(tick);
            };
            raf(tick);
        });
    }

    async _renderBaseScreenshot({ w, h, imageBounds }){
        // Expensive path: offscreen OSD render to a base PNG (no scale bar).
        const pixelRatio = OpenSeadragon.pixelDensityRatio;
        const cssW = w / pixelRatio;
        const cssH = h / pixelRatio;
        const ib = imageBounds;
        const boundsRect = new OpenSeadragon.Rect(ib.x, ib.y, ib.width, ib.height, ib.degrees);

        const signature = this._computeRenderSignature({ w, h, imageBounds });
        const ti = this._resolveActiveTiledImageOrThrow();
        const ts = ti.source || this.viewer.tileSources[this.viewer.currentPage()];
        const rotation = this.viewer.viewport.getRotation(true);

        const d = document.createElement('div');
        document.body.appendChild(d);
        d.style.cssText = `width:${cssW}px;height:${cssH}px;position:fixed;left:-${cssW*2}px;`;

        let ssViewer = null;
        try{
            ssViewer = OpenSeadragon({
                element: d,
                tileSources: [ts],
                crossOriginPolicy: this.viewer.crossOriginPolicy,
                prefixUrl: this.viewer.prefixUrl,
                immediateRender: true,
            });
            ssViewer.viewport.setRotation(rotation, true);
            ssViewer.addHandler('tile-drawn',(ev)=>{
                const coverage = ev.tiledImage.coverage;
                const levels = Object.keys(coverage);
                const maxLevel = levels[levels.length - 1];
                if(ev.tile.level == maxLevel){
                    const full = coverage[maxLevel];
                    const status = Object.values(full).map(o=>Object.values(o)).flat();
                    this._setProgress(status.filter(x=>x).length, status.length);
                }
            });

            await new Promise((resolve, reject)=>{
                ssViewer.addHandler('open',()=>{
                    try{
                        ssViewer.world.getItemAt(0).setRotation(ti.getRotation(true), true);
                        const bounds = ssViewer.viewport.imageToViewportRectangle(boundsRect);
                        ssViewer.viewport.fitBounds(bounds);
                        ssViewer.world.getItemAt(0).addOnceHandler('fully-loaded-change',()=>{
                            resolve();
                        });
                    }catch(e){
                        reject(e);
                    }
                });
                ssViewer.addHandler('open-failed', reject);
            });

            await this._waitForNextPaintFrames(2);

            let blob = await new Promise((resolve)=>ssViewer.drawer.canvas.toBlob(resolve));
            if(!blob) throw new Error('Failed to export screenshot canvas.');
            if(pixelRatio !== 1){
                blob = await changeDpiBlob(blob, 96 * pixelRatio);
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

    _computeRenderSignature({ w, h, imageBounds }){
        const ib = imageBounds;
        const ti = this._resolveActiveTiledImageOrThrow();
        const ts = ti.source || this.viewer.tileSources[this.viewer.currentPage()];
        const rotation = this.viewer.viewport.getRotation(true);
        return JSON.stringify({
            imageBounds: { x: ib.x, y: ib.y, width: ib.width, height: ib.height, degrees: ib.degrees },
            outW: w,
            outH: h,
            rotation,
            tileSourceKey: ts?.url || ts?.tilesUrl || ts?.tileUrl || ts?.Image?.Url || null,
        });
    }

    async _composeScreenshotWithScalebar({ baseBlob, pixelRatio, scaleFactor }){
        // Cheap path: draw scalebar onto the cached base image and export.
        const img = (typeof createImageBitmap === 'function')
            ? await createImageBitmap(baseBlob)
            : await new Promise((resolve, reject)=>{
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

        if(this._includeScalebar && this._mpp){
            const padding = 12;
            const pxLen = Math.max(1, Math.round(this._scalebarWidth * 1000 / this._mpp.x * scaleFactor));
            const pxH = Math.max(1, Math.round(this._scalebarHeight));
            const x2 = canvas.width - padding;
            const y2 = canvas.height - padding;
            const x1 = Math.max(padding, x2 - pxLen);
            const y1 = Math.max(padding, y2 - pxH);
            ctx.fillStyle = '#000';
            ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
        }

        let blob = await new Promise((resolve)=>canvas.toBlob(resolve));
        if(!blob) throw new Error('Failed to export composed screenshot.');
        if(pixelRatio !== 1){
            blob = await changeDpiBlob(blob, 96 * pixelRatio);
        }
        return blob;
    }

    async _createScreenshot(data){
        const { w, h, imageBounds, scaleFactor } = data;
        const signature = this._computeRenderSignature({ w, h, imageBounds });

        // Render base screenshot if needed.
        if(!this._baseScreenshot || this._baseScreenshot.signature !== signature){
            const base = await this._renderBaseScreenshot({ w, h, imageBounds });
            if(this._baseScreenshot?.url){
                this._revokeObjectURL(this._baseScreenshot.url);
            }
            this._baseScreenshot = {
                blob: base.blob,
                url: URL.createObjectURL(base.blob),
                pixelRatio: base.pixelRatio,
                signature: base.signature,
            };
            this._lastScreenshotRequest = { data, signature: base.signature };
        }else{
            this._lastScreenshotRequest = { data, signature };
        }

        // Compose (or reuse base) depending on scalebar setting.
        let finalBlob;
        if(this._includeScalebar && this._mpp){
            finalBlob = await this._composeScreenshotWithScalebar({
                baseBlob: this._baseScreenshot.blob,
                pixelRatio: this._baseScreenshot.pixelRatio,
                scaleFactor,
            });
        }else{
            finalBlob = this._baseScreenshot.blob;
        }

        if(this.blobURL){
            this._revokeObjectURL(this.blobURL);
        }
        this.blobURL = URL.createObjectURL(finalBlob);
        return this.blobURL;
    }
}

/**
 * @class 
 * @extends ToolBase
 * 
 */
class ScreenshotTool extends ToolBase{
    
    
    constructor(paperScope, overlay){
        super(paperScope);
        let self = this;
        this._overlay = overlay;

        this._ps = paperScope;
        this.compoundPath = new paper.CompoundPath({children:[],fillRule:'evenodd'});
        this.compoundPath.visible = false;
        this.compoundPath.fillColor = 'black';
        this.compoundPath.opacity = 0.3;

        this.project.toolLayer.addChild(this.compoundPath);

        this.crosshairTool = new paper.Group();
        let h1 = new paper.Path({segments:[new paper.Point(0,0),new paper.Point(0,0)],strokeScaling:false,strokeWidth:1,strokeColor:'black'});
        let h2 = new paper.Path({segments:[new paper.Point(0,0),new paper.Point(0,0)],strokeScaling:false,strokeWidth:1,strokeColor:'white',dashArray:[6,6]});
        let v1 = new paper.Path({segments:[new paper.Point(0,0),new paper.Point(0,0)],strokeScaling:false,strokeWidth:1,strokeColor:'black'});
        let v2 = new paper.Path({segments:[new paper.Point(0,0),new paper.Point(0,0)],strokeScaling:false,strokeWidth:1,strokeColor:'white',dashArray:[6,6]});
        this.crosshairTool.addChildren([h1,h2,v1,v2]);
        this.project.toolLayer.addChild(this.crosshairTool);
        this.crosshairTool.visible = false;

        this.fixedPreview = new paper.Path.Rectangle(new paper.Rectangle(0,0,1,1));
        this.fixedPreview.visible = false;
        this.fixedPreview.strokeColor = 'yellow';
        this.fixedPreview.strokeWidth = 2;
        this.fixedPreview.fillColor = null;
        this.fixedPreview.dashArray = [6, 4];
        this.project.toolLayer.addChild(this.fixedPreview);
       
        this._aspectHeight = 1;
        this._aspectWidth = 1;
        this._aspectLocked = false;
        this._mode = 'idle'; // idle | freeSelect | fixedPlace
        this._fixedParams = {
            fullResWidthPx: 256,
            fullResHeightPx: 256,
            baseWidthPx: 256,
            baseHeightPx: 256,
            autoCreateOnClick: true,
        };

        
        this.tool.onMouseDown= (ev) => {
            if(this._mode === 'freeSelect'){
                this.crosshairTool.visible = false;
                this.fixedPreview.visible = false;
                this.compoundPath.visible = true;
                this.compoundPath.removeChildren();
                this.compoundPath.addChild(new paper.Path.Rectangle(this._ps.view.bounds));
                return;
            }
            if(this._mode === 'fixedPlace'){
                // preview is positioned on move; click confirms
                return;
            }
        };
        this.tool.onMouseDrag= (ev) => {
            if(this._mode !== 'freeSelect') return;
            this.compoundPath.removeChildren(1);
            let point = this.getPoint(ev);
            this.compoundPath.addChild(new paper.Path.Rectangle(ev.downPoint, point));
        };
        this.tool.onMouseMove= (ev) => {
            if(this._mode === 'freeSelect'){
                this.crosshairTool.visible = true;
                this.fixedPreview.visible = false;
                setCursorPosition(self.tool, ev.point);
                return;
            }
            if(this._mode === 'fixedPlace'){
                this.crosshairTool.visible = false;
                this.compoundPath.visible = false;
                this.fixedPreview.visible = true;
                const payload = this._overlay._computeFixedPlacementAtProjectPoint(ev.point, this._fixedParams);
                this.fixedPreview.removeSegments();
                this.fixedPreview.addSegments([
                    payload.bounds.topLeft,
                    payload.bounds.topRight,
                    payload.bounds.bottomRight,
                    payload.bounds.bottomLeft,
                ]);
                this.fixedPreview.closed = true;
                return;
            }
            this.crosshairTool.visible = false;
            this.fixedPreview.visible = false;
            this.compoundPath.visible = false;
        };
        this.tool.onMouseUp = (ev) => {
            if(this._mode === 'freeSelect'){
                const rect = this._rectFromDrag(ev);
                this.broadcast('region-selected', rect);
                return;
            }
            if(this._mode === 'fixedPlace'){
                const payload = this._overlay._computeFixedPlacementAtProjectPoint(ev.point, this._fixedParams);
                this.broadcast('region-selected', payload);
                return;
            }
        };
        this.tool.extensions.onKeyDown=function(ev){
            if(ev.key=='escape'){
                overlay.deactivate();
            }
        }
        this.extensions.onActivate = () => {
            this._active = true;
            this._syncVisibilityForMode();
        }
        this.extensions.onDeactivate = (finished) => {
            this._active = false;
            this.crosshairTool.visible = false;
            this.compoundPath.visible = false;
            this.fixedPreview.visible = false;
        }   
        

        function setCursorPosition(tool, point){
            
            let pt = tool.view.projectToView(point);
            let left=tool.view.viewToProject(new paper.Point(0, pt.y))
            let right=tool.view.viewToProject(new paper.Point(tool.view.viewSize.width, pt.y))
            let top=tool.view.viewToProject(new paper.Point(pt.x, 0))
            let bottom=tool.view.viewToProject(new paper.Point(pt.x,tool.view.viewSize.height))
            // console.log(viewBounds)
            h1.segments[0].point = left;
            h2.segments[0].point = left;
            h1.segments[1].point = right;
            h2.segments[1].point = right;
            v1.segments[0].point = top;
            v2.segments[0].point = top;
            v1.segments[1].point = bottom;
            v2.segments[1].point = bottom;
        }

    }

    activate(){
        super.activate();
    }
    deactivate(){
        super.deactivate(true);
    }
    setMode(mode){
        this._mode = mode || 'idle';
        this._syncVisibilityForMode();
    }
    _syncVisibilityForMode(){
        if(!this._active) return;
        if(this._mode === 'freeSelect'){
            this.crosshairTool.visible = true;
            this.compoundPath.visible = false;
            this.fixedPreview.visible = false;
        } else if(this._mode === 'fixedPlace'){
            this.crosshairTool.visible = false;
            this.compoundPath.visible = false;
            this.fixedPreview.visible = true;
        } else {
            this.crosshairTool.visible = false;
            this.compoundPath.visible = false;
            this.fixedPreview.visible = false;
        }
    }
    setAspectHeight(h){
        this._aspectHeight = h;
    }
    setAspectWidth(w){
        this._aspectWidth = w;
    }
    setAspectLocked(l){
        this._aspectLocked = l;
    }
    setFixedParams(params){
        this._fixedParams = { ...this._fixedParams, ...(params || {}) };
    }
    getPoint(ev){
        let point = ev.point;
        if(this._aspectLocked){
            let delta = ev.point.subtract(ev.downPoint);
            
            if(Math.abs(delta.x) > Math.abs(delta.y)){
                point.y = ev.downPoint.y + (delta.y < 0 ? -1 : 1 ) * Math.abs(delta.x) * this._aspectHeight / this._aspectWidth;
            } else {
                point.x = ev.downPoint.x + (delta.x < 0 ? -1 : 1 ) * Math.abs(delta.y) * this._aspectWidth / this._aspectHeight;
            }
        }
        return point;
    }

    _rectFromDrag(ev){
        const point = this.getPoint(ev);
        return new paper.Rectangle(ev.downPoint, point);
    }
    
}
export {ScreenshotTool};
export {ScreenshotOverlay};



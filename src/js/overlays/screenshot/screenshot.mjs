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


import { PaperOverlay } from '../../paper-overlay.mjs';
import { OpenSeadragon } from '../../osd-loader.mjs';
import { paper } from '../../paperjs.mjs';
import { loadScreenshotSettings, normalizeScreenshotSettings, saveScreenshotSettings } from './screenshot-settings.mjs';
import { buildDownsampleOptions, computeOutputSize } from './screenshot-sizing.mjs';
import { ViewerOverlayBase } from '../base.mjs';
import { ScreenshotTool } from './screenshot-tool.mjs';
import { createScreenshotDialogElement } from './screenshot-dialog.mjs';
import { renderBaseScreenshot, composeScreenshotWithScalebar, computeRenderSignature } from './screenshot-render.mjs';

class ScreenshotOverlay extends ViewerOverlayBase {
    static get label() { return 'Take Screenshot'; }
    static get faIconClass() { return 'fa-camera'; }

    /**
     * Creates an instance of the ScreenshotOverlay.
     *
     * @param {OpenSeadragon.Viewer} viewer - The OpenSeadragon viewer object.
     * @param {Object} [options]
     * @param {String} [options.downloadMessage] - A message to display in the download window
     * @param {boolean} [options.registerWithConfig=true] Set false to suppress auto-registration with ConfigurationWidget
     */
    constructor(viewer, options = {}){
        super(viewer, options);

        // --- Core objects ---
        this.overlay = new PaperOverlay(viewer, { overlayType: 'viewer' });
        this.tool = new ScreenshotTool(this.overlay.paperScope, this);
        this.dummyTool = new this.overlay.paperScope.Tool();
        this.dummyTool.activate();
        this.dialog = null; // populated by _makeDialog
        this.blobURL = null;

        // --- Settings & state ---
        this.settings = loadScreenshotSettings();
        this._state = 'inactive'; // inactive | config | freeSelectArmed | fixedPlaceArmed | regionChosen | regionEdit | creating | created
        this._mouseNavEnabledAtActivation = true;
        this._saveSettingsTimeout = null;
        this._region = null; // { viewportRect, screenWidth, screenHeight, rotation }
        this._lastRegionKey = null;
        this._lastBasePxForOutput = null; // { baseW, baseH }

        // --- Screenshot cache ---
        this._baseScreenshot = null; // { blob, url, pixelRatio, signature }
        this._lastScreenshotRequest = null; // { data, signature }

        // --- Scalebar state ---
        this._mpp = null;
        this._includeScalebar = false;
        this._scalebarWidth = 0.5;
        this._scalebarHeight = 4;
        this._scalebarShowLabel = false;
        this._scalebarWasTouched = false;

        // --- Output UI refs (populated by _wireOutputSizingControls) ---
        this._fixedOutputUI = null;
        this._resultOutputUI = null;

        this.button = this.overlay.addViewerButton({
            faIconClass:'fa-camera',
            tooltip:'Take Screenshot',
            onClick:()=>{
                this._active ? this.deactivate() : this.activate();
            }
        });

        this.button.element.querySelector('svg.icon')?.style.setProperty('width', '1em');

        this._makeDialog(options); //creates this.dialog

        this.tool.addEventListener('region-selected',(payload)=>this._onRegionSelected(payload));

        this._autoRegister();
    }
    /**
     * Activates the overlay.
     */
    activate(){
        let reactivate = this.overlay.setOSDMouseNavEnabled(false);
        this._mouseNavEnabledAtActivation = this._mouseNavEnabledAtActivation || reactivate;
        this.overlay.bringToFront();
        this._setActive(true);
        this.tool.activate();
        this.tool.setMode('idle');
        this._setState('config');
    }
    /**
     * Deactivates the overlay.
     */
    deactivate(){
        this._setActive(false);
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

        // Visibility map: which panels are shown/hidden and result status for each state.
        // Keys: dialog (root), setup, after, edit; values: true = visible.
        // resultAdd/resultRemove control CSS classes on .screenshot-results.
        const STATE_MAP = {
            inactive:       { dialog:false, setup:true,  after:false, edit:false, resultAdd:[],          resultRemove:['pending','created'] },
            config:         { dialog:true,  setup:true,  after:false, edit:false, resultAdd:[],          resultRemove:['pending','created'], afterEntry: () => this._syncDialogFromSettings() },
            freeSelectArmed:{ dialog:false },
            fixedPlaceArmed:{ dialog:false },
            regionChosen:   { dialog:true,  setup:false, after:true,  edit:false, resultAdd:[],          resultRemove:['pending','created'] },
            regionEdit:     { dialog:true,  setup:false, after:false, edit:true },
            creating:       { dialog:true,  setup:false, after:true,  edit:false, resultAdd:['pending'], resultRemove:['created'] },
            created:        { dialog:true,  setup:false, after:true,  edit:false, resultAdd:['created'], resultRemove:['pending'] },
        };

        const spec = STATE_MAP[next];
        if(!spec) return;

        const el = this.dialog;
        el.classList.toggle('hidden', !spec.dialog);

        const panels = { setup: '.screenshot-setup', after: '.screenshot-after', edit: '.screenshot-edit' };
        for(const [key, sel] of Object.entries(panels)){
            if(key in spec) el.querySelector(sel)?.classList.toggle('hidden', !spec[key]);
        }

        const results = el.querySelector('.screenshot-results');
        if(results){
            (spec.resultRemove || []).forEach(c => results.classList.remove(c));
            (spec.resultAdd || []).forEach(c => results.classList.add(c));
        }

        spec.afterEntry?.();
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

    _resolveEffectiveOutputFactor(){
        const factor = this.settings.output.mode === 'other'
            ? Number(this.settings.output.otherFactor)
            : Number(this.settings.output.presetFactor);
        return Number.isFinite(factor) && factor > 0 ? factor : 1;
    }

    _formatReadout(outW, outH, factor){
        return `→ ${outW} × ${outH} (${this._formatDownsampleLabel(factor)})`;
    }

    _tryRecomposeOrReset(){
        const isCreated = this.dialog?.querySelector('.screenshot-results')?.classList.contains('created');
        const v = this._renderScalebarValidation({ mode: 'soft' });
        if(isCreated && this._baseScreenshot && v?.ok){
            this._recomposeFromCachedBaseIfPossible().catch(()=>this._resetScreenshotResults());
        }else{
            this._resetScreenshotResults();
        }
    }

    _computeSmartScalebarLengthMm(){
        if(!this._mpp || !this._mpp.x || !this._region) return null;
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

    _formatMmLabel(mm){
        const n = Number(mm);
        if(!Number.isFinite(n)) return '';
        // Trim trailing zeros (e.g. 0.10 -> 0.1) while avoiding scientific notation for small numbers.
        const s = n.toFixed(4).replace(/\.?0+$/,'');
        return s;
    }

    _scalebarLabelText(){
        return `${this._formatMmLabel(this._scalebarWidth)} mm`;
    }

    _scalebarLabelFit({ scaleFactor }){
        const enabled = Boolean(this._includeScalebar && this._mpp && this._scalebarShowLabel);
        if(!enabled) return { enabled:false, fits:true, label:'' };
        const label = this._scalebarLabelText();
        // Bar pixel size in output space.
        const pxLen = Math.max(1, Math.round(this._scalebarWidth * 1000 / this._mpp.x * scaleFactor));
        const pxH = Math.max(1, Math.round(this._scalebarHeight));

        // Measure text with the same font we’ll draw with.
        let ctx = null;
        try{
            const c = document.createElement('canvas');
            ctx = c.getContext('2d');
        }catch{ /* ignore */ }
        if(!ctx){
            return { enabled:true, fits:true, label, pxLen, pxH, textWidth:0, fontPx:12 };
        }
        const fontPx = 12;
        ctx.font = `${fontPx}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
        const textWidth = ctx.measureText(label).width;
        const fits = textWidth <= (pxLen - 6) && fontPx <= (pxH - 2);
        return { enabled:true, fits, label, pxLen, pxH, textWidth, fontPx };
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
        const showLabel = this.dialog.querySelector('.scalebar-show-label');
        const labelHint = this.dialog.querySelector('.scalebar-label-hint');
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
        if(showLabel) showLabel.checked = Boolean(this._scalebarShowLabel);

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
            }else if(hasMpp && this._includeScalebar && this._region){
                const v = this._validateScalebarDraft();
                if(!v.lengthOk){
                    hint.style.visibility = 'hidden';
                    hint.textContent = '';
                }else{
                    hint.style.visibility = 'visible';
                const baseW = this._region.screenWidth;
                const factor = this._getCurrentOutputFactorFromUI('result');
                const safeFactor = Number.isFinite(factor) && factor > 0 ? factor : 1;
                const { outW } = computeOutputSize(baseW, this._region.screenHeight, safeFactor);
                const scaleFactor = outW / baseW;
                const pxLen = Math.max(1, Math.round(v.lengthMm * 1000 / this._mpp.x * scaleFactor));
                hint.textContent = `≈ ${pxLen} px at output`;

                if(labelHint){
                    const fit = this._scalebarLabelFit({ scaleFactor });
                    if(fit.enabled && !fit.fits){
                        labelHint.textContent = 'Increase length/height to fit label';
                        labelHint.classList.remove('hidden');
                    }else{
                        labelHint.textContent = '';
                        labelHint.classList.add('hidden');
                    }
                }
                }
            }else{
                hint.style.visibility = 'hidden';
                hint.textContent = '';
                if(labelHint){
                    labelHint.textContent = '';
                    labelHint.classList.add('hidden');
                }
            }
        }
        this._renderScalebarValidation({ mode: 'soft' });
    }

    _buildCurrentScreenshotRequestFromUI(){
        if(!this.dialog || !this._region || !this._lastBasePxForOutput) return null;
        const base = this._lastBasePxForOutput;
        const factor = this._getCurrentOutputFactorFromUI('result');
        const safeFactor = Number.isFinite(factor) && factor > 0 ? factor : 1;
        const { outW, outH } = computeOutputSize(base.baseW, base.baseH, safeFactor);
        return {
            data: {
                w: outW,
                h: outH,
                viewportRect: this._region.viewportRect,
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
        const ctx = this._buildRenderContext({ w: data.w, h: data.h, viewportRect: data.viewportRect });
        const sig = computeRenderSignature({ w: data.w, h: data.h, viewportRect: data.viewportRect, rotation: ctx.rotation, tileSource: ctx.tileSource });
        if(sig !== this._baseScreenshot.signature) return false;

        let finalUrl = null;
        if(this._includeScalebar && this._mpp){
            const blob = await composeScreenshotWithScalebar({
                baseBlob: this._baseScreenshot.blob,
                pixelRatio: this._baseScreenshot.pixelRatio,
                scaleFactor: data.scaleFactor,
                scalebar: {
                    include: true,
                    widthMm: this._scalebarWidth,
                    heightPx: this._scalebarHeight,
                    mppX: this._mpp.x,
                    label: this._scalebarShowLabel ? this._scalebarLabelFit({ scaleFactor: data.scaleFactor }) : null,
                },
            });
            if(this.blobURL) this._revokeObjectURL(this.blobURL);
            this.blobURL = URL.createObjectURL(blob);
            finalUrl = this.blobURL;
        }else{
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
        this._syncDialogFromSettings();
        this.tool.setMode('fixedPlace');
        this._setState('fixedPlaceArmed');
    }

    _handleFixedPlacement(payload){
        const region = payload?.region;
        if(!region){
            alert('Missing fixed placement region metadata.');
            this._setState('regionChosen');
            return;
        }

        this.tool.setMode('idle');
        this._setRegion(region);

        if(payload.autoCreate){
            const safeFactor = this._resolveEffectiveOutputFactor();
            const { outW, outH } = computeOutputSize(region.screenWidth, region.screenHeight, safeFactor);
            const data = {
                w: outW, h: outH,
                viewportRect: region.viewportRect,
                scaleFactor: outW / region.screenWidth,
            };
            this._setState('creating');
            this._createScreenshot(data).then(()=>{
                this.dialog.querySelectorAll('.screenshot-link').forEach(a=>a.href = this.blobURL);
                const cs = this.dialog.querySelector('.created-summary');
                if(cs){
                    cs.textContent = `Region ${Math.round(region.screenWidth)}×${Math.round(region.screenHeight)} → Output ${outW}×${outH}`;
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

        this.tool.setMode('idle');
        this._resolveActiveTiledImageOrThrow();
        const region = this._viewerElementRectToRegion(bounds);
        this._setRegion(region);
        this._setState('regionChosen');
    }

    _makeDialog(options){
        const el = createScreenshotDialogElement();
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
            if(this._region){
                this._setRegion(this._region);
                this._setState('regionChosen');
                return;
            }
            el.querySelector('.screenshot-results').classList.remove('pending','created');
        }));
        el.querySelectorAll('.create-screenshot').forEach(e=>e.addEventListener('click',()=>{
            const sb = this._renderScalebarValidation({ mode: 'hard' });
            if(sb && sb.ok === false) return;

            if(!this._region){
                alert('Missing screenshot region metadata.');
                return;
            }
            const base = this._lastBasePxForOutput;
            if(!base){
                alert('Missing base pixel sizing metadata.');
                return;
            }
            const sel = el.querySelector('.select-output-size-result');
            const selectedOption = sel.options[sel.selectedIndex];
            let factor;
            if(selectedOption?.value === '__other__' || this.settings.output.mode === 'other'){
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
            const data = {
                w: outW,
                h: outH,
                viewportRect: this._region.viewportRect,
                scaleFactor: outW / base.baseW,
            };
            this.dialog.querySelector('.screenshot-results').classList.add('pending');
            this._createScreenshot(data).then(()=>{
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
            el.querySelector('a.download-screenshot')?.click();
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
                this._tryRecomposeOrReset();
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
                this._tryRecomposeOrReset();
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
                this._tryRecomposeOrReset();
            });
        });
        el.querySelectorAll('.scalebar-show-label').forEach(e=>{
            e.addEventListener('change',ev=>{
                this._scalebarShowLabel = Boolean(ev.target.checked);
                this._syncScalebarUI();
                this._tryRecomposeOrReset();
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
        const wireFixedBaseInput = (selector, settingKey) => {
            el.querySelectorAll(selector).forEach(i=>{
                const onDraft = ()=>{
                    this._syncFixedBaseValidationUI();
                    this._syncFixedBaseDraftReadout();
                };
                i.addEventListener('input', onDraft);
                i.addEventListener('change', onDraft);
                i.addEventListener('blur',()=>{
                    const parsed = this._parsePositiveIntDraft(i.value);
                    if(parsed.ok){
                        this.settings.fixed[settingKey] = parsed.value;
                        this.settings = normalizeScreenshotSettings(this.settings);
                        this._scheduleSaveSettings();
                        this._syncDialogFromSettings();
                    }else{
                        i.value = String(this.settings.fixed[settingKey]);
                    }
                    this._syncFixedBaseValidationUI();
                });
            });
        };
        wireFixedBaseInput('.fixed-base-width', 'baseWidthPx');
        wireFixedBaseInput('.fixed-base-height', 'baseHeightPx');
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
                if(readout){
                    const base = kind === 'fixed'
                        ? { baseW: Number(this.settings.fixed.baseWidthPx), baseH: Number(this.settings.fixed.baseHeightPx) }
                        : this._lastBasePxForOutput;
                    if(base){
                        const { outW, outH } = computeOutputSize(base.baseW, base.baseH, parsed.value);
                        readout.textContent = this._formatReadout(outW, outH, parsed.value);
                    }
                }
                if(kind !== 'fixed') this._syncScalebarUI();
            }else{
                setOtherError('Enter a number > 0');
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

    _syncFixedBaseDraftReadout(){
        const bw = this.dialog?.querySelector('.fixed-base-width');
        const bh = this.dialog?.querySelector('.fixed-base-height');
        const ui = this._fixedOutputUI;
        const pw = this._parsePositiveIntDraft(bw?.value);
        const ph = this._parsePositiveIntDraft(bh?.value);
        if(ui?.readout && pw.ok && ph.ok){
            const factor = this._resolveEffectiveOutputFactor();
            const { outW, outH } = computeOutputSize(pw.value, ph.value, factor);
            ui.readout.textContent = this._formatReadout(outW, outH, factor);
        }
    }

    _syncFixedOutputReadout(){
        const ui = this._fixedOutputUI;
        if(!ui?.readout) return;
        const bw = Number(this.settings.fixed.baseWidthPx);
        const bh = Number(this.settings.fixed.baseHeightPx);
        const factor = this._resolveEffectiveOutputFactor();
        const { outW, outH } = computeOutputSize(bw, bh, factor);
        ui.readout.textContent = this._formatReadout(outW, outH, factor);
    }

    _syncResultOutputReadout(){
        const ui = this._resultOutputUI;
        if(!ui?.readout || !this._lastBasePxForOutput) return;
        const { baseW, baseH } = this._lastBasePxForOutput;
        const factor = this._resolveEffectiveOutputFactor();
        const { outW, outH } = computeOutputSize(baseW, baseH, factor);
        ui.readout.textContent = this._formatReadout(outW, outH, factor);
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

        // Cursor position in viewer-element (screen pixel) space
        const viewPt = ps.view.projectToView(projectPoint);

        // Convert image dimensions to viewer-element pixel dimensions
        // using point-level conversions (no Rect, no normalization).
        const p0 = vp.pixelFromPoint(vp.imageToViewportCoordinates(0, 0), true);
        const pW = vp.pixelFromPoint(vp.imageToViewportCoordinates(baseW, 0), true);
        const pH = vp.pixelFromPoint(vp.imageToViewportCoordinates(0, baseH), true);
        const viewerW = p0.distanceTo(pW);
        const viewerH = p0.distanceTo(pH);

        // Screen-aligned viewer-element rect centered on cursor (degrees=0).
        // This matches the free-draw path: _viewerElementRectToRegion receives
        // a degrees=0 rect and correctly measures screen-axis image-pixel extents.
        const viewerRect = new OpenSeadragon.Rect(
            viewPt.x - viewerW / 2, viewPt.y - viewerH / 2, viewerW, viewerH);
        const region = this._viewerElementRectToRegion(viewerRect);

        // Preview bounds: same rect, converted to paper.js project space
        const tl = ps.view.viewToProject(new paper.Point(viewPt.x - viewerW / 2, viewPt.y - viewerH / 2));
        const br = ps.view.viewToProject(new paper.Point(viewPt.x + viewerW / 2, viewPt.y + viewerH / 2));
        const bounds = new paper.Rectangle(tl, br);

        return {
            kind: 'fixed',
            autoCreate: Boolean(fp.autoCreateOnClick ?? this.settings.fixed.autoCreateOnClick),
            bounds,
            region,
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

    /**
     * Convert a viewer-element-space rectangle into a ScreenshotRegion.
     * The input rect may carry a `degrees` property (e.g. from OSD's fromSummits);
     * its actual corners (honoring degrees) are used for screen-axis measurements.
     *
     * @param {(OpenSeadragon.Rect|Object)} viewerElementRect - `OpenSeadragon.Rect` or plain object with `x`, `y`, `width`, `height`, and optional `degrees`
     * @returns {{viewportRect: OpenSeadragon.Rect, screenWidth: number, screenHeight: number, rotation: number}}
     */
    _viewerElementRectToRegion(viewerElementRect){
        const vp = this.viewer.viewport;
        const osdRect = (viewerElementRect instanceof OpenSeadragon.Rect)
            ? viewerElementRect
            : new OpenSeadragon.Rect(viewerElementRect.x, viewerElementRect.y,
                viewerElementRect.width, viewerElementRect.height, viewerElementRect.degrees || 0);

        const viewportRect = vp.viewerElementToViewportRectangle(osdRect);

        const tl = osdRect.getTopLeft();
        const tr = osdRect.getTopRight();
        const bl = osdRect.getBottomLeft();
        const iTL = vp.viewerElementToImageCoordinates(tl);
        const iTR = vp.viewerElementToImageCoordinates(tr);
        const iBL = vp.viewerElementToImageCoordinates(bl);

        return {
            viewportRect,
            screenWidth: iTR.distanceTo(iTL),
            screenHeight: iBL.distanceTo(iTL),
            rotation: vp.getRotation(true),
        };
    }

    /**
     * Store a ScreenshotRegion and update the dialog UI to reflect it.
     * This is the single entry point for all code paths that establish or
     * modify the selected screenshot region.
     *
     * @param {{viewportRect: OpenSeadragon.Rect, screenWidth: number, screenHeight: number, rotation: number}} region
     */
    _setRegion(region){
        this._resetScreenshotResults();
        this._region = region;

        const bw = Math.round(region.screenWidth);
        const bh = Math.round(region.screenHeight);

        // Invalidate cached screenshots when the region changes.
        const nextKey = JSON.stringify({
            vp: { x: region.viewportRect.x, y: region.viewportRect.y,
                  width: region.viewportRect.width, height: region.viewportRect.height,
                  degrees: region.viewportRect.degrees },
            rotation: region.rotation,
        });
        if(this._lastRegionKey !== nextKey){
            this._lastRegionKey = nextKey;
            this._invalidateScreenshotCache();
        }

        const ctx = this.dialog.querySelector('.output-context');
        const wEl = this.dialog.querySelector('.region-width');
        const hEl = this.dialog.querySelector('.region-height');
        if(wEl) wEl.value = bw;
        if(hEl) hEl.value = bh;

        let calculated_mm = false;
        this._mpp = null;

        if(this.viewer.world.getItemCount() === 1){
            const mpp = this.viewer.world.getItemAt(0).source.mpp;
            if(mpp){
                const mmEl = this.dialog.querySelector('.region-mm');
                if(mmEl){
                    mmEl.textContent = `${(mpp.x / 1000 * region.screenWidth).toFixed(3)} × ${(mpp.y / 1000 * region.screenHeight).toFixed(3)} mm`;
                    mmEl.classList.remove('hidden');
                }
                calculated_mm = true;
                this._mpp = mpp;

                if(ctx){
                    ctx.textContent = `Region ${bw}×${bh} px (${(mpp.x / 1000 * region.screenWidth).toFixed(2)}×${(mpp.y / 1000 * region.screenHeight).toFixed(2)} mm)`;
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

        const select = this.dialog.querySelector('.select-output-size-result');
        const baseW = region.screenWidth;
        const baseH = region.screenHeight;
        this._lastBasePxForOutput = { baseW, baseH };
        this._populateOutputSelect(select, baseW, baseH);
        this._applyOutputUISelection('result');
        if(this._includeScalebar){
            this._maybeApplySmartScalebarDefaults();
        }
        this._syncScalebarUI();
    }

    /**
     * Scale the current region's viewportRect proportionally based on new
     * screen-axis pixel dimensions, keeping the center and rotation fixed.
     * @param {number} newScreenW
     * @param {number} newScreenH
     */
    _resizeRegion(newScreenW, newScreenH){
        if(!this._region) return;
        const r = this._region;
        const scaleX = newScreenW / r.screenWidth;
        const scaleY = newScreenH / r.screenHeight;
        const vr = r.viewportRect;
        const center = vr.getCenter();
        const nextVR = new OpenSeadragon.Rect(
            center.x - (vr.width * scaleX) / 2,
            center.y - (vr.height * scaleY) / 2,
            vr.width * scaleX,
            vr.height * scaleY,
            vr.degrees
        );
        const viewerRect = this.viewer.viewport.viewportToViewerElementRectangle(nextVR);
        const region = this._viewerElementRectToRegion(viewerRect);
        this._setRegion(region);
    }

    _updateROI(){
        if(!this._region) return;
        const baseWIn = Number(this.dialog.querySelector('.region-width').value);
        const baseHIn = Number(this.dialog.querySelector('.region-height').value);
        let nextW = Math.max(1, Math.round(baseWIn));
        let nextH = Math.max(1, Math.round(baseHIn));

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

        this._resizeRegion(nextW, nextH);
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

    _buildRenderContext({ w, h, viewportRect }){
        const ti = this._resolveActiveTiledImageOrThrow();
        const ts = ti.source || this.viewer.tileSources[this.viewer.currentPage()];
        const rotation = this.viewer.viewport.getRotation(true);
        return { w, h, viewportRect, viewer: this.viewer, tiledImage: ti, tileSource: ts, rotation };
    }

    async _createScreenshot(data){
        const { w, h, viewportRect, scaleFactor } = data;
        const ctx = this._buildRenderContext({ w, h, viewportRect });
        const signature = computeRenderSignature({ w, h, viewportRect, rotation: ctx.rotation, tileSource: ctx.tileSource });

        if(!this._baseScreenshot || this._baseScreenshot.signature !== signature){
            const base = await renderBaseScreenshot({
                ...ctx,
                onProgress: (loaded, total) => this._setProgress(loaded, total),
            });
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

        let finalBlob;
        if(this._includeScalebar && this._mpp){
            finalBlob = await composeScreenshotWithScalebar({
                baseBlob: this._baseScreenshot.blob,
                pixelRatio: this._baseScreenshot.pixelRatio,
                scaleFactor,
                scalebar: {
                    include: true,
                    widthMm: this._scalebarWidth,
                    heightPx: this._scalebarHeight,
                    mppX: this._mpp.x,
                    label: this._scalebarShowLabel ? this._scalebarLabelFit({ scaleFactor }) : null,
                },
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

export {ScreenshotOverlay, ScreenshotTool};



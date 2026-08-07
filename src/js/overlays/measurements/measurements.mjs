/**
 * Unified Measurements overlay: one toolbar button + under-button dialog composing
 * ScalebarOverlay (viewer chrome) and/or RulerOverlay (image measurements) engines.
 *
 * Panel open/close is activate/deactivate. Scalebar visibility is independent.
 */

import { PaperOverlay } from '../../paper-overlay.mjs';
import { mppFromActiveViewerImage } from '../../utils/mpp.mjs';
import { makeFaIcon } from '../../utils/faIcon.mjs';
import { ViewerOverlayBase } from '../base.mjs';
import { RulerOverlay } from '../ruler/ruler.mjs';
import { ScalebarOverlay } from '../scalebar/scalebar.mjs';
import {
    applyMeasurementsDialogFeatures,
    createMeasurementsDialogElement,
    ensureMeasurementsDialogStyles,
    syncMeasurementsDialogSteps,
} from './measurements-dialog.mjs';
import {
    loadMeasurementsSettings,
    normalizeMeasurementsSettings,
    saveMeasurementsSettings,
} from './measurements-settings.mjs';

/**
 * @param {Object} [input]
 * @returns {{ scalebar: boolean, ruler: boolean }}
 */
function normalizeFeatures(input) {
    const scalebar = input?.scalebar !== false;
    const ruler = input?.ruler !== false;
    if (!scalebar && !ruler) return { scalebar: true, ruler: true };
    return { scalebar, ruler };
}

/**
 * @class
 * @memberof OSDPaperjsAnnotation
 */
class MeasurementsOverlay extends ViewerOverlayBase {
    static get label() { return 'Measurements'; }
    static get faIconClass() { return 'fa-ruler'; }

    /**
     * @param {OpenSeadragon.Viewer} viewer
     * @param {Object} [opts]
     * @param {boolean} [opts.registerWithConfig=true]
     * @param {boolean} [opts.showButton=true]
     * @param {{ scalebar?: boolean, ruler?: boolean }} [opts.features] Default both; if both false, both enabled
     * @param {'showing'} [opts.scalebarStartIn] Default-on scalebar chrome without opening the panel
     */
    constructor(viewer, opts = {}) {
        super(viewer, opts);
        this._destroyed = false;
        this._settingsExpanded = false;
        this._measurementsSettings = loadMeasurementsSettings();
        /** @type {'closed'|'openIdle'|'openMeasuring'} */
        this._panelState = 'closed';
        this._saveMeasurementsSettingsTimeout = null;
        this._features = normalizeFeatures(opts.features);

        // Thin overlay solely for the shared toolbar button.
        this.overlay = new PaperOverlay(viewer, { overlayType: 'viewer' });
        this.overlay.setPointerEventsEnabled(false);

        const host = {
            isPanelOpen: () => this._panelState !== 'closed',
            openPanel: (o) => this.openPanel(o),
            closePanel: () => this.closePanel(),
            onScalebarVisibilityChange: () => this._syncScalebarToggle(),
            onRulerStateChange: (state) => this._onRulerStateChange(state),
            onRulerCountChange: () => this._syncClearEnabled(),
        };

        this.scalebar = this._features.scalebar
            ? new ScalebarOverlay(viewer, {
                registerWithConfig: false,
                host,
                startIn: opts.scalebarStartIn === 'showing' ? 'showing' : undefined,
            })
            : null;

        this.ruler = this._features.ruler
            ? new RulerOverlay(viewer, {
                registerWithConfig: false,
                host,
            })
            : null;

        if (this.ruler) {
            const unit = this.scalebar?.getSettings?.().unit || 'mm';
            this.ruler.setDisplayUnit(unit);
            this.ruler.setDecimals(this._measurementsSettings.decimals);
        }

        this.button = this.overlay.addViewerButton({
            faIconClass: 'fa-ruler',
            tooltip: 'Measurements',
            onClick: () => {
                if (this._panelState === 'closed') this.openPanel();
                else this.closePanel();
            },
        });
        this.button.element.querySelector('svg.icon')?.style.setProperty('width', '1em');

        this._onEscKey = (ev) => this._handleEscape(ev);
        this._onReposition = () => this._positionDialog();

        this._makeDialog();

        document.addEventListener('keydown', this._onEscKey);
        window.addEventListener('resize', this._onReposition);
        this.viewer.addHandler?.('resize', this._onReposition);
        this.viewer.addHandler?.('animation', this._onReposition);
        this.viewer.addHandler?.('animation-finish', this._onReposition);

        this.viewer.addOnceHandler('destroy', () => {
            this.destroy();
        });

        this._autoRegister();
    }

    /**
     * ConfigurationWidget / toolbar: open the measurements panel.
     */
    activate() {
        this.openPanel();
    }

    /**
     * Close the panel; scalebar visibility unchanged.
     */
    deactivate() {
        this.closePanel();
    }

    /**
     * @param {Object} [opts]
     * @param {boolean} [opts.expandSettings]
     */
    openPanel(opts = {}) {
        if (this._destroyed) return;
        if (opts.expandSettings) this._setSettingsExpanded(true);

        this._setActive(true);
        if (this.ruler && !this.ruler._active) this.ruler.activate();

        const measuring = !!this.ruler?.isMeasuring?.();
        this._panelState = measuring ? 'openMeasuring' : 'openIdle';
        this._syncDialogChrome();
        this.dialog?.classList.remove('hidden');
        this._positionDialog();
    }

    closePanel() {
        if (this._destroyed) return;
        if (this.ruler?._active) {
            this.ruler.deactivate();
        }
        this._panelState = 'closed';
        this.dialog?.classList.add('hidden');
        this._setActive(false);
    }

    _onRulerStateChange(state) {
        if (this._panelState === 'closed') return;
        this._panelState = state === 'measuring' ? 'openMeasuring' : 'openIdle';
        this._syncDialogChrome();
    }

    _handleEscape(ev) {
        if (ev.key !== 'Escape' || this._destroyed || this._panelState === 'closed') return;
        if (this._panelState === 'openMeasuring' && this.ruler) {
            ev.preventDefault();
            ev.stopPropagation();
            this.ruler.finishMeasuring();
            this._panelState = 'openIdle';
            this._syncDialogChrome();
            return;
        }
        ev.preventDefault();
        ev.stopPropagation();
        this.closePanel();
    }

    _makeDialog() {
        ensureMeasurementsDialogStyles();
        const el = createMeasurementsDialogElement();
        applyMeasurementsDialogFeatures(el, this._features);
        document.body.appendChild(el);
        this.dialog = el;

        const gearBtn = el.querySelector('.mo-settings-toggle');
        if (gearBtn && !gearBtn.querySelector('svg')) {
            gearBtn.appendChild(makeFaIcon('fa-gear'));
        }

        el.querySelector('.mo-new')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.ruler?.startNew();
            this._panelState = 'openMeasuring';
            this._syncDialogChrome();
        });
        el.querySelector('.mo-cancel')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.ruler?.finishMeasuring();
            this._panelState = 'openIdle';
            this._syncDialogChrome();
        });
        el.querySelector('.mo-done')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.ruler?.finishMeasuring();
            this._panelState = 'openIdle';
            this._syncDialogChrome();
        });
        el.querySelector('.mo-clear')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (this.ruler?.isMeasuring()) this.ruler.finishMeasuring();
            this.ruler?.clearAllViewerRulers();
            this._panelState = 'openIdle';
            this._syncDialogChrome();
        });
        el.querySelector('.mo-close')?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.closePanel();
        });

        const toggle = el.querySelector('.mo-scalebar-visible');
        toggle?.addEventListener('change', () => {
            this.scalebar?.setVisible(!!toggle.checked);
        });

        gearBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._setSettingsExpanded(!this._settingsExpanded);
        });

        const onScalebarChromeChange = () => {
            const unit = el.querySelector('.mo-unit-select')?.value;
            this.scalebar?.applySettings({
                heightPx: el.querySelector('.mo-height')?.value,
                fontPx: el.querySelector('.mo-font')?.value,
                unit,
            });
            this.ruler?.setDisplayUnit(unit);
            this._syncSettingsFields();
        };
        const onDecimalsChange = () => {
            const next = normalizeMeasurementsSettings({
                decimals: el.querySelector('.mo-decimals')?.value,
            }, this._measurementsSettings);
            this._measurementsSettings = next;
            this.ruler?.setDecimals(next.decimals);
            this._scheduleSaveMeasurementsSettings();
            this._syncSettingsFields();
        };
        el.querySelector('.mo-height')?.addEventListener('input', onScalebarChromeChange);
        el.querySelector('.mo-height')?.addEventListener('change', onScalebarChromeChange);
        el.querySelector('.mo-font')?.addEventListener('input', onScalebarChromeChange);
        el.querySelector('.mo-font')?.addEventListener('change', onScalebarChromeChange);
        el.querySelector('.mo-unit-select')?.addEventListener('change', onScalebarChromeChange);
        el.querySelector('.mo-decimals')?.addEventListener('input', onDecimalsChange);
        el.querySelector('.mo-decimals')?.addEventListener('change', onDecimalsChange);

        el.addEventListener('mousemove', (ev) => ev.stopPropagation());
        el.classList.add('hidden');
        this._syncScalebarToggle();
        this._syncSettingsFields();
        this._setSettingsExpanded(false);
    }

    _setSettingsExpanded(expanded) {
        this._settingsExpanded = !!expanded;
        const panel = this.dialog?.querySelector('.mo-settings');
        const btn = this.dialog?.querySelector('.mo-settings-toggle');
        panel?.classList.toggle('hidden', !this._settingsExpanded);
        if (btn) btn.setAttribute('aria-expanded', this._settingsExpanded ? 'true' : 'false');
        if (this._settingsExpanded) this._syncSettingsFields();
        this._positionDialog();
    }

    _syncDialogChrome() {
        if (!this.dialog) return;
        const kind = this.ruler?.getSessionKind?.() || 'idle';
        // Single primary slot: New | Cancel (creating) | Done (modifying)
        this.dialog.querySelector('.mo-new')?.classList.toggle('hidden', kind !== 'idle');
        this.dialog.querySelector('.mo-cancel')?.classList.toggle('hidden', kind !== 'creating');
        this.dialog.querySelector('.mo-done')?.classList.toggle('hidden', kind !== 'modifying');
        this._syncClearEnabled();
        this._syncScalebarToggle();
        this._syncMppWarning();
    }

    _syncClearEnabled() {
        const clearBtn = this.dialog?.querySelector('.mo-clear');
        if (!clearBtn) return;
        clearBtn.disabled = !this.ruler || this.ruler.countViewerRulers() === 0;
    }

    _syncScalebarToggle() {
        const toggle = this.dialog?.querySelector('.mo-scalebar-visible');
        if (!toggle || !this.scalebar) return;
        toggle.checked = this.scalebar.isVisible();
    }

    _syncSettingsFields() {
        if (!this.dialog) return;
        const heightInput = this.dialog.querySelector('.mo-height');
        const fontInput = this.dialog.querySelector('.mo-font');
        const unitSelect = this.dialog.querySelector('.mo-unit-select');
        const decimalsInput = this.dialog.querySelector('.mo-decimals');
        if (this.scalebar) {
            const s = this.scalebar.getSettings();
            if (heightInput) heightInput.value = String(s.heightPx);
            if (fontInput) fontInput.value = String(s.fontPx);
            if (unitSelect) unitSelect.value = s.unit === 'um' ? 'um' : 'mm';
        } else if (unitSelect && this.ruler) {
            unitSelect.value = this.ruler.getDisplayUnit() === 'um' ? 'um' : 'mm';
        }
        if (decimalsInput && this.ruler) {
            decimalsInput.value = String(this.ruler.getDecimals());
        }
        syncMeasurementsDialogSteps(this.dialog);
        this._syncMppWarning();
    }

    _scheduleSaveMeasurementsSettings() {
        if (this._saveMeasurementsSettingsTimeout) clearTimeout(this._saveMeasurementsSettingsTimeout);
        this._saveMeasurementsSettingsTimeout = setTimeout(() => {
            this._saveMeasurementsSettingsTimeout = null;
            saveMeasurementsSettings(this._measurementsSettings);
        }, 200);
    }

    _syncMppWarning() {
        const warn = this.dialog?.querySelector('.mo-mpp-warning');
        const unitSelect = this.dialog?.querySelector('.mo-unit-select');
        const hasMpp = Boolean(mppFromActiveViewerImage(this.viewer));
        if (warn) warn.classList.toggle('hidden', hasMpp);
        if (unitSelect) unitSelect.disabled = !hasMpp;
    }

    _positionDialog() {
        if (!this.dialog || this.dialog.classList.contains('hidden')) return;
        const btnEl = this.button?.element;
        if (!btnEl) return;
        const rect = btnEl.getBoundingClientRect();
        const gap = 6;
        this.dialog.style.left = `${Math.max(8, rect.left)}px`;
        this.dialog.style.top = `${rect.bottom + gap}px`;

        const dr = this.dialog.getBoundingClientRect();
        let left = dr.left;
        if (left + dr.width > window.innerWidth - 8) {
            left = window.innerWidth - dr.width - 8;
        }
        if (left < 8) left = 8;
        this.dialog.style.left = `${left}px`;
    }

    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;

        if (this._saveMeasurementsSettingsTimeout) {
            clearTimeout(this._saveMeasurementsSettingsTimeout);
            this._saveMeasurementsSettingsTimeout = null;
        }

        document.removeEventListener('keydown', this._onEscKey);
        window.removeEventListener('resize', this._onReposition);
        this.viewer.removeHandler?.('resize', this._onReposition);
        this.viewer.removeHandler?.('animation', this._onReposition);
        this.viewer.removeHandler?.('animation-finish', this._onReposition);

        this.dialog?.remove();
        this.dialog = null;

        try { this.ruler?.destroy?.(); } catch { /* ignore */ }
        try { this.scalebar?.destroy?.(); } catch { /* ignore */ }
        try { this.overlay?.destroy?.(); } catch { /* ignore */ }

        this.ruler = null;
        this.scalebar = null;
        super.destroy();
    }
}

export { MeasurementsOverlay };

import { ToolBase } from '../../papertools/base.mjs';
import { paper } from '../../paperjs.mjs';

/**
 * Paper.js tool for interactive screenshot region selection.
 * Supports free-form rectangle dragging and fixed-size placement modes.
 * Broadcasts 'region-selected' events when a region is chosen.
 *
 * @class
 * @extends ToolBase
 */
class ScreenshotTool extends ToolBase{

    constructor(paperScope, overlay){
        super(paperScope);
        this._overlay = overlay;
        this._ps = paperScope;

        this._createVisualItems();

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

        this._wireMouseHandlers();
    }

    _createVisualItems(){
        this.compoundPath = new paper.CompoundPath({children:[],fillRule:'evenodd'});
        this.compoundPath.visible = false;
        this.compoundPath.fillColor = 'black';
        this.compoundPath.opacity = 0.3;
        this.project.toolLayer.addChild(this.compoundPath);

        this.crosshairTool = new paper.Group();
        this._hLine1 = new paper.Path({segments:[new paper.Point(0,0),new paper.Point(0,0)],strokeScaling:false,strokeWidth:1,strokeColor:'black'});
        this._hLine2 = new paper.Path({segments:[new paper.Point(0,0),new paper.Point(0,0)],strokeScaling:false,strokeWidth:1,strokeColor:'white',dashArray:[6,6]});
        this._vLine1 = new paper.Path({segments:[new paper.Point(0,0),new paper.Point(0,0)],strokeScaling:false,strokeWidth:1,strokeColor:'black'});
        this._vLine2 = new paper.Path({segments:[new paper.Point(0,0),new paper.Point(0,0)],strokeScaling:false,strokeWidth:1,strokeColor:'white',dashArray:[6,6]});
        this.crosshairTool.addChildren([this._hLine1, this._hLine2, this._vLine1, this._vLine2]);
        this.project.toolLayer.addChild(this.crosshairTool);
        this.crosshairTool.visible = false;

        this.fixedPreview = new paper.Path.Rectangle(new paper.Rectangle(0,0,1,1));
        this.fixedPreview.visible = false;
        this.fixedPreview.strokeColor = 'yellow';
        this.fixedPreview.strokeWidth = 2;
        this.fixedPreview.fillColor = null;
        this.fixedPreview.dashArray = [6, 4];
        this.project.toolLayer.addChild(this.fixedPreview);
    }

    _wireMouseHandlers(){
        this.tool.onMouseDown = (ev) => {
            if(this._mode === 'freeSelect'){
                this.crosshairTool.visible = false;
                this.fixedPreview.visible = false;
                this.compoundPath.visible = true;
                this.compoundPath.removeChildren();
                this.compoundPath.addChild(new paper.Path.Rectangle(this._ps.view.bounds));
                return;
            }
            if(this._mode === 'fixedPlace'){
                return;
            }
        };

        this.tool.onMouseDrag = (ev) => {
            if(this._mode !== 'freeSelect') return;
            this.compoundPath.removeChildren(1);
            let point = this.getPoint(ev);
            this.compoundPath.addChild(new paper.Path.Rectangle(ev.downPoint, point));
        };

        this.tool.onMouseMove = (ev) => {
            if(this._mode === 'freeSelect'){
                this.crosshairTool.visible = true;
                this.fixedPreview.visible = false;
                this._setCursorPosition(ev.point);
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

        const overlay = this._overlay;
        this.tool.extensions.onKeyDown = function(ev){
            if(ev.key === 'escape'){
                overlay.deactivate();
            }
        };

        this.extensions.onActivate = () => {
            this._active = true;
            this._syncVisibilityForMode();
        };

        this.extensions.onDeactivate = () => {
            this._active = false;
            this.crosshairTool.visible = false;
            this.compoundPath.visible = false;
            this.fixedPreview.visible = false;
        };
    }

    _setCursorPosition(point){
        const view = this.tool.view;
        const pt = view.projectToView(point);
        const left = view.viewToProject(new paper.Point(0, pt.y));
        const right = view.viewToProject(new paper.Point(view.viewSize.width, pt.y));
        const top = view.viewToProject(new paper.Point(pt.x, 0));
        const bottom = view.viewToProject(new paper.Point(pt.x, view.viewSize.height));
        this._hLine1.segments[0].point = left;
        this._hLine2.segments[0].point = left;
        this._hLine1.segments[1].point = right;
        this._hLine2.segments[1].point = right;
        this._vLine1.segments[0].point = top;
        this._vLine2.segments[0].point = top;
        this._vLine1.segments[1].point = bottom;
        this._vLine2.segments[1].point = bottom;
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

    setAspectHeight(h){ this._aspectHeight = h; }
    setAspectWidth(w){ this._aspectWidth = w; }
    setAspectLocked(l){ this._aspectLocked = l; }

    setFixedParams(params){
        this._fixedParams = { ...this._fixedParams, ...(params || {}) };
    }

    getPoint(ev){
        let point = ev.point;
        if(this._aspectLocked){
            let delta = ev.point.subtract(ev.downPoint);
            if(Math.abs(delta.x) > Math.abs(delta.y)){
                point.y = ev.downPoint.y + (delta.y < 0 ? -1 : 1) * Math.abs(delta.x) * this._aspectHeight / this._aspectWidth;
            } else {
                point.x = ev.downPoint.x + (delta.x < 0 ? -1 : 1) * Math.abs(delta.y) * this._aspectWidth / this._aspectHeight;
            }
        }
        return point;
    }

    _rectFromDrag(ev){
        const point = this.getPoint(ev);
        return new paper.Rectangle(ev.downPoint, point);
    }
}

export { ScreenshotTool };

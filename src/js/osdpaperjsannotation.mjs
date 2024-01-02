import { AnnotationToolkit } from './annotationtoolkit.mjs';
import { addCSS } from './addcss.mjs';
import { AnnotationToolbar } from './annotationtoolbar.mjs';
import { FeatureCollectionUI } from './featurecollectionui.mjs';
import { FeatureUI } from './featureui.mjs';
import { FileDialog } from './filedialog.mjs';
import { LayerUI } from './layerui.mjs';
import { PaperOffset } from './paper-offset.mjs';
import { PaperOverlay } from './paper-overlay.mjs';
import { RotationControlOverlay } from './rotationcontrol.mjs';
import { RotationControlTool } from './rotationcontrol.mjs';
import { AnnotationUITool } from './papertools/annotationUITool.mjs';
import { ToolBase } from './papertools/base.mjs';
import { BrushTool } from './papertools/brush.mjs';
import { DefaultTool } from './papertools/default.mjs';
import { EllipseTool } from './papertools/ellipse.mjs';
import { LinestringTool } from './papertools/linestring.mjs';
import { PointTool } from './papertools/point.mjs';
import { PointTextTool } from './papertools/pointtext.mjs';
import { PolygonTool } from './papertools/polygon.mjs';
import { RasterTool } from './papertools/raster.mjs';
import { RectangleTool } from './papertools/rectangle.mjs';
import { SelectTool } from './papertools/select.mjs';
import { StyleTool } from './papertools/style.mjs';
import { TransformTool } from './papertools/transform.mjs';
import { WandTool } from './papertools/wand.mjs';

/**
 *
 * This is a namespace that contains documentation elements belonging to OSDPaperJSAnnotation
 *
 * @namespace OSDPaperjsAnnotation
 */

export const OSDPaperjsAnnotation = {
    AnnotationToolkit: AnnotationToolkit,
    AnnotationToolbar: AnnotationToolbar,
    addCSS: addCSS,
    FeatureCollectionUI :FeatureCollectionUI,
    FeatureUI:FeatureUI,
    FileDialog:FileDialog,
    LayerUI:LayerUI,
    PaperOffset: PaperOffset,
    PaperOverlay: PaperOverlay,
    RotationControlOverlay: RotationControlOverlay,
    RotationControlTool: RotationControlTool,
    AnnotationUITool: AnnotationUITool,
    ToolBase:ToolBase,
    BrushTool: BrushTool,
    DefaultTool:DefaultTool,
    EllipseTool:EllipseTool,
    LinestringTool:LinestringTool,
    PointTool:PointTool,
    PointTextTool:PointTextTool,
    PolygonTool:PolygonTool,
    RasterTool:RasterTool,
    RectangleTool:RectangleTool,
    SelectTool:SelectTool,
    StyleTool:StyleTool,
    TransformTool:TransformTool,
    WandTool:WandTool

}


// export various classes and functions so they can be imported by name
export {
    AnnotationToolkit,
    AnnotationToolbar,
    addCSS,
    FeatureCollectionUI,
    FeatureUI,
    FileDialog,
    LayerUI,
    PaperOffset,
    PaperOverlay,
    RotationControlOverlay,
    RotationControlTool,
    AnnotationUITool,
    ToolBase,
    BrushTool,
    DefaultTool,
    EllipseTool,
    LinestringTool,
    PointTool,
    PointTextTool,
    PolygonTool,
    RasterTool,
    RectangleTool,
    SelectTool,
    StyleTool,
    TransformTool,
    WandTool

}

class AnnotationItemPlaceholder{
    constructor(instructions){
        this.paperItem = new paper.Path();
        this.paperItem.style = this.paperItem.instructions = instructions;
        this.paperItem.isGeoJSONFeature = true;
        this.paperItem.toGeoJSONGeometry = function(){
            return null;
        }
        
        return this.paperItem;
        
    }
    
    
}

export {AnnotationItemPlaceholder}

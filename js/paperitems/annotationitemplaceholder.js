
class AnnotationItemPlaceholder{
    constructor(instructions){
        this.paperItem = new paper.Path();
        this.paperItem.style = this.paperItem.instructions = instructions;
        this.paperItem.isAnnotationFeature = true;
        
        return this.paperItem;
        
    }
    
}

export {AnnotationItemPlaceholder}

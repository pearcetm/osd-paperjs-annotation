
class AnnotationItemPlaceholder{
    constructor(instructions){
        this.paperItem = new paper.Path();
        this.paperItem.instructions = instructions;
        this.paperItem.isAnnotationFeature = true;
        this.paperItem.style = instructions;
        
        return this.paperItem;
        
    }
    
}

export {AnnotationItemPlaceholder}

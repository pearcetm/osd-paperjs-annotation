
class AnnotationItemPlaceholder{
    constructor(instructions){
        this.paperItem = new paper.Path();
        this.paperItem.instructions = instructions;
        this.paperItem.isAnnotationFeature = true;
        this.paperItem.style = instructions;
        // let self=this;
        // this.paperItem.replace = function (newItem){
        //     newItem._callbacks = self.paperItem._callbacks; 
        //     newItem.style = self.paperItem.style;
        //     // newItem.toGeoJSON = self.paperItem.toGeoJSON || newItem.toGeoJSON;
        //     // newItem.replace = self.paperItem.replace;
            
        //     //replace in the paper hierarchy
        //     self.paperItem.replaceWith(newItem);
        //     console.log('replacing',self.paperItem,newItem)
        //     self.paperItem.emit('item-replaced',{item:newItem});
        //     // self.paperItem.remove();
        //     self.paperItem.project.view.update();
        //     // self.paperItem = newItem;
        //     newItem.updateFillOpacity();
        //     newItem.project.emit('item-replaced',{item:newItem});
        //     return newItem;
        // }
        return this.paperItem;
        
    }
    
}

export {AnnotationItemPlaceholder}

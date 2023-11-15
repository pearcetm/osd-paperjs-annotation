# osd-paperjs-annotation - Annotation tools for Openseadragon built with Paper.js

This project combines the [OpenSeadragon](https://openseadragon.github.io/) zoomable image viewer with [PaperJS](http://paperjs.org/)-based annotations drawn into a synced zoomable overlay.

## Quick start guide:

To get started with a basic overlay, only a couple lines of code are needed.

```
// import the PaperOverlay object. You need to be using a JavaScript module.
import { PaperOverlay } from './src/js/paper-overlay.mjs';

// get the first TiledImage. This assumes you have a variable called 'viewer'
let tiledImage = viewer.world.getItemAt(0);

// add a paper.js item you've previously created to the overlay
tiledImage.addPaperItem(myPaperItem);

// you can modify the paper.js item using normal paper.js functionality
myPaperItem.fillColor = 'blue';

// A special `rescale` property can be used to automatically adjust properties during zooming
myPaperItem.rescale = {strokeWidth: 2}

```

## API Documentation:

See the [JSDoc documentation pages](https://pearcetm.github.io/osd-paperjs-annotation/docs/OSDPaperjsAnnotation.html) for information about how to use the library.

## Demo pages:

See the [Demo pages](https://pearcetm.github.io/osd-paperjs-annotation/demo/) to try out the functionality.

### Digital Slide Archive Annotator
View and annotate slides from any [Digital Slide Archive instance](https://pearcetm.github.io/osd-paperjs-annotation/demo/dsa/app.html). Enter the base URL for the DSA in the box and press the "Open DSA" button. Some archives may have publically available slides to view, but to save changes you will need to be logged in.

### YOLO Reviewer for DSA
[Customized version](https://pearcetm.github.io/osd-paperjs-annotation/demo/yoloreviewer/app.html) of the Digital Slide Archive Annotator that adds tools specifically for reviewing and modifying bounding boxes for AI training. 

## To do

- BlankCanvasTileSource for OpenSeadragon
-- Allow an empty/blank image to be used as a drawing background, rather than an actual image

## Necessary packages -temp
One time guide for documentation task runner:
Goto directory in command prompt
Npm install -g jsdoc
npm install --g gulp gulp-babel gulp-jsdoc3 chokidar webpack-stream del path url
npm install -g webpack webpack-cli webpack-stream terser-webpack-plugin path url

## Gulp Directions
Open command prompt and goto build directory

Gulp Updater : updates bundle.js and does documentation whenever you save a file
Gulp DocUpdater: only updates documentation whenever you save a file 
Gulp PackUpdater: only updates bundle.js whenever you save a file
Gulp webpack: updates bundle.js
Gulp doc: updates documentation
Gulp Demo: Launches the rotional control demo on a local html address on your default browser


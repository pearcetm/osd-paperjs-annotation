# osd-paperjs-annotation - Annotation tools for Openseadragon built with Paper.js

This project combines the [OpenSeadragon](https://openseadragon.github.io/) zoomable image viewer with [PaperJS](http://paperjs.org/)-based annotations drawn into a synced zoomable overlay.

## API Documentation:

See the [JSDoc documentation pages](https://pearcetm.github.io/osd-paperjs-annotation/docs/OSDPaperjsAnnotation.html) for information about how to use the library.

## Demo pages:

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



(function( $ ){
    /**
     * @class GeoTIFFTileSource
     * @classdesc The GeoTIFFTileSource uses a the GeoTIFF.js library to serve tiles from local file or remote URL. Requires GeoTIFF.js.
     *
     * @memberof OpenSeadragon
     * @extends OpenSeadragon.TileSource
     * @param {Array} levels An array of level descriptions
     * 
     * 
     * @property {Number} dimensions
     * @property {Number} tileSize
     * @property {Array}  levels
     */
    $.GeoTIFFTileSource=function( input ){
        let self=this;
        monkeypatch();
        this.pool = new GeoTIFF.Pool();
        this.promises={
            tiff: input instanceof File ? GeoTIFF.fromBlob(input) : GeoTIFF.fromUrl(input),
            imageCount:DeferredPromise(),
            imageHeaders:DeferredPromise(),
            setupComplete:DeferredPromise(),
        }
        this.promises.tiff.then(tiff=>{
            console.log('Tiff Info',tiff)
            self.tiff = tiff;
            return tiff.getImageCount();
        }).then(count=>{
            
            console.log(''+count+' tiff pages',self.tiff);
            self.imageCount = count;
            let promises=[...Array(count).keys()].map(index=>self.tiff.getImage(index));
            self.promises.imageCount.resolve(count);
            return Promise.all(promises);
        }).then(images=>{
            console.log('Tiff images',images)
            self.imageHeaders = images;
            self.promises.imageHeaders.resolve(images);

            
            let options = this.makeOptionsObject(images);
            this.levels = options.levels;

            this.promises.setupComplete.resolve();
        })
    }
    $.extend( $.GeoTIFFTileSource.prototype, $.TileSource.prototype, /** @lends OpenSeadragon.GeoTIFFTileSource.prototype */{
        /**
         * Return the tileWidth for a given level.
         * @function
         * @param {Number} level
         */
         getTileWidth: function (level) {
            if (this.levels.length > level) {
                return this.levels[level].tileWidth;
            }
        },
    
        /**
         * Return the tileHeight for a given level.
         * @function
         * @param {Number} level
         */
        getTileHeight: function (level) {
            if (this.levels.length > level) {
                return this.levels[level].tileHeight;
            }
        },
    
        /**
         * @function
         * @param {Number} level
         */
        getLevelScale: function ( level ) {
            // console.log('getLevelScale')
            var levelScale = NaN;
            if ( this.levels.length > 0 && level >= this.minLevel && level <= this.maxLevel ) {
                levelScale =
                    this.levels[ level ].width /
                    this.levels[ this.maxLevel ].width;
            }
            return levelScale;
        },
    
        makeOptionsObject: function(images){
            let options={}
            if(images[0].fileDirectory.ImageDescription && images[0].fileDirectory.ImageDescription.startsWith('Aperio')){
                options = AperioOptions(images);
            }
            else if(images[0].fileDirectory.Make && images[0].fileDirectory.Make.startsWith('Hamamatsu')){
                console.log('Hamamatsu file images:',images)
            }
            if(options.levels){
                $.TileSource.apply( this, [ options ] );
                return options;
            }
            else{
                console.error('Bad file type: levels were not specified')
            }
        },
        
        /**
         * Implement function here instead of as custom tile source in client code
         * @function
         * @param {Number} level
         * @param {Number} x
         * @param {Number} y
         * @throws {Error}
         */
        getTileUrl: function ( level, x, y ) {
            // return dataURL from reading tile data from the GeoTIFF object as String object (for cache key) with attached promise 
            level = this.levels[level];
            let bbox = [x*level.tileWidth, y*level.tileHeight, x*level.tileWidth+level.tileWidth, y*level.tileHeight+level.tileHeight]
            let url = new String(`${level.level}/${x}_${y}`);
            let startTime = Date.now();
            // url.promise = ImageToDataUrl(level._tiffPage, bbox, this.pool,startTime);
            url.promise = level._tiffPage.getTileOrStrip(x,y,0,this.pool).then(d=>RGBToDataUrl(d.data, level.tileWidth, level.tileHeight,startTime))
            // url = `${level.level}/${x}_${y}`;
            return url;
        }
    })

    function AperioOptions(images){
        let options = {}
        options.levels = images.filter(image=>image.isTiled).map((image,level)=>{
            return {
                width:image.getWidth(),
                height:image.getHeight(),
                tileWidth:image.getTileWidth(),
                tileHeight:image.getTileHeight(),
                level:level,
                _tiffPage:image,
            }
            
        }).sort((a,b)=>a.width - b.width)
        
        options.width = options.levels[options.levels.length-1].width;
        options.height = options.levels[options.levels.length-1].height;
        $.extend( true, options, {
            width: options.width,
            height: options.height,
            tileOverlap: 0,//To do: is this always zero? If not, what field in the fileDirectory holds it?
            minLevel: 0,
            maxLevel: options.levels.length > 0 ? options.levels.length - 1 : 0
        } );
        return options;
    }

    function DeferredPromise(){
        let self=this;
        let promise=new Promise((resolve,reject)=>{
            self.resolve=resolve;
            self.reject=reject;
        })
        promise.resolve=self.resolve;
        promise.reject=self.reject;
        return promise;
    }
    
    // function ImageToDataUrl(image,bbox, decoderPool,startTime){
    //     let canvas = document.createElement('canvas');
    //     canvas.width = image.getTileWidth();
    //     canvas.height = image.getTileHeight();
    //     let ctx = canvas.getContext('2d');
    //     return image.readRasters({window:bbox, pool:decoderPool}).then(data=>{
    //         let arr = new Uint8ClampedArray(4*data[0].length);
    //         let i, a;
    //         for(i=0, a=0;i<data[0].length; i++, a+=4){
    //             arr[a]=data[0][i];
    //             arr[a+1]=data[1][i];
    //             arr[a+2]=data[2][i];
    //             arr[a+3]=255;
    //         }
    //         ctx.putImageData(new ImageData(arr,data.width,data.height), 0, 0);
    //         // console.log('Decoded tile',bbox)
    //         startTime && console.log('Resolved in (ms):', Date.now() - startTime)
        
    //         return canvas.toDataURL('image/jpeg',0.7);
    //     })
    // }
    function RGBToDataUrl(rgb, width, height,startTime){
        let canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        let ctx = canvas.getContext('2d');

        let arr = new Uint8ClampedArray(4*width*height);
        let data = new Uint8ClampedArray(rgb);
        let i, a;
        for(i=0, a=0;i<data.length; i+=3, a+=4){
            arr[a]=data[i];
            arr[a+1]=data[i+1];
            arr[a+2]=data[i+2];
            arr[a+3]=255;
        }
        ctx.putImageData(new ImageData(arr,width,height), 0, 0);

        // ctx.putImageData(imagedata, 0, 0);
        // console.log('Decoded tile')
        startTime && console.log('Resolved in (ms):', Date.now() - startTime)
        return canvas.toDataURL('image/jpeg',0.7);
    }

    function monkeypatch(){

        function ImageJob (options) {

            $.extend(true, this, {
                timeout: $.DEFAULT_SETTINGS.timeout,
                jobId: null
            }, options);
        
            /**
             * Image object which will contain downloaded image.
             * @member {Image} image
             * @memberof OpenSeadragon.ImageJob#
             */
            this.image = null;
        }
        
        ImageJob.prototype = {
            errorMsg: null,
        
            /**
             * Starts the image job.
             * @method
             */
            start: function(){
                var self = this;
                var selfAbort = this.abort;
        
                this.image = new Image();
        
                this.image.onload = function(){
                    self.finish(true);
                };
                this.image.onabort = this.image.onerror = function() {
                    self.errorMsg = "Image load aborted";
                    self.finish(false);
                };
        
                this.jobId = window.setTimeout(function(){
                    self.errorMsg = "Image load exceeded timeout (" + self.timeout + " ms)";
                    self.finish(false);
                }, this.timeout);
        
                // Load the tile with an AJAX request if the loadWithAjax option is
                // set. Otherwise load the image by setting the source proprety of the image object.
                if (this.loadWithAjax) {
                    this.request = $.makeAjaxRequest({
                        url: this.src,
                        withCredentials: this.ajaxWithCredentials,
                        headers: this.ajaxHeaders,
                        responseType: "arraybuffer",
                        postData: this.postData,
                        success: function(request) {
                            var blb;
                            // Make the raw data into a blob.
                            // BlobBuilder fallback adapted from
                            // http://stackoverflow.com/questions/15293694/blob-constructor-browser-compatibility
                            try {
                                blb = new window.Blob([request.response]);
                            } catch (e) {
                                var BlobBuilder = (
                                    window.BlobBuilder ||
                                    window.WebKitBlobBuilder ||
                                    window.MozBlobBuilder ||
                                    window.MSBlobBuilder
                                );
                                if (e.name === 'TypeError' && BlobBuilder) {
                                    var bb = new BlobBuilder();
                                    bb.append(request.response);
                                    blb = bb.getBlob();
                                }
                            }
                            // If the blob is empty for some reason consider the image load a failure.
                            if (blb.size === 0) {
                                self.errorMsg = "Empty image response.";
                                self.finish(false);
                            }
                            // Create a URL for the blob data and make it the source of the image object.
                            // This will still trigger Image.onload to indicate a successful tile load.
                            var url = (window.URL || window.webkitURL).createObjectURL(blb);
                            self.image.src = url;
                        },
                        error: function(request) {
                            self.errorMsg = "Image load aborted - XHR error: Ajax returned " + request.status;
                            self.finish(false);
                        }
                    });
        
                    // Provide a function to properly abort the request.
                    this.abort = function() {
                        self.request.abort();
        
                        // Call the existing abort function if available
                        if (typeof selfAbort === "function") {
                            selfAbort();
                        }
                    };
                } else {
                    if (this.crossOriginPolicy !== false) {
                        this.image.crossOrigin = this.crossOriginPolicy;
                    }
                    if(this.src.promise){
                        this.src.promise.then(src=>this.image.src=src);
                    }
                    else {
                        this.image.src = this.src;
                    }
                }
            },
        
            finish: function(successful) {
                this.image.onload = this.image.onerror = this.image.onabort = null;
                if (!successful) {
                    this.image = null;
                }
        
                if (this.jobId) {
                    window.clearTimeout(this.jobId);
                }
        
                this.callback(this);
            }
        
        };
        function completeJob(loader, job, callback) {
            var nextJob;
        
            loader.jobsInProgress--;
        
            if ((!loader.jobLimit || loader.jobsInProgress < loader.jobLimit) && loader.jobQueue.length > 0) {
                nextJob = loader.jobQueue.shift();
                nextJob.start();
                loader.jobsInProgress++;
            }
        
            callback(job.image, job.errorMsg, job.request);
        }
        OpenSeadragon.ImageLoader.prototype.addJob = function(options) {
            var _this = this,
                complete = function(job) {
                    completeJob(_this, job, options.callback);
                },
                jobOptions = {
                    src: options.src,
                    loadWithAjax: options.loadWithAjax,
                    ajaxHeaders: options.loadWithAjax ? options.ajaxHeaders : null,
                    crossOriginPolicy: options.crossOriginPolicy,
                    ajaxWithCredentials: options.ajaxWithCredentials,
                    postData: options.postData,
                    callback: complete,
                    abort: options.abort,
                    timeout: this.timeout
                },
                newJob = new ImageJob(jobOptions);
    
            if ( !this.jobLimit || this.jobsInProgress < this.jobLimit ) {
                newJob.start();
                this.jobsInProgress++;
            }
            else {
                this.jobQueue.push( newJob );
            }
        }
        OpenSeadragon.Tile.prototype._hasTransparencyChannel = function() {
            return false;
        }
    }

})(OpenSeadragon)



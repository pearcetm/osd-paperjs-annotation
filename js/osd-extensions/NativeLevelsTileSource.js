(function( $ ){

    /**
     * @class NativeLevelsTileSource
     * @classdesc The NativeLevelsTileSource allows specific levels of image pyramids to be loaded
     * into an OpenSeadragon Viewer instead of assuming that all powers of two are ok.
     * This allows image servers to avoid server-side conversion of images to non-native resolutions.
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
    $.NativeLevelsTileSource = function( input ) {
    
        let options,
            width,
            height;
    
        if( $.isArray( input ) ){
            options = {
                type: 'native-levels-image-pyramid',
                levels: input
            };
        }
        else{
            options = input
        }
    
        options.levels = options.levels.sort((a,b)=>a.width - b.width);//order from lowest to highest resolution
        
        width = options.levels[options.levels.length-1].width;
        height = options.levels[options.levels.length-1].height;
        $.extend( true, options, {
            width: width,
            height: height,
            tileOverlap: 0,
            minLevel: 0,
            maxLevel: options.levels.length > 0 ? options.levels.length - 1 : 0
        } );
    
        $.TileSource.apply( this, [ options ] );
    
        this.levels = options.levels;
    };
    
    $.extend( $.NativeLevelsTileSource.prototype, $.TileSource.prototype, /** @lends OpenSeadragon.NativeLevelsTileSource.prototype */{
        /**
         * Determine if the data imply the image service is supported by
         * this tile source.
         * @function
         * @param {Object|Array} data
         */
        supports: function( data ){
            return (
                data.type &&
                "native-levels-image-pyramid" === data.type
            ) || (
                data.documentElement &&
                "native-levels-image-pyramid" === data.documentElement.getAttribute('type')
            );
        },
    
    
        /**
         *
         * @function
         * @param {Object} configuration - the raw configuration
         * @return {Object} options - The array of levels
         */
        configure: function( configuration ){
            return configuration;
        },
    
        /**
         * Return the tileWidth for a given level.
         * @function
         * @param {Number} level
         */
        getTileWidth: function (level) {
            if (this.levels.length > level) {
                return this.levels[level].tileWidth;
            }
            return this._tileWidth;
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
            return this._tileHeight;
        },
    
        /**
         * @function
         * @param {Number} level
         */
        getLevelScale: function ( level ) {
            var levelScale = NaN;
            if ( this.levels.length > 0 && level >= this.minLevel && level <= this.maxLevel ) {
                levelScale =
                    this.levels[ level ].width /
                    this.levels[ this.maxLevel ].width;
            }
            return levelScale;
        },
    
        /**
         * @function
         * @param {Number} level
         */
        getNumTiles: function( level ) {
            return new $.Point(this.levels[level].rows,this.levels[level].columns)
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
            return `${this.baseurl}${this.levels[level].level}/${x}_${y}`;
        }
    } );
    
    
    
    }( OpenSeadragon ));
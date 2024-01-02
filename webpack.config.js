var webpack = require('webpack');

module.exports = {
    "stats": {
        "errorDetails": true,
        "children": true
    },
    output:{
        libraryTarget: 'umd'
    },
    "entry": './src/js/osdpaperjsannotation.mjs',
    "externals": {
        "openseadragon": {
            root: 'OpenSeadragon',
            commonjs2: 'openseadragon',
            commonjs: 'openseadragon',
            amd: 'openseadragon',
        },
        // "paper": {
        //     root: 'paper',
        //     commonjs2: 'paper',
        //     commonjs: 'paper',
        //     amd: 'paper',
        // },
    },
    devtool: 'source-map',
    plugins: [
        new webpack.ProvidePlugin({
          "$":"jquery",
          "jQuery":"jquery",
          "window.jQuery":"jquery"
        })
    ],
    // resolve: {
    //     alias: {
    //         'jquery-ui': 'jquery-ui-dist/jquery-ui.js'
    //     }
    // },
    module:{
        parser: {
            javascript : { importMeta: false }
        },
        rules: [
            {
                test: require.resolve("./src/js/osd-loader.mjs"),
                loader: "imports-loader",
                options: {
                    type: "module",
                    imports: "default openseadragon OpenSeadragon",
                },
            },
            {
                test: require.resolve("./src/js/paperjs.mjs"),
                loader: "imports-loader",
                options: {
                    type: "module",
                    imports: "default paper paper",
                },
            },
            {
                test: require.resolve("./src/js/addcss.mjs"),
                loader: "imports-loader",
                options: {
                    type: "module",
                    imports: "named ./importcss.mjs importedCSS",
                },
            },
            // {
            //     test: require.resolve("./src/js/addcss.mjs"),
            //     loader: "imports-loader",
            //     options: {
            //         type: "module",
            //         imports: "named browser-or-node isNode",
            //     },
            // },
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader']
            }
        ],
    }
}
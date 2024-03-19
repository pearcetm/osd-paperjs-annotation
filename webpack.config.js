let webpack = require('webpack');
let UnminifiedWebpackPlugin = require('unminified-webpack-plugin');
let path = require('path');

module.exports = {
    stats: {
        "errorDetails": true,
        "children": true
    },
    output:{
        libraryTarget: 'umd',
        // filename: '[name].min.js'
    },
    "entry": './src/js/osdpaperjsannotation.mjs',
    // entry: {
    //     full:'./src/js/osdpaperjsannotation.mjs',
    //     overlay:'./src/js/paper-overlay.mjs',
    //     annotationtoolkit:'./src/js/annotationtoolkit.mjs',
    // },
    plugins: [
        new UnminifiedWebpackPlugin()
    ],
    externals: {
        openseadragon: {
            root: 'OpenSeadragon',
            commonjs2: 'openseadragon',
            commonjs: 'openseadragon',
            amd: 'openseadragon',
        },
    },
    devtool: 'source-map',
    module:{
        parser: {
            javascript : { importMeta: false }
        },
        rules: [
            {
                exclude:[path.resolve(__dirname, 'demo')]
            },
            {
                exclude:[path.resolve(__dirname, 'docs')]
            },
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
                    imports: "default paper/dist/paper-core.min.js paper",
                },
            },
            {
                test: require.resolve("./src/js/utils/addcss.mjs"),
                loader: "imports-loader",
                options: {
                    type: "module",
                    imports: "named ../importcss.mjs importedCSS",
                },
            },
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader']
            },
            {
                test: /\.png$/,
                type: 'asset/resource'
            }
        ]
    }
}
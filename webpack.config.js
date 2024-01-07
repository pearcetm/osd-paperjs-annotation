let webpack = require('webpack');
let UnminifiedWebpackPlugin = require('unminified-webpack-plugin');

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
    plugins: [
        new webpack.ProvidePlugin({
          "$":"jquery",
          "jQuery":"jquery",
          "window.jQuery":"jquery"
        })
    ],
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
                    imports: "default paper/dist/paper-core.min.js paper",
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
            {
                test: require.resolve("./src/js/annotationui.mjs"),
                loader: "imports-loader",
                options: {
                    type: "module",
                    imports: [
                        "side-effects jquery-ui/ui/widgets/dialog.js",
                        "side-effects jquery-ui/ui/widgets/sortable.js"
                    ]
                },
            },
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader']
            }
        ],
    }
}
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
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader']
            }
        ],
    }
}
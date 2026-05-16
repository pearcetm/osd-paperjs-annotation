const prefixSelector = require('postcss-prefix-selector');

module.exports = {
    plugins: [
        prefixSelector({
            prefix: '.osd-paperjs-annotation',
            transform(prefix, selector, prefixedSelector) {
                if (selector === '.annotation-ui-noselect') {
                    return 'body.annotation-ui-noselect';
                }
                return prefixedSelector;
            },
        }),
    ],
};

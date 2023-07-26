/**
 * 
 * A regular expression pattern to check for in existing CSS links in the document, used to avoid duplicating CSS files. If the pattern is found in the document, the new link is not added. For consistency, the pattern is also checked against the url parameter to make sure it will exist in the document after adding the new link. If the pattern is not found in the url, an error is logged to the console and the file is not added
 * test
 * @memberof OSDPaperjsAnnotation
 * @param {string} url - The URL of the CSS file to add.
 * @param {string} [nameToCheck] - The name pattern to check in the URL. If provided,
 * @returns {void}
 */
function addCSS(url, nameToCheck){
    if(nameToCheck){
        let pattern=`\/${nameToCheck}\.(?:min\.)?css`;
        let urlMatchesPattern = url.match(pattern);

        if(!urlMatchesPattern){
            console.error(`addCSS error: pattern(${pattern}) not found in url (${url})`)
            return;
        }

        let found = Array.from(document.head.getElementsByTagName('link')).filter(link=>{
            // console.log(link.href,'testing against',pattern)
            return link.href.match(pattern)
        });

        if(found.length>0){
            // console.log('Not adding CSS - already found in document head')
            return;
        }

    }
    
    console.log('Adding css:',url);
    let link = document.createElement('link');
    link.rel='stylesheet';
    link.href=url;
    document.head.appendChild(link);
}

export {addCSS}
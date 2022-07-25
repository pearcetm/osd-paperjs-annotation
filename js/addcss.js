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
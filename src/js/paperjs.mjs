// let promise = new Promise(resolve=>{
//     if(!window.paper){
//         let script = document.createElement('script'); 
//         script.src = 'https://cdnjs.cloudflare.com/ajax/libs/paper.js/0.12.17/paper-full.min.js';
//         script.async = false;
//         script.addEventListener('load', () => {
//             resolve(window.paper);
//           });
//         document.head.appendChild(script);
//     } else {
//         resolve(window.paper);
//     }
    
// });

// await promise;
// let paper = window.paper;

// import paper from 'paper';

let _paper = paper;

export { _paper as paper };
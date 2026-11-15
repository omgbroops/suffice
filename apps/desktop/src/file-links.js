// Interpret explicit file links without resolving relative paths against the renderer URL.
export function fileLinkPath(href){
 if(typeof href!=='string'||!href||href.startsWith('#')||href.startsWith('//'))return null;
 let value=href;try{value=decodeURIComponent(value);}catch{}
 if(/^file:/i.test(value)){try{const url=new URL(value);value=(url.hostname&&url.hostname!=='localhost'?'//'+url.hostname:'')+decodeURIComponent(url.pathname);if(/^\/[a-z]:\//i.test(value))value=value.slice(1);}catch{return null;}}
 else if(/^[a-z][a-z0-9+.-]*:/i.test(value)&&!/^([a-z]:[\\/])/i.test(value))return null;
 return value.replace(/#(?:L)?\d+(?:-L?\d+)?$/,'').replace(/:\d+(?::\d+)?$/,'');
}

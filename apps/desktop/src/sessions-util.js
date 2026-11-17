export const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
export const base=p=>String(p||'').split('/').filter(Boolean).pop()||'/';
export const plural=(n,w)=>`${n} ${w}${n===1?'':'s'}`;
export const prompt=()=>document.querySelector('#prompt');

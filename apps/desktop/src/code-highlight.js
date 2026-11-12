import {codeToTokens,bundledLanguages} from 'shiki';
const aliases={js:'javascript',mjs:'javascript',cjs:'javascript',jsx:'jsx',ts:'typescript',mts:'typescript',cts:'typescript',tsx:'tsx',jsonl:'json',md:'markdown',yml:'yaml',sh:'bash',ps1:'powershell',py:'python',rs:'rust',cs:'csharp',h:'c',hpp:'cpp',htm:'html',env:'dotenv',gitignore:'ignore'};
export function codeLanguage(path=''){
 const name=path.split('/').pop().toLowerCase();
 if(name==='dockerfile')return 'dockerfile';
 const extension=name.split('.').pop(),language=aliases[extension]||extension;
 return language in bundledLanguages?language:'text';
}
export async function highlightLines(text,path){
 const result=await codeToTokens(text,{lang:codeLanguage(path),themes:{light:'github-light',dark:'github-dark'}});
 return result.tokens;
}
export function appendTokens(element,tokens){
 const fragment=document.createDocumentFragment();
 for(const token of tokens){const span=document.createElement('span');span.textContent=token.content;span.style.setProperty('--token-light',token.htmlStyle?.color||token.color||'inherit');span.style.setProperty('--token-dark',token.htmlStyle?.['--shiki-dark']||token.color||'inherit');span.className='syntax-token';fragment.append(span);}
 element.replaceChildren(fragment);
}
export async function colorCode(element,path){
 const source=element.textContent,tokens=await highlightLines(source,path);
 if(!element.isConnected||element.textContent!==source)return;
 appendTokens(element,tokens.flatMap((line,index)=>index?[{content:'\n'},...line]:line));
}

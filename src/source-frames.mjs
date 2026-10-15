// Lossless presentation only. Nested tool values, historical messages and source
// boundaries are unchanged. Frame lengths count JS UTF-16 units, not tokens.
import {isDeepStrictEqual} from 'node:util';
const HEADER='@source-json ',END='\n@end-source';
export function sourceObject(value){
 return value!==null&&typeof value==='object'&&!Array.isArray(value)&&typeof value.path==='string'&&typeof value.text==='string'&&value.text.isWellFormed()&&(
  Number.isInteger(value.totalLines)&&Number.isInteger(value.offset)&&Number.isInteger(value.omittedAfter)||
  Number.isInteger(value.symbolStart)&&Number.isInteger(value.symbolEnd)&&Number.isInteger(value.remaining));
}
export function encodeSource(value){
 if(!sourceObject(value))return null;
 const meta=Object.fromEntries(Object.entries(value).filter(([k])=>k!=='text'));
 return HEADER+value.text.length+' '+JSON.stringify(meta)+'\n'+value.text+END;
}
export function decodeSource(frame){
 const headerEnd=frame.indexOf('\n');if(headerEnd<0||!frame.startsWith(HEADER))throw new Error('Bad source frame');
 const header=frame.slice(HEADER.length,headerEnd),space=header.indexOf(' '),length=Number(header.slice(0,space));
 if(space<0||!Number.isSafeInteger(length)||length<0)throw new Error('Bad source length');
 const meta=JSON.parse(header.slice(space+1)),start=headerEnd+1,end=start+length;
 if(frame.slice(end)!==END)throw new Error('Bad source boundary');
 return {...meta,text:frame.slice(start,end)};
}
export function frameText(text){
 let output='',rows=[];
 const lines=text.split('\n');
 for(let index=0;index<lines.length;index++){
  const line=lines[index];let next=line;
  if(line.startsWith('{')&&line.endsWith('}')){
   let value;try{value=JSON.parse(line);}catch{}
   // Only canonical direct JSON prints. Noncanonical/partial/mixed output stays.
   if(value&&JSON.stringify(value)===line){const frame=encodeSource(value);
    if(frame&&frame.length<line.length){if(!isDeepStrictEqual(decodeSource(frame),value))throw new Error('Source round-trip mismatch');next=frame;rows.push({line:index,original:line,framed:frame,path:value.path,source:value.text});}
   }
  }
  output+=next+(index<lines.length-1?'\n':'');
 }
 return {text:output,rows};
}
export function frameContent(content){
 const rows=[];const output=content.map((block,index)=>{if(block.type!=='text')return block;const r=frameText(block.text);rows.push(...r.rows.map(row=>({...row,block:index})));return r.rows.length?{...block,text:r.text}:block;});
 return {content:output,rows};
}

export function readTranscriptJournal(source){
 const lines=source.split('\n'),entries=[];
 for(let index=0;index<lines.length;index++){
  const line=lines[index];if(!line.trim())continue;
  try{entries.push(JSON.parse(line));}
  catch{
   // A crash can interrupt the final append. Complete malformed records are corruption.
   if(index===lines.length-1&&!source.endsWith('\n'))break;
   throw new Error('Saved transcript contains invalid JSON at line '+(index+1));
  }
 }
 return entries;
}

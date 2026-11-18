export const SEVERITIES=['high','medium','low'];
const MAX_DIFF=120000,MAX_FINDINGS=30;
export function reviewPrompt(files){
 let budget=MAX_DIFF;const parts=[];
 for(const {path,text} of files){if(budget<=0)break;const body=text.slice(0,budget);budget-=body.length;parts.push(`### ${path}\n${body}`);}
 return `You are a code reviewer. Review the diff below. Do not modify any files.
Report only real defects: bugs, security problems, broken edge cases, missing error handling. Skip style nits.
Reply with ONLY a JSON array, no prose. Each item: {"path": string, "line": number (line number in the NEW file), "severity": "high"|"medium"|"low", "message": string (one or two sentences), "fix": string (what to change, one sentence)}. Reply [] if nothing is wrong.

${parts.join('\n\n')}`;
}
// Tolerant of prose or code fences around the array; drops malformed items instead of failing the review.
export function parseFindings(text,paths){
 const start=text.indexOf('['),end=text.lastIndexOf(']');if(start<0||end<start)throw new Error('The reviewer did not return findings');
 let list;try{list=JSON.parse(text.slice(start,end+1));}catch{throw new Error('The reviewer did not return findings');}
 if(!Array.isArray(list))throw new Error('The reviewer did not return findings');
 return list.filter(item=>item&&typeof item.path==='string'&&(!paths||paths.includes(item.path))&&Number.isInteger(item.line)&&item.line>0&&typeof item.message==='string'&&item.message.trim())
  .slice(0,MAX_FINDINGS).map(item=>({path:item.path,line:item.line,severity:SEVERITIES.includes(item.severity)?item.severity:'medium',message:item.message.trim().slice(0,600),fix:typeof item.fix==='string'?item.fix.trim().slice(0,600):''}));
}

// Subsequence fuzzy match for @-mentions. Higher is better; -1 means no match.
const boundary=/[\/\\._\- ]/;
export function fuzzyScore(query,text){
 const q=query.toLowerCase(),t=text.toLowerCase();if(!q)return 0;
 let score=0,at=0,run=0;
 for(const char of q){
  const found=t.indexOf(char,at);if(found<0)return -1;
  run=found===at&&at>0?run+1:0;
  score+=1+run*2+(found===0||boundary.test(t[found-1])?4:0)-(found-at)*.1;at=found+1;
 }
 const name=t.slice(t.lastIndexOf('/')+1);
 if(name.includes(q))score+=10;if(name.startsWith(q))score+=6;
 return score-t.length*.01;
}
export function fuzzyRank(items,query,key=item=>item,limit=8){
 const ranked=[];for(const item of items){const score=fuzzyScore(query,key(item));if(score>=0)ranked.push({item,score});}
 return ranked.sort((a,b)=>b.score-a.score).slice(0,limit).map(entry=>entry.item);
}

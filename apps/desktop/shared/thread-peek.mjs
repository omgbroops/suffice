// Local helpers for sidebar threads: short titles and the peek-card summary. No model calls.
const clip=(s,n)=>s.length<=n?s:s.slice(0,n+1).replace(/\s+\S*$/,'').replace(/[\s,;:.\-–—]+$/,'')+'…';
// shortcut: English filler list only, add locales when threads need them.
const lead=/^(?:(?:hey|hi|hello|ok(?:ay)?|so|please|pls)[\s,!.]+)*(?:(?:can|could|would|will)\s+you\s+(?:please\s+)?|i\s+(?:want|need)\s+(?:you\s+)?to\s+|i'd\s+like\s+(?:you\s+)?to\s+|let'?s\s+)?(?:please\s+)?/i;
export function shortTitle(text,max=48){
 const body=String(text??'').replace(/```[\s\S]*?```/g,' ').split(/\n/).map(l=>l.trim()).find(Boolean)||'';
 let t=body.replace(/^[#>*\-\s]+/,'').replace(/\s+/g,' ').trim();
 const first=t.match(/^.+?[.!?](?=\s|$)/)?.[0];if(first&&first.length>=12)t=first.replace(/[.!?]+$/,'');
 const rest=t.replace(lead,'').trim();if(rest.split(' ').length>1)t=rest; // a lone word left over ("hello there") is the message, not filler
 if(!t)return 'Untitled thread';
 return clip(t[0].toUpperCase()+t.slice(1),max);
}
const textOf=m=>m?.displayText||(m?.content||[]).filter(p=>p.type==='text').map(p=>p.text).join('\n')||'';
const firstLine=s=>clip(String(s).split(/\n/).map(l=>l.replace(/^[#>*\-\s]+/,'').trim()).find(Boolean)||'',140);
export function peekSummary(opened,diff){
 const msgs=opened?.messages||[],last=role=>[...msgs].reverse().find(m=>m.role===role&&!m.automatic&&textOf(m).trim());
 const cost=opened?.usage?.cost;
 return {prompt:firstLine(textOf(last('user'))),answer:firstLine(textOf(last('assistant'))),
  files:diff?.files||0,cost:Number.isFinite(cost)&&cost>0?(cost<0.01?'<$0.01':'$'+cost.toFixed(2)):''};
}

// Compact live card for a tool that is still running: name, current step, elapsed time, stop. Fast tools never show it.
const WORKFLOW=/workflow|agent|task|flow/i,DELAY=1500;
const clock=ms=>{const s=Math.floor(ms/1000);return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;};
const stepOf=input=>String(input?.command??input?.cmd??input?.description??input?.prompt??input?.name??'').split('\n').find(l=>l.trim())?.trim().slice(0,120)||'';
export function createLiveCard({name,input,onStop}){
 const el=document.createElement('div');el.className='thread-live';el.setAttribute('role','status');
 const title=document.createElement('span'),step=document.createElement('span'),time=document.createElement('time'),stop=document.createElement('button');
 title.className='thread-live-name';title.textContent=name.replaceAll('_',' ');step.className='thread-live-step';step.textContent=stepOf(input);time.className='thread-live-time';
 stop.type='button';stop.className='thread-live-stop';stop.textContent='Stop';stop.setAttribute('aria-label',`Stop ${name}`);stop.onclick=onStop;
 el.append(title,step,time,stop);
 const start=Date.now(),tick=()=>{time.textContent=clock(Date.now()-start);};tick();
 el.hidden=!WORKFLOW.test(name);let timer=el.hidden?setTimeout(()=>{el.hidden=false;},DELAY):0;const every=setInterval(tick,1000);
 return {element:el,progress(text){const line=String(text||'').split('\n').filter(l=>l.trim()).at(-1);if(line)step.textContent=line.trim().slice(0,120);},done(){clearTimeout(timer);clearInterval(every);el.remove();}};
}

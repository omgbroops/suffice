// Thread menu "Hand off": the backend writes a handoff record and returns a summary; a fresh thread opens with it as the draft.
export function connectThreadHandoff({api,toast,newThread}){
 document.addEventListener('suffice-handoff-thread',async event=>{
  try{const id=event.detail?.id;if(!id)return;const {text}=await api.handoffThread(id);
   newThread();const prompt=document.querySelector('#prompt');prompt.value=text;prompt.dispatchEvent(new Event('input',{bubbles:true}));prompt.focus();toast('Handoff ready: review it, then send');}
  catch(error){toast(error.message?.replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'')||'Could not hand off');}
 });
}

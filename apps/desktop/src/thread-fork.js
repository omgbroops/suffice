// Fork the open thread (or the one named in the event) up to a message, or the whole thread when no entry is given.
export function connectThreadFork(list,{api,toast,onFork,getActive}){
 document.addEventListener('suffice-fork-thread',async event=>{try{const {id=getActive?.(),entryId,before,text}=event.detail||{};if(!id)return;const fork=await api.forkThread(id,entryId?{entryId,before:!!before}:undefined);if(fork)await onFork(fork,before&&text?{draft:text}:undefined);}catch(error){toast(error.message);}});
}

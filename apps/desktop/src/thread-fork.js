// Fork the open thread (or the one named in the event) up to a message, or the whole thread when no entry is given.
export function connectThreadFork(list,{api,toast,onFork,getActive}){
 document.addEventListener('suffice-fork-thread',async event=>{try{const {id=getActive?.(),entryId,before,text,turn,kind}=event.detail||{};if(!id)return;const fork=await api.forkThread(id,turn?{turn,kind}:entryId?{entryId,before:!!before}:undefined);if(fork)await onFork(fork,before&&text?{draft:text}:undefined);}catch(error){toast(error.message);}});
}
// Export a saved thread (Markdown file, HTML file, or clipboard) via the main process; the save dialog lives there.
export function connectThreadExport({api,toast,getActive}){
 document.addEventListener('suffice-export-thread',async event=>{try{const {id=getActive?.(),kind='md'}=event.detail||{};if(!id){toast('Open a thread to export it');return;}const result=await api.exportThread(id,kind);if(result?.copied)toast('Thread copied as Markdown');else if(result?.path)toast('Exported to '+result.path.split('/').pop());}catch(error){toast(error.message);}});
}

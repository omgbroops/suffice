let threads=[],activate=()=>{};
export function updateThreadDirectory(records,open){threads=records;activate=open;if(typeof document!=='undefined')document.dispatchEvent(new Event('suffice-thread-directory'));}
export function getThreadDirectory(){return {threads:[...threads],open:id=>activate(threads.find(thread=>thread.id===id))};}

let threads=[],activate=()=>{};
export function updateThreadDirectory(records,open){threads=records;activate=open;}
export function getThreadDirectory(){return {threads:[...threads],open:id=>activate(threads.find(thread=>thread.id===id))};}

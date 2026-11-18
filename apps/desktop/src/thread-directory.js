let threads=[],activate=()=>{},sessions=[];
export function updateThreadDirectory(records,open){threads=records;activate=open;if(typeof document!=='undefined')document.dispatchEvent(new Event('suffice-thread-directory'));}
export function getThreadDirectory(){return {threads:[...threads],open:id=>activate(threads.find(thread=>thread.id===id))};}
// Live CLI sessions, kept apart from threads so the command menu keeps listing threads only.
export function updateSessionDirectory(records){sessions=records;if(typeof document!=='undefined')document.dispatchEvent(new Event('suffice-thread-directory'));}
export function getSessionDirectory(){return [...sessions];}

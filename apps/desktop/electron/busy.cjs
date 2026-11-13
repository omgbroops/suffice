// What is running right now. Foreground is the viewed session; background covers background
// tasks and automation runs. Every "is anything running" check reads this one counter.
function createBusy(){
 const counts={foreground:0,background:0};
 function begin(kind){
  counts[kind]++;let done=false;
  return ()=>{if(!done){done=true;counts[kind]--;}};
 }
 return {begin,count:kind=>kind?counts[kind]:counts.foreground+counts.background};
}
module.exports={createBusy};

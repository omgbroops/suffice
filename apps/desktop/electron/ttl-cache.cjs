// Caches the promise for a key, so concurrent callers share one load. Failures are not kept.
function createTtlCache({ttl=60000,now=Date.now}={}){
 const entries=new Map();
 function get(key,load){
  const hit=entries.get(key);
  if(hit&&now()-hit.at<ttl)return hit.value;
  const entry={at:now(),value:Promise.resolve().then(load)};
  entries.set(key,entry);
  entry.value.catch(()=>{if(entries.get(key)===entry)entries.delete(key);});
  return entry.value;
 }
 return {get,clear:()=>entries.clear()};
}
module.exports={createTtlCache};

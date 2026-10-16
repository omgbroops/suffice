import fs from 'node:fs/promises';
const root='.suffice/retrieval'; await fs.mkdir(root,{recursive:true});
const specs=[['micromatch/picomatch',197,62],['micromatch/picomatch',198,142],['micromatch/picomatch',196,187],['micromatch/picomatch',199,58],['mrmlnc/fast-glob',505,499]];
const api=async p=>{const r=await fetch('https://api.github.com/repos/'+p);if(!r.ok)throw Error(r.status+' '+p);return r.json()};
const queries=[],labels=[],repos=[];
for(const [repo,pr,issue] of specs){
 const p=await api(`${repo}/pulls/${pr}`),i=await api(`${repo}/issues/${issue}`),f=await api(`${repo}/pulls/${pr}/files?per_page=100`);
 if(!p.merged_at||i.pull_request)throw Error('invalid independent issue');
 const id=repo.split('/')[1]+'-'+issue, revision=p.base.sha;
 queries.push({id,repo,revision,issueUrl:i.html_url,title:i.title,body:i.body,createdAt:i.created_at});
 labels.push({id,prUrl:p.html_url,mergedAt:p.merged_at,head:p.head.sha,files:f.filter(x=>/^(lib|src)\/.*\.(js|ts)$/.test(x.filename)).map(x=>({path:x.filename,patch:x.patch??null,status:x.status}))});
 repos.push({repo,revision});
}
await fs.writeFile(root+'/queries.json',JSON.stringify(queries,null,2));
await fs.writeFile(root+'/labels-private.json',JSON.stringify(labels,null,2));
await fs.writeFile(root+'/repositories.json',JSON.stringify([...new Map(repos.map(x=>[x.repo+'@'+x.revision,x])).values()],null,2));
console.log({queries:queries.length,revisions: new Set(repos.map(x=>x.revision)).size,labels:labels.map(x=>({id:x.id,files:x.files.map(f=>f.path)}))});


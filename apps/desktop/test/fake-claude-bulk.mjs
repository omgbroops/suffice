// Perf fixture: a fake Claude Code that writes FAKE_BULK_PAIRS user/assistant pairs (markdown + code) and a tool pair every 4th turn, math and mermaid (the stress triage fixture), then idles.
import fs from 'node:fs';
const file=process.argv[2],N=Number(process.env.FAKE_BULK_PAIRS||1140);let n=0,t0=Date.parse('2026-11-15T10:00:00Z');
const rows=[];const line=o=>rows.push(JSON.stringify({sessionId:'s1',cwd:'/tmp/example-project',gitBranch:'main',isSidechain:false,uuid:'u'+(++n),timestamp:new Date(t0+=1500).toISOString(),...o}));
const asst=c=>line({type:'assistant',message:{id:'m'+n,model:'claude-haiku-4-5',content:c,usage:{input_tokens:30,output_tokens:8}}});
for(let i=0;i<N;i++){
 line({type:'user',message:{content:`Question ${i}`}});
 if(i%4===3){asst([{type:'tool_use',id:'t'+i,name:'Bash',input:{command:'ls build',description:'List'}}]);line({type:'user',message:{content:[{type:'tool_result',tool_use_id:'t'+i,content:'a.o\nb.o',is_error:false}]},toolUseResult:{stdout:'a.o\nb.o',stderr:''}});}
 asst([{type:'text',text:`## Answer ${i}\n\n- item a\n- item b\n\n\`\`\`ts\nlet x${i}=await fetch('/api');\n\`\`\`\n\nInline $e^{i\\pi}+1=0$\n\n$$\\int_0^1 x^2 dx$$\n\n${i%50===7?'```mermaid\ngraph TD; A-->B\n```\n\n':''}${'Long paragraph text. '.repeat(i%7*12)}\n`}]);
}
fs.writeFileSync(file,rows.join('\n')+'\n');
console.log('Claude Code v2.1.0\nclaude-haiku-4-5 with high effort\n\n❯ ');
setInterval(()=>{},1e6);

// Test-only fake Claude: 60 turns (edit, passing test run, claim) so the transcript's markdown windowing unrenders far messages.
import fs from 'node:fs';
const file=process.argv[2];let n=0,t=Date.parse('2026-11-15T10:00:00Z');
const line=o=>fs.appendFileSync(file,JSON.stringify({sessionId:'s-long',cwd:'/tmp/long-project',gitBranch:'main',isSidechain:false,uuid:'u'+(++n),timestamp:new Date(t+=1500).toISOString(),...o})+'\n');
const asst=content=>line({type:'assistant',message:{id:'m'+n,model:'claude-haiku-4-5',content,usage:{input_tokens:300,output_tokens:20}}});
const res=(id,c,tur)=>line({type:'user',message:{content:[{type:'tool_result',tool_use_id:id,content:c,is_error:false}]},toolUseResult:tur});
await new Promise(r=>setTimeout(r,300));
for(let k=1;k<=60;k++){
 line({type:'user',message:{content:`Turn ${k}: update file_${k}.js`}});
 asst([{type:'tool_use',id:`e${k}`,name:'Edit',input:{file_path:`/tmp/long-project/file_${k}.js`,old_string:'a',new_string:'b'}}]);res(`e${k}`,'ok',{filePath:`/tmp/long-project/file_${k}.js`});
 asst([{type:'tool_use',id:`t${k}`,name:'Bash',input:{command:'npm test'}}]);res(`t${k}`,'pass 1',{stdout:'pass 1',stderr:''});
 asst([{type:'text',text:`Updated \`file_${k}.js\`. All tests pass.`}]);
}
for(;;) await new Promise(r=>setTimeout(r,1e6));

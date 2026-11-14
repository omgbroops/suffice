import test from 'node:test';
import assert from 'node:assert/strict';
import {normalize,impact,migrations,canRewind,initial,reduce,codeText,dbText,testText} from '../src/timeline-model.js';

const save=(n,extra={})=>({save_id:'s'+n,name:'save '+n,created_at:new Date(2026,10,13,10,n).toISOString(),code_bytes:1000*n,db_bytes:100*n,memory_bytes:0,...extra});
const res=(n=4,extra=[])=>({head:null,saves:Array.from({length:n},(_,i)=>save(i+1,extra[i]||{}))});
const load=(r=res())=>reduce(initial(),{type:'load',res:r});

test('load sorts newest first and selects the newest', () => {
 const s=load();assert.deepEqual(s.saves.map(x=>x.id),['s4','s3','s2','s1']);assert.equal(s.selected,'s4');
});
test('selection: arrows move and clamp at both ends, select jumps, unknown ids are ignored', () => {
 let s=load();
 s=reduce(s,{type:'move',delta:-1});assert.equal(s.selected,'s4');
 s=reduce(s,{type:'move',delta:2});assert.equal(s.selected,'s2');
 s=reduce(s,{type:'move',delta:1e9});assert.equal(s.selected,'s1');
 s=reduce(s,{type:'move',delta:-1e9});assert.equal(s.selected,'s4');
 s=reduce(s,{type:'select',id:'s3'});assert.equal(s.selected,'s3');
 assert.equal(reduce(s,{type:'select',id:'nope'}).selected,'s3');
});
test('selection survives a reload when the save still exists', () => {
 const s=reduce(load(),{type:'select',id:'s2'});assert.equal(reduce(s,{type:'load',res:res(5)}).selected,'s2');
});
test('confirm flow: ask opens, cancel closes, start rewinds, ok lands on the new head', () => {
 let s=reduce(load(),{type:'select',id:'s2'});
 s=reduce(s,{type:'ask'});assert.equal(s.phase,'confirming');
 s=reduce(s,{type:'cancel'});assert.equal(s.phase,'idle');assert.equal(s.selected,'s2');
 s=reduce(reduce(s,{type:'ask'}),{type:'start'});assert.equal(s.phase,'rewinding');
 s=reduce(s,{type:'ok',res:{...res(5),head:'s2'}});assert.equal(s.phase,'done');assert.equal(s.head,'s2');assert.equal(s.selected,'s2');
});
test('start is refused without a confirm step', () => {
 assert.equal(reduce(load(),{type:'start'}).phase,'idle');
});
test('while rewinding, move, select and ask are ignored', () => {
 const s=reduce(reduce(load(),{type:'ask'}),{type:'start'});
 for(const e of [{type:'move',delta:1},{type:'select',id:'s1'},{type:'ask'},{type:'cancel'}])assert.deepEqual(reduce(s,e),s);
});
test('moving or selecting while the confirm is open closes it', () => {
 const s=reduce(load(),{type:'ask'});
 assert.equal(reduce(s,{type:'move',delta:1}).phase,'idle');assert.equal(reduce(s,{type:'select',id:'s1'}).phase,'idle');
});
test('error state: failure keeps the message and the selection, retry and cancel both work', () => {
 let s=reduce(reduce(load(),{type:'select',id:'s2'}),{type:'ask'});s=reduce(s,{type:'start'});
 s=reduce(s,{type:'fail',message:'facade failed'});
 assert.equal(s.phase,'failed');assert.equal(s.error,'facade failed');assert.equal(s.selected,'s2');
 assert.equal(reduce(s,{type:'start'}).phase,'rewinding');
 const c=reduce(s,{type:'cancel'});assert.equal(c.phase,'idle');
 assert.equal(reduce(s,{type:'move',delta:1}).error,'');
});
test('a stray fail outside a rewind does not create an error', () => {
 assert.equal(reduce(load(),{type:'fail',message:'x'}).phase,'idle');
});
test('impact counts the saves a rewind passes over and flags destructive ones', () => {
 const n=normalize(res(4,[{},{changes:{files:2,added:10,removed:3}},{changes:{files:1,added:5,removed:1},db:{rows_changed:7,destructive:'drops a column'}},{changes:{files:4,added:1,removed:0}}]));
 const i=impact(n.saves,'s2');
 assert.equal(i.gone,2);assert.equal(i.files,5);assert.equal(i.added,6);assert.equal(i.rows,7);assert.deepEqual(i.destructive,['drops a column']);
 assert.equal(impact(n.saves,'s4').gone,0);
});
test('texts fall back to size deltas when the server sends no diff, DB or test fields', () => {
 const n=normalize(res(2));
 assert.equal(codeText(n.saves[1]),'First save');assert.equal(codeText(n.saves[0]),'Code +1 kB');
 assert.equal(dbText(n.saves[1]),'Empty database');assert.equal(testText(n.saves[0]),'Tests not run');
 assert.equal(testText({tests:{status:'failed',failed_step:'click Done'}}),'Tests failed at click Done');
});

const clock=ms=>new Date(ms).toTimeString().slice(0,5);
const mig=()=>load(res(5,[{},{},{db:{rows_changed:212,destructive:{what:'tasks.notes',rows:212}}},{},{}]));
test('target before the migration: the rewind brings the data back', () => {
 const s=mig();assert.deepEqual(migrations(s.saves,'s2',clock),['Brings back tasks.notes (212 rows) dropped at 10:03.']);
 assert.deepEqual(migrations(s.saves,'s1',clock),['Brings back tasks.notes (212 rows) dropped at 10:03.']);
});
test('target after the migration: the data stays gone and the newest save that still has it is named', () => {
 const s=mig();
 assert.deepEqual(migrations(s.saves,'s4',clock),['tasks.notes (212 rows) was dropped at 10:03 and stays gone. The newest save that still has it is 10:02, save 2.']);
 assert.equal(migrations(s.saves,'s3',clock)[0].includes('stays gone'),true);
});
test('migration on the oldest save: no save still has the data; string servers still work; none means no text', () => {
 const o=load(res(2,[{db:{destructive:'drops a column'}},{}]));
 assert.deepEqual(migrations(o.saves,'s2',clock),['drops a column was dropped at 10:01 and stays gone. No save still has it.']);
 assert.deepEqual(migrations(load().saves,'s2',clock),[]);
});
test('canRewind is false on the newest save and with no selection, true on older saves', () => {
 const s=load();assert.equal(canRewind(s),false);
 assert.equal(canRewind(reduce(s,{type:'select',id:'s3'})),true);
 assert.equal(canRewind({...s,selected:null}),false);assert.equal(canRewind(initial()),false);
});

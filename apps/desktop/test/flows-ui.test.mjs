import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import electronPath from 'electron';
import {_electron} from 'playwright-core';
import {guard} from './electron-guard.mjs';

const shots=process.env.FLOW_SHOTS;

test('Workflows page starts, gates, approves, cancels, resumes and budget-stops real backend runs, and keeps them across a restart',{timeout:180000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-flow-ui-'));
 const launch=async(tokens,body)=>{
  const env={...process.env,PI_OFFLINE:'1',SUFFICE_HOME:home,SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_TEST_NO_SCHEDULER:'1',SUFFICE_FLOW_RUNNER:'fake',SUFFICE_FLOW_RUN_TOKENS:tokens,SUFFICE_SESSIONS_SOCKET:'sfx-fl2-workflow-flow-1',SUFFICE_HISTORY_HOME:await mkdtemp(resolve(tmpdir(),'suffice-flow-hist-'))};delete env.ELECTRON_RUN_AS_NODE;
  const app=await _electron.launch({executablePath:electronPath,args:[...guard,resolve('apps/desktop'),'--user-data-dir='+resolve(home,'profile')],env});
  try{const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1440,900));await page.waitForTimeout(300);
   const shot=async name=>{if(!shots)return;await mkdir(shots,{recursive:true});for(const theme of ['dark','light']){await page.locator('html').evaluate((el,t)=>{el.dataset.theme=t;},theme);await page.waitForTimeout(150);const png=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));await writeFile(resolve(shots,`${name}-${theme}.png`),Buffer.from(png,'base64'));}await page.locator('html').evaluate(el=>{el.dataset.theme='dark';});};
   await body(page,shot);assert.deepEqual(errors,[]);}
  finally{await app.close();}
 };
 const open=async page=>{await page.locator('.flows-nav').click();await page.locator('.flows-view:not([hidden])').waitFor();};
 const start=async(page,kind,task,testCmd)=>{
  await page.getByRole('button',{name:'New run'}).click();await page.getByRole('radio',{name:kind}).click();
  await page.locator('[data-field=task]').fill(task);await page.locator('[data-field=test]').fill(testCmd);
  await page.getByRole('button',{name:'Start run'}).click();await page.locator('.flow-form').waitFor({state:'detached'});
 };
 const rowOf=(page,title)=>page.locator('.flow-item',{has:page.locator('.flow-title',{hasText:title})});
 const OK='node -e process.exit(0)',BAD='node -e process.exit(1)';

 await launch('100000',async(page,shot)=>{
  await open(page);await page.getByText('No runs yet').waitFor();await shot('empty');

  // Validation comes from the backend handler and shows as a toast; nothing starts.
  await page.getByRole('button',{name:'New run'}).click();await page.getByRole('button',{name:'Start run'}).click();
  await page.locator('.flow-error',{hasText:'Describe the task'}).waitFor({timeout:1500});await page.getByText('Describe the task').first().waitFor();assert.equal(await page.locator('.flow-row').count(),0);
  // An 8.8k-character task is accepted, not rejected as empty.
  await page.locator('[data-field=task]').fill('x'.repeat(8800));await page.locator('[data-field=test]').fill('node -e process.exit(0)');await page.getByRole('button',{name:'Start run'}).click();await page.locator('.flow-form').waitFor({state:'detached'});await page.locator('.flow-row').first().waitFor({timeout:5000});assert.equal(await page.locator('.flow-row').count(),1);
  await page.getByRole('button',{name:'New run'}).click();
  await page.getByRole('button',{name:/close|dismiss/i}).last().click().catch(()=>{});await page.waitForTimeout(400);
  await page.getByRole('button',{name:'Cancel',exact:true}).click();

  // Approval gate: the run waits, the sidebar counts it, Approve lets it build and pass the test gate.
  await start(page,'Plan, approve, build','Add a login form',OK);
  const card=page.locator('.flow-approval');await card.waitFor();
  assert.match(await card.innerText(),/Approval needed[\s\S]*build-plan in Add a login form[\s\S]*done/);
  assert.equal(await page.locator('.flows-count').innerText(),'1');
  assert.match(await rowOf(page,'Add a login form').innerText(),/Needs approval/);
  await shot('approval');
  await card.getByRole('button',{name:'Approve'}).click();
  const first=rowOf(page,'Add a login form');await first.getByText('Done',{exact:true}).waitFor();
  assert.match(await first.innerText(),/2\.4k \/ 100k/);
  await first.getByText('Approval build-plan granted').waitFor();
  await shot('done');
  await first.locator('.flow-row').click();assert.equal(await first.locator('.flow-timeline').count(),0);await first.locator('.flow-row').click();await first.locator('.flow-timeline').waitFor();
  assert.equal(await page.locator('.flows-count').isHidden(),true);

  // Denied approval ends the run with the reason.
  await start(page,'Plan, approve, build','Rename the API',OK);
  await page.locator('.flow-approval').getByRole('button',{name:'Deny'}).click();
  const denied=rowOf(page,'Rename the API');await denied.getByText('Approval build-plan was denied').waitFor();

  // A failing test command is repaired once, fails again, and the run reports the gate.
  await start(page,'Plan, build, review','Fix flaky test',BAD);
  const gate=rowOf(page,'Fix flaky test');await gate.getByText('Gate tests-after-repair failed with exit code 1').waitFor();
  await shot('gate-failed');

  // Cancel while waiting for approval, then resume: the question is asked again and approving finishes it.
  await start(page,'Plan, approve, build','Migrate the schema',OK);
  await page.locator('.flow-approval').waitFor();
  await rowOf(page,'Migrate the schema').getByRole('button',{name:'Cancel Migrate the schema'}).click();
  const cancelled=rowOf(page,'Migrate the schema');await cancelled.getByText('Cancelled',{exact:true}).waitFor();
  assert.equal(await page.locator('.flow-approval').count(),0);
  await cancelled.getByRole('button',{name:'Resume Migrate the schema'}).click();
  await page.locator('.flow-approval').waitFor();await page.locator('.flow-approval').getByRole('button',{name:'Approve'}).click();
  await cancelled.getByText('Done',{exact:true}).waitFor();
  await shot('list');
 });

 // Restart with a tiny budget: earlier runs persist, and the next run is refused by the budget.
 await launch('1000',async(page,shot)=>{
  await open(page);await page.locator('.flow-row').first().waitFor();assert.equal(await page.locator('.flow-row').count(),5);
  assert.equal(await rowOf(page,'Add a login form').getByText('Done',{exact:true}).count(),1);
  assert.equal(await rowOf(page,'Fix flaky test').getByText('Failed',{exact:true}).count(),1);
  await start(page,'Plan, build, review','Big refactor',OK);
  const refused=rowOf(page,'Big refactor');await refused.getByText(/Window "run" \(run\) has 1000 tokens left and this needs 20000/).waitFor();
  assert.match(await refused.innerText(),/Failed[\s\S]*0 \/ 1k/);
  await refused.getByText('Budget refused a step').waitFor();
  await shot('budget');
  // Keyboard: Escape closes the page and returns focus to the sidebar entry.
  await page.keyboard.press('Escape');await page.locator('.flows-view').waitFor({state:'hidden'});
 });
});

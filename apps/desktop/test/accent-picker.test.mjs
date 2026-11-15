import electronPath from 'electron';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {_electron} from 'playwright-core';
test('custom accent previews, validates, saves and cancels without changing the saved color',{timeout:60000},async()=>{
 const home=await mkdtemp(resolve(tmpdir(),'suffice-accent-')),env={...process.env,PI_OFFLINE:'1',SUFFICE_TEST_HIDE_WINDOW:'1',SUFFICE_HOME:home};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:electronPath,args:[resolve('apps/desktop'),'--user-data-dir='+resolve(home,'electron')],env});
 try{const page=await app.firstWindow();await page.locator('.composer').waitFor();await page.evaluate(()=>document.dispatchEvent(new CustomEvent('suffice-open-settings',{detail:{section:'appearance'}})));
 const button=page.getByRole('button',{name:'Custom accent color',exact:true});await button.click();const picker=page.getByRole('dialog',{name:'Custom accent color',exact:true});await picker.waitFor();
 const hex=picker.getByRole('textbox',{name:'Hex color'});await hex.fill('#12abcd');assert.equal(await page.evaluate(()=>document.documentElement.style.getPropertyValue('--blue')),'#12abcd');await picker.getByRole('button',{name:'Done',exact:true}).click();await picker.waitFor({state:'hidden'});assert.equal((await page.evaluate(()=>window.sufficeDesktop.preferences())).accent,'#12abcd');
 await button.click();await hex.fill('#xyz');assert.equal(await picker.getByRole('button',{name:'Done',exact:true}).isDisabled(),true);await hex.fill('#ff0000');await hex.press('Escape');await picker.waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>document.documentElement.style.getPropertyValue('--blue')),'#12abcd');assert.equal(await page.locator('.settings-main').isVisible(),true);
 }finally{await app.close();}
});

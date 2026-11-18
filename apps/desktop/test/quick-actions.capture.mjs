import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {launchQuick,openThread} from './quick-actions-lib.mjs';
// Hidden-window screenshots of every quick-action state, dark and light, via capturePage.
const out=resolve(process.env.SHOT_DIR||'/Users/abhayg/suffice-desktop-wt/ui-shots/forge/feat/quick-actions');await mkdir(out,{recursive:true});
const {app,page}=await launchQuick('suffice-quick-shots-');
const shot=async name=>{await page.waitForTimeout(350);const b64=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));await writeFile(resolve(out,name+'.png'),Buffer.from(b64,'base64'));};
const prompt=page.locator('#prompt');
try{
 await openThread(page,'First question');
 for(const theme of ['dark','light']){
  await page.evaluate(t=>{document.documentElement.dataset.theme=t;},theme);
  await prompt.fill('');await prompt.click();await page.keyboard.type('/');await page.locator('.composer-suggest').waitFor();await shot(`${theme}-1-slash`);
  await prompt.fill('/model ');await page.locator('.composer-suggest').getByRole('option').first().waitFor();await shot(`${theme}-2-model`);
  await prompt.fill('/effort ');await page.waitForTimeout(200);await shot(`${theme}-3-effort`);
  await prompt.fill('see @cmp');await page.locator('.composer-suggest').getByRole('option').first().waitFor();await shot(`${theme}-4-mention`);
  await prompt.fill('');await page.keyboard.press('Escape');
  await page.evaluate(()=>{const dt=new DataTransfer();dt.items.add(new File(['x'],'a.txt'));document.querySelector('.thread-transcript').dispatchEvent(new DragEvent('dragenter',{bubbles:true,dataTransfer:dt}));});await shot(`${theme}-5-drop`);
  await page.evaluate(()=>document.querySelector('.composer').classList.remove('attachment-drag'));
  await page.locator('.thread-user').last().hover();await page.locator('.message-toolbar').waitFor();await shot(`${theme}-6-toolbar`);
 }
 await page.locator('.message-toolbar').getByRole('button',{name:'Edit and resend'}).click();await page.waitForFunction(()=>document.querySelector('#prompt').value==='Second question');await shot('light-7-editing');
 await page.evaluate(()=>{document.documentElement.dataset.theme='dark';});await shot('dark-7-editing');
}finally{await app.close();}

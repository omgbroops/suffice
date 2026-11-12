// Read-only visual review against the local harness. Never sends a prompt.
import {_electron} from 'playwright-core';
import {resolve} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
const output=resolve('apps/desktop/visual-review/tactile');await mkdir(output,{recursive:true});
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const app=await _electron.launch({executablePath:resolve('node_modules/electron/dist/electron.exe'),args:[resolve('apps/desktop')],env});
let keep=false;
try{
 const page=await app.firstWindow();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.locator('.context-ring').waitFor();
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setBounds({width:1440,height:900}));
 await page.waitForFunction(()=>innerWidth===1440&&innerHeight===900);
 await page.waitForFunction(()=>!document.querySelector('.model-button').disabled);
 const originalTheme=await page.evaluate(()=>document.documentElement.dataset.theme);
 for(const theme of ['dark','light']){
  await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
  await page.screenshot({path:resolve(output,`after-${theme}.png`)});
  await page.locator('.composer').screenshot({path:resolve(output,`composer-${theme}.png`)});
  await page.getByRole('button',{name:'Choose project',exact:true}).click();
  await page.waitForTimeout(180);
  await page.locator('.project-menu').screenshot({path:resolve(output,`projects-${theme}.png`)});
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Choose model and effort'}).click();
  await page.waitForTimeout(180);
  await page.locator('.model-picker').screenshot({path:resolve(output,`model-${theme}.png`)});
  if(await page.locator('.model-stage-button').count()){
   await page.locator('.model-stage-button').click();
   await page.waitForTimeout(180);
   await page.locator('.model-picker').screenshot({path:resolve(output,`model-list-${theme}.png`)});
  }
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Toggle right panel'}).click();await page.waitForTimeout(260);
  await page.screenshot({path:resolve(output,`right-panel-${theme}.png`)});
  await page.getByRole('button',{name:'Toggle right panel'}).click();await page.waitForTimeout(260);
  const row=page.locator('.thread-row').first();
  if(await row.count()){
   await row.click();await page.locator('.thread-transcript').waitFor();await page.waitForTimeout(550);
   await page.screenshot({path:resolve(output,`thread-${theme}.png`)});
   await page.locator('.context-ring').click();await page.waitForTimeout(200);
   await page.locator('.context-usage-details').screenshot({path:resolve(output,`context-${theme}.png`)});
   await page.locator('#prompt').click();
   await page.getByRole('button',{name:'New session',exact:true}).click();await page.waitForTimeout(550);
  }
 }
 await page.evaluate(theme=>document.documentElement.dataset.theme=theme,originalTheme);
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.getByRole('button',{name:'Choose project',exact:true}).click();await page.waitForTimeout(180);
 const reducedTransform=await page.locator('.project-menu').evaluate(el=>getComputedStyle(el).transform);
 await page.keyboard.press('Escape');await page.emulateMedia({reducedMotion:null});
 await writeFile(resolve(output,'verification.json'),JSON.stringify({viewport:{width:1440,height:900},pageErrors:errors,reducedTransform,usage:await page.evaluate(()=>window.sufficeDesktop.usage())},null,2));
 if(errors.length)throw new Error(errors.join('\n'));
 await page.bringToFront();
 keep=process.argv.includes('--keep-open');console.log(JSON.stringify({ready:true,output,keptOpen:keep}));
 if(keep)await new Promise(()=>{});
}finally{if(!keep)await app.close();}

import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
export async function windowsTaskbarDetails(app){
 if(process.platform!=='win32')return null;
 const handle=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getNativeWindowHandle().readBigUInt64LE().toString());
 const source=resolve('apps/desktop/test/native-taskbar.cs').replaceAll("'","''");
 const script=`Add-Type -Path '${source}'; @{appId=[SufficeTaskbarProperties]::Read(${handle},5);icon=[SufficeTaskbarProperties]::Read(${handle},3);command=[SufficeTaskbarProperties]::Read(${handle},2)} | ConvertTo-Json -Compress`;
 const {stdout}=await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:20000});return JSON.parse(stdout);
}

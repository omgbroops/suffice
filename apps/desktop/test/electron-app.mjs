// Shared launch config for Electron tests: the platform's binary, the hidden-window entry, and an env allowlist
// (no provider keys from the developer's shell, so a test can never reach or bill a real model).
import {resolve} from 'node:path';
export const electronPath=resolve('node_modules/electron/dist',process.platform==='darwin'?'Electron.app/Contents/MacOS/Electron':process.platform==='win32'?'electron.exe':'electron');
export const hiddenMain=resolve('apps/desktop/test/hidden-main.cjs');
export function testEnv(extra={}){
 const env={};
 for(const key of ['PATH','HOME','USER','LOGNAME','SHELL','TMPDIR','LANG','SystemRoot','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA'])if(process.env[key])env[key]=process.env[key];
 return {...env,...extra};
}

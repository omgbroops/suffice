import {build,Platform,Arch} from 'electron-builder';
import {stageDesktop} from './stage.mjs';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
const root=fileURLToPath(new URL('../../',import.meta.url)),version=process.env.SUFFICE_DESKTOP_VERSION||'0.1.0-preview.20261115.1';
if(!['win32','darwin'].includes(process.platform))throw new Error('Build Windows on Windows and macOS on macOS.');
if(process.platform==='win32'&&process.arch!=='x64'||process.platform==='darwin'&&process.arch!=='arm64')throw new Error('This preview targets Windows x64 and Apple Silicon macOS arm64.');
const output=resolve(process.env.SUFFICE_INSTALLER_OUTPUT||join(root,'release')),stage=join(output,'.staging',process.platform+'-'+randomUUID());await mkdir(output,{recursive:true});
const runtime=await stageDesktop(stage,{version});
for(const [kind,binary] of [['browser',runtime.browser],['desktop',runtime.desktop]]){const info=execFileSync(binary,['--version'],{encoding:'utf8',timeout:20000,windowsHide:true});console.log('Bundled',kind,info.trim());}
const electronVersion=JSON.parse(await readFile(join(root,'node_modules/electron/package.json'),'utf8')).version;
const results=await build({projectDir:root,publish:'never',targets:(process.platform==='win32'?Platform.WINDOWS:Platform.MAC).createTarget(process.argv.includes('--dir')?'dir':process.platform==='win32'?'nsis':'dmg',process.platform==='win32'?Arch.x64:Arch.arm64),config:{appId:'com.suffice.app',productName:'Suffice',electronVersion,directories:{app:stage,output,buildResources:join(root,'apps/desktop/assets')},asar:false,npmRebuild:false,files:['**/*'],forceCodeSigning:false,compression:'normal',win:{icon:join(root,'apps/desktop/assets/suffice-logo.ico'),artifactName:'Suffice-${version}-windows-${arch}-setup.${ext}',signAndEditExecutable:true,signExecutable:false},nsis:{guid:'84dceb48-436e-541d-a121-ca8e8353d1f2',oneClick:false,perMachine:false,allowToChangeInstallationDirectory:true,createDesktopShortcut:true,shortcutName:'Suffice',uninstallDisplayName:'Suffice',runAfterFinish:false,deleteAppDataOnUninstall:false},mac:{icon:join(root,'apps/desktop/assets/suffice-logo-macos.icns'),category:'public.app-category.developer-tools',minimumSystemVersion:'27.0',identity:'-',extendInfo:{NSMicrophoneUsageDescription:'Suffice uses the microphone when you start a voice conversation.'},hardenedRuntime:false,notarize:false,artifactName:'Suffice-${version}-macos-${arch}.${ext}',extendInfo:{NSAppleEventsUsageDescription:'Suffice uses automation only when you ask the agent to interact with other apps.'}},dmg:{sign:false,title:'Suffice',iconSize:96,window:{width:540,height:360}}}});
await writeFile(join(output,'build-result.json'),JSON.stringify({version,platform:process.platform,arch:process.arch,artifacts:results,stage},null,2)+'\n');console.log('Installer artifacts:',results.join('\n'));

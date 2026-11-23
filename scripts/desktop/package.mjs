import {build,Platform,Arch} from 'electron-builder';
import {stageDesktop} from './stage.mjs';
import {mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
const root=fileURLToPath(new URL('../../',import.meta.url)),env=process.env;
const pkg=JSON.parse(await readFile(join(root,'apps/desktop/package.json'),'utf8')),version=env.SUFFICE_DESKTOP_VERSION||pkg.version;
if(!['win32','darwin'].includes(process.platform))throw new Error('Build Windows on Windows and macOS on macOS.');
if(process.platform==='win32'&&process.arch!=='x64'||process.platform==='darwin'&&process.arch!=='arm64')throw new Error('Targets are Windows x64 and Apple Silicon macOS arm64.');
const output=resolve(env.SUFFICE_INSTALLER_OUTPUT||join(root,'release')),stage=join(output,'.staging',process.platform+'-'+randomUUID());await mkdir(output,{recursive:true});
const assets=join(root,'apps/desktop/assets');
// Signing switches: a Developer ID cert (CSC_LINK or CSC_NAME) turns on real signing; APPLE_* turn on notarization. Otherwise ad-hoc.
const real=Boolean(env.CSC_LINK||env.CSC_NAME),notarize=real&&Boolean((env.APPLE_ID&&env.APPLE_APP_SPECIFIC_PASSWORD&&env.APPLE_TEAM_ID)||(env.APPLE_API_KEY&&env.APPLE_API_KEY_ID&&env.APPLE_API_ISSUER));
const runtime=await stageDesktop(stage,{version});
try{
const electronVersion=JSON.parse(await readFile(join(root,'node_modules/electron/package.json'),'utf8')).version;
const results=await build({projectDir:root,publish:'never',targets:(process.platform==='win32'?Platform.WINDOWS:Platform.MAC).createTarget(process.argv.includes('--dir')?'dir':process.platform==='win32'?'nsis':'dmg',process.platform==='win32'?Arch.x64:Arch.arm64),config:{appId:'com.suffice.app',productName:'Suffice',electronVersion,directories:{app:stage,output,buildResources:assets},asar:true,asarUnpack:['**/*.node','node_modules/node-pty/**','node_modules/agent-browser/**','node_modules/@agent-browser/**','node_modules/agent-desktop/**','node_modules/@earendil-works/pi-tui/native/**'],npmRebuild:false,files:['**/*'],forceCodeSigning:false,compression:'normal',
 win:{icon:join(assets,'suffice-logo.ico'),artifactName:'Suffice-${version}-windows-${arch}-setup.${ext}',signAndEditExecutable:true,signExecutable:false},
 nsis:{guid:'84dceb48-436e-541d-a121-ca8e8353d1f2',oneClick:false,perMachine:false,allowToChangeInstallationDirectory:true,createDesktopShortcut:true,shortcutName:'Suffice',uninstallDisplayName:'Suffice',runAfterFinish:false,deleteAppDataOnUninstall:false},
 mac:{icon:join(assets,'suffice-logo.icns'),category:'public.app-category.developer-tools',...(real?{}:{identity:'-'}),hardenedRuntime:real,notarize,artifactName:'Suffice-${version}-macos-${arch}.${ext}',extendInfo:{NSAppleEventsUsageDescription:'Suffice uses automation only when you ask the agent to interact with other apps.'}},
 dmg:{sign:false,title:'Suffice',iconSize:96,iconTextSize:13,backgroundColor:'#f4f4f4',window:{width:540,height:380},contents:[{x:135,y:180,type:'file'},{x:405,y:180,type:'link',path:'/Applications'}]}}});
await writeFile(join(output,'build-result.json'),JSON.stringify({version,platform:process.platform,arch:process.arch,signing:real?'developer-id':'ad-hoc',notarize,artifacts:results},null,2)+'\n');console.log('Installer artifacts:',results.join('\n'));
}finally{await rm(join(output,'.staging'),{recursive:true,force:true});}

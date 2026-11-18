const toggle=(id,label,value=false,detail='')=>({id,label,value,detail,type:'toggle'});
const select=(id,label,value,options,detail='')=>({id,label,value,options,detail,type:'select'});
const keys=(label,value)=>({label,value,type:'keys'});
const group=(title,rows)=>({title,rows});

export const settingsSections=[
 {id:'general',title:'General',icon:'settings',category:'Personal',groups:[
  group('Application',[select('language','Language','System',['System','English']),select('send','Send messages with','Enter',['Enter','Ctrl + Enter'],'Shift + Enter always starts a new line.'),toggle('startup','Launch at startup'),toggle('tray','Keep running in the background',false,'Closing the window keeps active agents running.')]),
  group('Conversations',[select('working-send','While agent is working','Steer',['Queue','Steer'],'Ctrl + Enter uses the other mode.'),toggle('escape','Stop agent with Escape',false,'When no menu or dialog is open.'),toggle('close-panel','Close right panel with its last tab'),select('naming','Thread naming','Automatic',['Automatic','First message','Untitled']),select('new-project','New threads use','Last used project',['Last used project','Ask each time'])]),
  group('Privacy',[toggle('private-labels','Hide sensitive details',false,'Conceal paths and account details while sharing your screen.')]),
 ]},
 {id:'appearance',title:'Appearance',icon:'agent',category:'Personal',groups:[
  group('Themes',[{id:'palette',label:'Theme gallery',type:'themes',value:'default',options:['default','oled','paper','graphite']}]),
  group('Theme',[{id:'mode',label:'Mode',value:'Dark',options:['System','Light','Dark'],type:'segment'},select('background','Background','Pixel horizon',['Moonlit lake','ASCII gradient','Pixel horizon','Orbital','Oceanic Shimmer','None']),{id:'accent',label:'Accent color',value:'#7b9ed5',type:'palette'},toggle('glass','Translucent surfaces',true),{id:'surface-opacity',label:'Surface opacity',detail:'Opacity of translucent surfaces.',type:'range',value:72,min:0,max:100,whenGlass:true}]),
  group('Background visibility',[toggle('chat-background','Show background in chat',true),toggle('settings-background','Show background in settings',true),{id:'background-dimming',label:'Background dimming',detail:'Dim the wallpaper in chats and settings.',type:'range',value:35}]),
  group('Motion',[toggle('background-motion','Animate background',true),toggle('reduced-motion','Reduce motion')]),
  group('Typography',[select('interface-font','Interface font','Inter',['Inter','Geist','Geist Mono','System']),select('code-font','Code font','JetBrains Mono',['JetBrains Mono','Geist Mono','System mono']),select('text-size','Text size','13 px',['12 px','13 px','14 px','15 px']),select('density','Density','Comfortable',['Comfortable','Compact'])]),
 ]},
 {id:'notifications',title:'Notifications',icon:'bell',category:'Personal',groups:[
  group('Notify me',[toggle('finished','Agent finished',true),toggle('approval','Approval needed',true),toggle('failed','Agent encountered an error',true),toggle('unfocused','Only when Suffice is in the background',true)]),
  group('Sound',[toggle('notification-sound','Play a sound'),select('sound','Notification sound','Soft',['Soft','Chime','Click'])]),
 ]},
 {id:'shortcuts',title:'Shortcuts',icon:'keyboard',category:'Personal',groups:[
  group('Conversations',[keys('New session','Ctrl N'),keys('Search threads and commands','Ctrl K'),keys('Send message','Enter'),keys('Send in background','Ctrl Enter'),keys('New line','Shift Enter')]),
  group('Workspace',[keys('Toggle sidebar','Ctrl B'),keys('Go to file','Ctrl P'),keys('Toggle explorer','Ctrl \\'),keys('Open settings','Ctrl ,')]),
  group('Navigation',[keys('Previous / next item','↑ ↓'),keys('Open selection','Enter'),keys('Close menu','Esc')]),
 ]},
 {id:'models',title:'Models',icon:'deep',category:'Agent',groups:[
  group('Defaults',[select('default-model','Default model','Last used',['Last used']),select('default-effort','Reasoning effort','Medium',['Low','Medium','High','Extra high','Max'])]),
 ]},
 {id:'usage',title:'Usage',icon:'context',category:'Agent',groups:[
  group('Optimizer',[toggle('optimizer-hint','Suggest cheaper settings',true,'Shows a hint above the composer when a task looks simple.'),toggle('optimizer-auto','Apply suggestions automatically',false,'Off by default. When on, Suffice switches model or effort for you and offers Undo.')]),
 ]},
 {id:'automations',title:'Automations',icon:'calendar',category:'Agent',groups:[{title:'Automations',rows:[],empty:'Loading…'}]},
 {id:'providers',title:'Providers',icon:'agent',category:'Agent',groups:[group('Connected',[]),group('Available',[])]},
 ...[['mcps','MCPs','plug'],['skills','Skills','deep'],['extensions','Extensions','puzzle'],['templates','Prompt templates','files']].map(([id,title,icon])=>({id,title,icon,category:'Agent',groups:[{title:'Resources',rows:[],empty:'Loading…'}]})),
 {id:'agent',title:'Agent behavior',icon:'bolt',category:'Agent',groups:[
  group('Execution',[select('execution-shell','Command shell','Native Bash',['Native Bash','PowerShell','System default']),toggle('allow-network','Browser & desktop tools',true,'Shell commands retain native OS network access.'),toggle('background-agents','Allow background agents',true)]),
  group('Transcript',[toggle('collapse-work','Collapse completed actions',true),toggle('show-reasoning','Show reasoning status',true),toggle('stream-markdown','Render Markdown while streaming',true)]),
 ]},
 {id:'context',title:'Context & memory',icon:'context',category:'Agent',groups:[
  group('Context window',[toggle('auto-compact','Automatic compaction',true),select('compact-at','Compact at','80%',['70%','80%','90%']),toggle('context-ring','Show context usage',true)]),
  group('Token savings',[toggle('defer-mcp-schemas','Load MCP tool details on demand',true,'Sends tool names and one-line descriptions; full schemas load on first use.'),toggle('compact-tool-results','Shorten large tool results',true,'The full text stays on this device and the agent can retrieve it by id.'),select('compact-limit','Shorten results over','2,000 tokens',['1,000 tokens','2,000 tokens','4,000 tokens','8,000 tokens'])]),
  group('Repository context',[toggle('project-instructions','Read project instructions',true),toggle('git-context','Include Git context',true),toggle('remember-context','Remember project context',false,'Reuse the last response in new sessions for this project.')]),
 ]},
 {id:'projects',title:'Projects & Git',icon:'branch',category:'Workspace',groups:[
  group('Projects',[select('project-open','Open projects in','Current window',['Current window','New window']),toggle('restore-project','Restore last project',true)]),
  group('Git',[select('worktree-location','Worktree location','Default',['Default','Custom location']),toggle('signoff','Ask the agent to sign off commits'),toggle('confirm-push','Confirm detected Git pushes',true)]),
 ]},
 {id:'files',title:'Files & editor',icon:'files',category:'Workspace',groups:[
  group('Explorer',[toggle('hidden-files','Show hidden files',true),toggle('gitignored','Show ignored files'),toggle('file-icons','Show file-type icons',true),select('file-sort','Sort files by','Name',['Name','Type','Modified'])]),
  group('Editor',[toggle('wrap-lines','Wrap long lines'),toggle('line-numbers','Line numbers',true),select('tab-size','Tab size','2 spaces',['2 spaces','4 spaces','8 spaces']),select('diff-layout','Default diff view','Unified',['Unified','Split'])]),
 ]},
 {id:'terminal',title:'Terminal',icon:'terminal',category:'Workspace',groups:[
  group('Shell',[select('terminal-shell','Default shell','Native Bash',['Native Bash','PowerShell','System default']),select('working-directory','Working directory','Thread project',['Thread project','Home directory']),toggle('restore-terminal','Restore terminal tabs',true)]),
  group('History',[select('scrollback','Scrollback','5,000 lines',['1,000 lines','5,000 lines','10,000 lines'])]),
 ]},
 {id:'archived',title:'Archived',icon:'archive',category:'Application',groups:[]},
 {id:'privacy',title:'Data & privacy',icon:'lock',category:'Application',groups:[
  group('On this device',[select('history-retention','Keep conversation history','Until deleted',['Until deleted','90 days','30 days']),toggle('save-attachments','Keep attached files',true,'When off, local copies are removed after the agent finishes.'),toggle('diagnostics','Save local diagnostics',false,'Error metadata stays on this computer.')]),
  group('Data',[{id:'export',label:'Export conversations',value:'Export',type:'action'},{id:'clear-cache',label:'Clear cached previews',value:'Clear cache',type:'action'}]),
 ]},
 {id:'about',title:'About',icon:'info',category:'Application',groups:[
  group('Suffice',[{label:'Desktop app',value:'Development',type:'text'},{label:'Harness',value:'Suffice',type:'text'},{label:'Preferences',value:'Saved on this device',type:'text'}]),
 ]},
];

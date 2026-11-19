const toggle=(id,label,value=false,detail='')=>({id,label,value,detail,type:'toggle'});
const select=(id,label,value,options,detail='')=>({id,label,value,options,detail,type:'select'});
const keys=(label,value)=>({label,value,type:'keys'});
const group=(title,rows)=>({title,rows});


export const settingsSections=[
 {id:'general',subtitle:'',title:'General',icon:'settings',category:'Personal',groups:[
  group('Defaults',[select('default-model','Default model','Last used',['Last used']),select('default-effort','Reasoning effort','Medium',['Low','Medium','High','Extra high','Max']),select('approval-mode','Permission mode','Ask when needed',['Ask before every action','Ask when needed','Never ask']),select('default-directory','Default directory','~/Suffice',['~/Suffice','Last used project','Home'])]),
  group('Application',[select('language','Language','System',['System','English']),select('send','Send messages with','Enter',['Enter','Ctrl + Enter']),toggle('startup','Launch at login'),toggle('tray','Keep running in the background',false)]),
  group('Conversations',[select('working-send','While agent is working','Steer',['Queue','Steer']),toggle('escape','Stop agent with Escape'),toggle('close-panel','Close right panel with its last tab'),select('naming','Thread naming','Automatic',['Automatic','First message','Untitled']),select('new-project','New threads use','Last used project',['Last used project','Ask each time'])]),
 ]},
 {id:'appearance',subtitle:'',title:'Appearance',icon:'monitor',category:'Personal',groups:[
  group('',[{id:'mode',label:'Mode',value:'Dark',options:['System','Light','Dark'],type:'themes'}]),
  group('',[{id:'palette',label:'Look',type:'gallery',value:'default',options:['default','oled','paper','graphite','claude','codex','nord','solarized','rose']},{id:'accent',label:'Accent color',value:'#7b9ed5',type:'palette'},toggle('glass','Translucent surfaces',true)]),
  group('Wallpaper',[select('background','Wallpaper','Pixel horizon',['Moonlit lake','ASCII gradient','Pixel horizon','Orbital','Oceanic Shimmer','None']),toggle('chat-background','Show in chat',true),toggle('settings-background','Show in settings',true),{id:'surface-opacity',label:'Wallpaper strength',type:'range',value:28,min:0,max:100},toggle('background-motion','Animate wallpaper',true)]),
  group('Layout',[select('density','Density','Comfy',['Compact','Comfy','Spacious']),select('chat-width','Chat width','Standard',['Narrow','Standard','Wide']),toggle('reduced-motion','Reduce motion')]),
  group('Type',[select('interface-font','Interface font','Inter',['Inter','Geist','Geist Mono','System']),select('text-size','Font size','13 px',['12 px','13 px','14 px','15 px']),select('code-font','Code font','JetBrains Mono',['JetBrains Mono','Geist Mono','System mono'])]),
 ]},
 {id:'notifications',subtitle:'',title:'Notifications',icon:'bell',category:'Personal',groups:[
  group('Notify me',[toggle('finished','Agent finished',true),toggle('approval','Approval needed',true),toggle('failed','Agent encountered an error',true),toggle('unfocused','Only when Suffice is in the background',true)]),
  group('Sound',[toggle('notification-sound','Play a sound'),select('sound','Notification sound','Soft',['Soft','Chime','Click'])]),
 ]},
 {id:'shortcuts',subtitle:'',title:'Shortcuts',icon:'keyboard',category:'Personal',groups:[
  group('Conversations',[keys('New session','Ctrl N'),keys('Search threads and commands','Ctrl K'),keys('Send message','Enter'),keys('Send in background','Ctrl Enter'),keys('New line','Shift Enter')]),
  group('Workspace',[keys('Toggle sidebar','Ctrl B'),keys('Go to file','Ctrl P'),keys('Toggle explorer','Ctrl \\'),keys('Open settings','Ctrl ,')]),
  group('Navigation',[keys('Previous / next item','↑ ↓'),keys('Open selection','Enter'),keys('Close menu','Esc')]),
 ]},
 {id:'account',subtitle:'',title:'Account',icon:'pin',category:'Personal',groups:[group('Profile',[{id:'avatar',label:'Profile picture',type:'avatar'},select('account-avatar','Use GitHub picture','GitHub',['GitHub','Initials']),toggle('sidebar-teamwork','Teamwork in sidebar')])]},
 {id:'models',subtitle:'',title:'Models',icon:'deep',category:'Agent',groups:[]},
 {id:'usage',subtitle:'',title:'Usage',icon:'chart',category:'Agent',groups:[
  group('Optimizer',[toggle('optimizer-hint','Suggest cheaper settings',true),toggle('optimizer-auto','Apply suggestions automatically',false)]),
 ]},
 {id:'automations',subtitle:'',title:'Automations',icon:'calendar',category:'Agent',groups:[{title:'Automations',rows:[],empty:'Loading…'}]},
 {id:'providers',subtitle:'',title:'Providers',icon:'globe',category:'Agent',groups:[group('Connected',[]),group('Available',[])]},
 ...[['mcps','Tools & MCP','plug'],['skills','Skills','code'],['extensions','Extensions','puzzle'],['templates','Prompt templates','files']].map(([id,title,icon])=>({id,subtitle:'',title,icon,category:'Agent',groups:[{title:'Resources',rows:[],empty:'Loading…'}]})),
 {id:'agent',subtitle:'',title:'Agent',icon:'bolt',category:'Agent',groups:[
  group('Ask bar',[toggle('local-agent','Screen-aware ask bar'),toggle('keys-trigger','Double-tap Option opens Suffice',true)]),
  group('Voice',[toggle('voice-input','Voice input',true),toggle('voice-auto-send','Send when speech ends')]),
  group('Execution',[select('execution-shell','Command shell','Native Bash',['Native Bash','PowerShell','System default']),toggle('allow-network','Browser & desktop tools',true),toggle('background-agents','Allow background agents',true)]),
  group('Computer use',[toggle('computer-use','Computer use sessions',false,'Lets an agent drive a web page for you. Risky steps wait for your approval.')]),
  group('Transcript',[toggle('collapse-work','Collapse completed actions',true),toggle('show-reasoning','Show reasoning status',true),toggle('stream-markdown','Render Markdown while streaming',true)]),
 ]},
 {id:'context',subtitle:'',title:'Context & memory',icon:'context',category:'Agent',groups:[
  group('Context window',[toggle('auto-compact','Automatic compaction',true),select('compact-at','Compact at','80%',['70%','80%','90%']),toggle('context-ring','Show context usage',true)]),
  group('Token savings',[toggle('defer-mcp-schemas','Load MCP tool details on demand',true),toggle('compact-tool-results','Shorten large tool results',true),select('compact-limit','Shorten results over','2,000 tokens',['1,000 tokens','2,000 tokens','4,000 tokens','8,000 tokens'])]),
  group('Repository context',[toggle('project-instructions','Read project instructions',true),toggle('git-context','Include Git context',true),toggle('remember-context','Remember project context',false)]),
 ]},
 {id:'projects',subtitle:'',title:'Projects & Git',icon:'branch',category:'Workspace',groups:[
  group('Projects',[select('project-open','Open projects in','Current window',['Current window','New window']),toggle('restore-project','Restore last project',true)]),
  group('Git',[select('worktree-location','Worktree location','Default',['Default','Custom location']),select('worktree-keep','Worktrees kept','15',['5','10','15','30','50'],'Oldest unpinned ones are removed beyond this'),toggle('signoff','Ask the agent to sign off commits'),toggle('confirm-push','Confirm detected Git pushes',true)]),
 ]},
 {id:'files',subtitle:'',title:'Files & editor',icon:'files',category:'Workspace',groups:[
  group('Explorer',[toggle('hidden-files','Show hidden files',true),toggle('gitignored','Show ignored files'),toggle('file-icons','Show file-type icons',true),select('file-sort','Sort files by','Name',['Name','Type','Modified'])]),
  group('Editor',[toggle('wrap-lines','Wrap long lines'),toggle('line-numbers','Line numbers',true),select('tab-size','Tab size','2 spaces',['2 spaces','4 spaces','8 spaces']),select('diff-layout','Default diff view','Unified',['Unified','Split'])]),
 ]},
 {id:'terminal',subtitle:'',title:'Terminal',icon:'terminal',category:'Workspace',groups:[
  group('Shell',[select('terminal-shell','Default shell','Native Bash',['Native Bash','PowerShell','System default']),select('working-directory','Working directory','Thread project',['Thread project','Home directory']),toggle('restore-terminal','Restore terminal tabs',true)]),
  group('History',[select('scrollback','Scrollback','5,000 lines',['1,000 lines','5,000 lines','10,000 lines'])]),
 ]},
 {id:'archived',subtitle:'',title:'Archived',icon:'archive',category:'Application',groups:[]},
 {id:'privacy',subtitle:'',title:'Data & privacy',icon:'lock',category:'Application',groups:[
  group('On this device',[select('history-retention','Keep conversation history','Until deleted',['Until deleted','90 days','30 days']),toggle('save-attachments','Keep attached files',true),toggle('diagnostics','Save local diagnostics',false)]),
  group('Data',[{id:'export',label:'Export conversations',value:'Export',type:'action'},{id:'clear-cache',label:'Clear cached previews',value:'Clear cache',type:'action'}]),
 ]},
 {id:'about',subtitle:'',title:'About',icon:'info',category:'Application',groups:[
  group('Suffice',[{label:'Desktop app',value:'Development',type:'text'},{label:'Harness',value:'Suffice',type:'text'},{label:'Preferences',value:'Saved on this device',type:'text'}]),
 ]},
];
// Nav shows these 9 tabs; each stacks its member sections on one page.
export const settingsTabs=[['general','General','settings',['general','notifications','privacy','archived','about']],['appearance','Appearance','monitor',['appearance']],['models','Models','deep',['models','providers']],['agent','Agent','bolt',['agent','context','automations']],['mcps','Tools & MCP','plug',['mcps','skills','extensions','templates']],['usage','Usage','chart',['usage']],['projects','Projects','branch',['projects','files','terminal']],['shortcuts','Shortcuts','keyboard',['shortcuts']],['account','Account','pin',['account']]].map(([id,title,icon,sections])=>({id,title,icon,sections}));

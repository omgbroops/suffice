// Release notes for the sheet. `try` says how the button opens the feature; main.js maps it to a real action.
export const RELEASE='2026-11-18';
export const WHATS_NEW=[
 {id:'palette',title:'Command menu',line:'Search threads, sessions and every action in one place.',entry:['mod','K'],try:{palette:''}},
 {id:'tasks',title:'Task board',line:'Queued, running, needs you and done, with a run limit.',entry:['Cmd+K','Tasks'],try:{palette:'Tasks'}},
 {id:'needs-you',title:'Needs you',line:'Everything waiting on you, with one-click approve or deny.',entry:['Sidebar'],try:{event:'suffice-open-needs-you'}},
 {id:'issues',title:'Issues',line:'Local issues with an agent assignee and linked threads.',entry:['Cmd+K','Issues'],try:{event:'suffice-open-issues'}},
 {id:'thread-menu',title:'Fork and export',line:'Fork at any message, side chat, export as Markdown or HTML.',entry:['Right-click a thread'],try:{threadMenu:true}},
 {id:'ask-screen',title:'Ask about my screen',line:'Global shortcut, screenshot, then send it to a thread.',entry:['Cmd+K','Ask about my screen'],try:{palette:'Ask about my screen'}},
 {id:'rewind',title:'Rewind',line:'Restore the working tree to any earlier turn.',entry:['Right panel','Timeline'],try:{composer:true}},
 {id:'worktree',title:'Worktree runs and Best-of-N',line:'Run a thread in its own worktree, or compare several runs.',entry:['Composer','Send menu'],try:{composer:true}},
 {id:'context',title:'Context inspector',line:'See what each turn carries and remove items.',entry:['Composer','Token chip'],try:{composer:true}},
 {id:'skills',title:'Skills and MCP',line:'Attach skills, switch MCP servers on per project.',entry:['Composer','+ menu'],try:{composer:true}},
 {id:'automations',title:'Automations',line:'Run on a schedule, on git push or on file change.',entry:['Settings','Automations'],try:{settings:'automations'}},
 {id:'usage',title:'Usage',line:'Spend and token caps, with hints while you type.',entry:['Settings','Usage'],try:{settings:'usage'}}
];
const KEY='suffice-whats-new-seen';
export const seen=()=>{try{return localStorage.getItem(KEY);}catch{return null;}};
export const markSeen=()=>{try{localStorage.setItem(KEY,RELEASE);}catch{}};

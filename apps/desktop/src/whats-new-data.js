// Release notes for the sheet, grouped by SECTIONS (banner + heading colour). `try` says how the button opens the feature; main.js maps it to a real action.
export const RELEASE='2026-11-18';
export const SECTIONS=[{id:'find',title:'Find and ask',tint:[44,112,176]},{id:'work',title:'Run work',tint:[196,122,72]},{id:'threads',title:'Threads',tint:[52,128,132]},{id:'context',title:'Context',tint:[132,112,190]}];
export const WHATS_NEW=[
 {id:'palette',section:'find',title:'Command menu',line:'Search threads, sessions and every action in one place.',try:{palette:''}},
 {id:'tasks',section:'work',title:'Task board',line:'Queued, running, needs you and done, with a run limit.',try:{palette:'Tasks'}},
 {id:'needs-you',section:'work',title:'Needs you',line:'Everything waiting on you, with one-click approve or deny.',try:{event:'suffice-open-needs-you'}},
 {id:'issues',section:'work',title:'Issues',line:'Local issues with an agent assignee and linked threads.',try:{event:'suffice-open-issues'}},
 {id:'thread-menu',section:'threads',title:'Fork and export',line:'Fork at any message, side chat, export as Markdown or HTML.',try:{threadMenu:true}},
 {id:'ask-screen',section:'find',title:'Ask about my screen',line:'Global shortcut, screenshot, then send it to a thread.',try:{palette:'Ask about my screen'}},
 {id:'rewind',section:'threads',title:'Rewind',line:'Restore the working tree to any earlier turn.',try:{composer:true}},
 {id:'worktree',section:'threads',title:'Worktree runs and Best-of-N',line:'Run a thread in its own worktree, or compare several runs.',try:{composer:true}},
 {id:'context',section:'context',title:'Context inspector',line:'See what each turn carries and remove items.',try:{composer:true}},
 {id:'skills',section:'context',title:'Skills and MCP',line:'Attach skills, switch MCP servers on per project.',try:{composer:true}},
 {id:'automations',section:'work',title:'Automations',line:'Run on a schedule, on git push or on file change.',try:{settings:'automations'}},
 {id:'usage',section:'find',title:'Usage',line:'Spend and token caps, with hints while you type.',try:{settings:'usage'}}
];
const KEY='suffice-whats-new-seen';
export const seen=()=>{try{return localStorage.getItem(KEY);}catch{return null;}};
export const markSeen=()=>{try{localStorage.setItem(KEY,RELEASE);}catch{}};

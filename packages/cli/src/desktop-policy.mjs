export function requiresDesktopApproval(prefs,name,input){
 if(!prefs)return false;
 const detectedPush=prefs['confirm-push']&&/\bgit\s+push\b/i.test(JSON.stringify(input));
 const readOnly=/^(read|symbols|symbol_read|symbol_references|search|list|glob|grep|find|ls)$/.test(name);
 return !!detectedPush||prefs['approval-mode']==='Ask before every action'||prefs['approval-mode']==='Ask when needed'&&!readOnly;
}

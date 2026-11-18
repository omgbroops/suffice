// Copy-as-Markdown text for one message: a role heading, the body as written, then attachment names.
export function messageAsMarkdown(role,text,attachments=[]){
 const names=attachments.map(file=>file.name).filter(Boolean);
 return `### ${role==='user'?'You':'Suffice'}\n\n${String(text).trim()}${names.length?'\n\n'+names.map(name=>`- ${name}`).join('\n'):''}\n`;
}

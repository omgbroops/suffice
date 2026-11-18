// Provider names describe the selected service, not the shared wire-protocol adapter.
export function displayRunError(message,provider){
 // Electron prefixes ipcRenderer.invoke rejections; users never need it.
 const text=String(message||'').replace(/^Error invoking remote method '[^']*': (?:Error: )?/,'');
 if(/(?:OpenAI Responses stream ended before a terminal response event|Anthropic stream ended before message_stop)/i.test(text)){
  const name=({xai:'Grok',openai:'OpenAI','openai-codex':'OpenAI',anthropic:'Claude',google:'Gemini',openrouter:'OpenRouter'})[provider]||'The provider';
  return `${name}'s response stream ended before completion. Please try again.`;
 }
 return text;
}

// How Suffice writes: the base rules every model gets, plus a drafting pass for high effort.

export const VOICE_RULES=`Voice. Write like a sharp colleague talking, in plain words.
- Answer first, in the first sentence. A greeting or a question gets one to three sentences. Longer only when the task needs it.
- Never introduce yourself or say what you are, unless asked. If asked what you are, answer with the name and role in one short clause, never starting with \"I'm\".
- Never narrate your environment: no working directory, whether it is a git repo, file lists or sizes, process tree, config, model name or tools, unless the user asks or the answer depends on it. Never say a folder is or is not a git repo for a general question; answer as if the question is about their own project.
- A message that is not a task (greeting, small talk, a question) gets a direct reply. Do not inspect files or run tools for it.
- Do not ask the user to list what they want. If something is missing, ask one short question, or make a sensible guess and say it.
- No closing offers or questions ("Want me to...?", "Let me know if..."). Stop when the answer is done: the last sentence is the answer, never a request to paste, send or share something, never an \"if it still fails\" branch.
- No em dashes; use a comma, a period or a colon. No exclamation marks, emoji or filler openers ("Great question", "Sure", "Certainly", "Honestly", "Here's the thing").
- No signposting ("Let's dive in", "Here's what you need to know", "Concretely,", "A couple of practical implications") and no summary of what you just said.
- No hype or filler words: seamless, robust, powerful, leverage, utilize, ensure, simply, just, easily, crucial, pivotal.
- No "not just X, it's Y", no lists of three adjectives, no tables or headings for small answers. Use a list only for steps or parallel items.
- Report code work as what changed and what was checked, in a few lines.
- The task instructions below apply only when the user asks for a change. For anything else, just reply.
- General questions (a language, a git error, a concept) get a direct answer from what you know, in a few sentences. Do not search the machine for them; when the cause is uncertain, give the likely causes with a fix for each; never ask the user for output.
- Examples. "hi" -> "Hi. What are you working on?" "what are you" -> "Suffice, a coding agent." "what can you do here" -> "Read, edit and run code, and work with the files in this folder." "why is my push rejected" -> "Usually the remote has commits you lack: run git pull --rebase, then push again." "thanks" -> "Anytime." "tabs or spaces?" -> "Spaces, unless the project already uses tabs. Pick one and let a formatter enforce it." "fix the typo in notes.txt" -> "Fixed \"shoud\" to \"should\" in notes.txt."
- Mention another Suffice product only when it directly solves what the user is doing, at most once per thread, in one plain clause, never as a pitch.`;

export const DRAFT_RULES=`Before you answer, draft the reply in your reasoning. Then make two passes over the draft: first cut every sentence, clause and word that repeats or adds nothing; then read it aloud in your head and fix the flow so each sentence follows from the last. Check the result against the voice rules above. Write only the final version as your answer.`;

// Pi thinking levels. Low and below get the short ruleset only.
export const DEEP_EFFORTS=['high','xhigh','max'];

export function withEffortRules(prompt,effort){return DEEP_EFFORTS.includes(effort)&&!prompt.includes(DRAFT_RULES)?prompt+'\n\n'+DRAFT_RULES:prompt;}
export const voicePrompt=effort=>withEffortRules(VOICE_RULES,effort);

export const TITLE_SYSTEM=`You name chat threads. Reply with the title only: 2 to 5 words, sentence case, no quotes, no trailing period, no em dashes, no commentary. Describe the topic or task, like "Casual greeting", "Fix greeting typo" or "Add retry to fetch helper". Never copy the user's message.`;

const WORDS=/[A-Za-z0-9]/;
// Returns a clean 2-5 word title, or '' when the model output is unusable.
export function cleanTitle(raw){
 let t=String(raw??'').split(/\r?\n/).map(s=>s.trim()).find(Boolean)??'';
 t=t.replace(/^(?:title|thread|name)\s*:\s*/i,'').replace(/^["'`*#\s]+|["'`*\s.!?:;,]+$/g,'');
 if(/[—–]|\s-\s/.test(t))t=t.split(/\s*(?:[—–]|\s-\s)\s*/)[0].trim();
 const words=t.split(/\s+/).filter(w=>WORDS.test(w));
 if(words.length<1||words.length>5||t.length>60)return '';
 return words[0][0].toUpperCase()+words.join(' ').slice(1);
}

// Cheap fallback when the provider fails: the first few words, never the whole message.
export function fallbackTitle(prompt){
 const words=String(prompt??'').replace(/^(?:please\s+|can you\s+|could you\s+)/i,'').split(/[\n.!?]/)[0].trim().split(/\s+/).filter(w=>WORDS.test(w)).slice(0,4);
 const t=words.join(' ').replace(/[—–]/g,',');
 return t?t[0].toUpperCase()+t.slice(1):'New chat';
}

// Copy tells from the deslop copy checklist, used by tests and the measurement script.
export const SLOP_PATTERNS={
 emdash:/[—–]/g,
 exclaim:/!/g,
 emoji:/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu,
 selfIntro:/\bI['’]m Suffice\b|\bI am Suffice\b|\bI['’]m (?:an? )?(?:AI|assistant|coding agent)\b/gi,
 closer:/\b(?:paste (?:it|the)|send me|share the (?:error|output|log)|want me to|let me know if|i hope this helps|feel free to|happy to help|ready to help)\b/gi,
 signpost:/\b(?:let['’]s dive|here['’]s (?:what|the thing)|concretely,|a couple of (?:practical )?implications|it['’]s important to note|in today['’]s)/gi,
 candid:/\b(?:honestly\?|read that again|great question|certainly!|absolutely!)/gi,
 hype:/\b(?:unlock|elevate|empower|supercharge|seamless(?:ly)?|robust|cutting-edge|game-changer|effortless(?:ly)?|leverage|utilize|ensure|simply|easily|crucial|pivotal)\b/gi,
 notJust:/\bnot just\b[^.]{0,60}\b(?:it['’]s|but)\b/gi,
 envNarration:/\b(?:process tree|working directory|environment config|\bpid\b)/gi,
};
export function slopHits(text){let n=0;for(const re of Object.values(SLOP_PATTERNS))n+=(String(text).match(re)||[]).length;return n;}

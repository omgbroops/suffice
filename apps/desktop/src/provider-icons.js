const aliases={
 'amazon-bedrock':'bedrock','github-copilot':'githubcopilot','google':'gemini','google-vertex':'googlecloud',
 'kimi-coding':'kimi','minimax-cn':'minimax','moonshotai':'moonshot','moonshotai-cn':'moonshot',
 'google-gemini-cli':'gemini','azure-openai-responses':'azure','openai-codex':'openai','opencode-go':'opencode','vercel-ai-gateway':'vercel',
 'zai-coding-cn':'zai','ant-ling':'ling','cloudflare-ai-gateway':'cloudflare','cloudflare-workers-ai':'cloudflare',
 'qwen-token-plan':'qwen','qwen-token-plan-cn':'qwen','qwen-token-plan-individual':'qwen','typesafe':'typesafeai',
 xiaomi:'xiaomimimo','xiaomi-token-plan-ams':'xiaomimimo','xiaomi-token-plan-cn':'xiaomimimo','xiaomi-token-plan-sgp':'xiaomimimo',
};
const available=new Set(['openai','anthropic','azure','cohere','deepseek','gemini','groq','mistral','ollama','openrouter','xai','huggingface','kimi','meta','minimax','moonshot','nvidia','opencode','bedrock','cerebras','githubcopilot','googlecloud','fireworks','together','venice','vercel','zai','perplexity','baseten','cloudflare','ling','qwen','typesafeai','xiaomimimo']);
export function providerIcon(id){const key=aliases[id]||id;return available.has(key)?key:null;}

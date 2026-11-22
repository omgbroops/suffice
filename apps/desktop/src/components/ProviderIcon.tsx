// Provider marks from Lobe Icons (MIT), see src/assets/providers/NOTICE.md.
// Each is a single-colour SVG drawn in currentColor, inlined so it takes the
// text colour around it.
const files = import.meta.glob('../assets/providers/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const SVG: Record<string, string> = Object.fromEntries(Object.entries(files).map(([path, svg]) => [path.split('/').pop()!.replace(/\.svg$/, ''), svg]))

/** Which provider's mark a model gets: from its id, falling back to the provider it is served by. */
const RULES: [RegExp, string][] = [
  [/^(gpt|o\d|codex|chatgpt|davinci)/i, 'openai'],
  [/claude/i, 'anthropic'],
  [/gemini|gemma/i, 'gemini'],
  [/deepseek/i, 'deepseek'],
  [/grok/i, 'xai'],
  [/mistral|codestral|devstral|magistral/i, 'mistral'],
  [/qwen|qwq/i, 'qwen'],
  [/kimi/i, 'kimi'],
  [/moonshot/i, 'moonshot'],
  [/glm|zai/i, 'zai'],
  [/llama/i, 'meta'],
  [/minimax/i, 'minimax'],
  [/nemotron/i, 'nvidia'],
  [/command/i, 'cohere'],
  [/sonar/i, 'perplexity'],
  [/mimo/i, 'xiaomimimo'],
]

export function providerOf(id: string, provider?: string) {
  return RULES.find(([re]) => re.test(id))?.[1] ?? (provider && SVG[provider] ? provider : undefined)
}

export function ProviderIcon({ id, provider, size = 14, className }: { id: string; provider?: string; size?: number; className?: string }) {
  const name = providerOf(id, provider)
  const svg = name && SVG[name]
  if (!svg) return <span className={`prov-icon is-empty ${className ?? ''}`} style={{ width: size, height: size }} aria-hidden />
  return <span className={`prov-icon ${className ?? ''}`} style={{ fontSize: size, width: size, height: size }} aria-hidden dangerouslySetInnerHTML={{ __html: svg }} />
}

export const PROVIDER_NAME: Record<string, string> = { openai: 'OpenAI', anthropic: 'Anthropic', gemini: 'Google', deepseek: 'DeepSeek', xai: 'xAI', mistral: 'Mistral', qwen: 'Qwen', kimi: 'Kimi', moonshot: 'Moonshot', zai: 'Z.ai', meta: 'Meta', minimax: 'MiniMax', nvidia: 'NVIDIA', cohere: 'Cohere', perplexity: 'Perplexity', xiaomimimo: 'Xiaomi' }

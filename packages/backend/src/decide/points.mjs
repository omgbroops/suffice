// Built-in decision points: input schema, output schema, safe default, failClosed flag.
// `closed` (optional) is the value used on failure when failClosed, if stricter than the no-config default.
const str = { type: 'string' }, num = { type: 'number' }, int = { type: 'integer', minimum: 0 }, bool = { type: 'boolean' };
const conf = { type: 'number', minimum: 0, maximum: 1 }, strs = { type: 'array', items: str };
const obj = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required });

export const POINTS = {
  'model.select': { input: obj({ kind: str, promptTokens: num, difficulty: str, budgetRemaining: num, stepPath: str }, []),
    output: obj({ runner: str, model: str, effort: { enum: ['low', 'medium', 'high'] } }), default: { runner: 'default', model: 'default', effort: 'medium' } },
  'model.escalate': { input: obj({ attempt: int, failure: str, tried: strs }, ['attempt']),
    output: obj({ escalate: bool, model: str }), default: { escalate: false, model: '' } },
  'tool.select': { input: obj({ candidates: strs, goal: str }, ['candidates']),
    output: obj({ tool: str }), default: { tool: '' } }, // '' = no preference, caller picks
  'action.approve': { input: obj({ tool: str, action: str, target: str, riskTags: strs }, ['tool', 'action']),
    output: obj({ decision: { enum: ['allow', 'ask', 'deny'] }, reason: str }), default: { decision: 'ask', reason: 'no policy configured' },
    closed: { decision: 'deny', reason: 'decision failed' }, failClosed: true },
  'step.verify': { input: obj({ claims: strs, evidence: str }, ['claims']),
    output: obj({ ok: bool, confidence: conf, reason: str }), default: { ok: false, confidence: 0, reason: 'unverified' }, failClosed: true },
  'run.continue': { input: obj({ steps: int, progress: num, budgetRemaining: num }, ['steps']),
    output: obj({ continue: bool, reason: str }), default: { continue: true, reason: 'default' } },
  'context.load': { input: obj({ candidates: { type: 'array', items: obj({ id: str, size: num }) }, budget: num }, ['candidates', 'budget']),
    output: obj({ keep: strs }), default: { keep: [] } },
  'context.compact': { input: obj({ size: num, limit: num }, ['size', 'limit']),
    output: obj({ compact: bool, keepLast: int }), default: { compact: false, keepLast: 10 } },
  'computer.observe': { input: obj({ target: str, lastAction: str, modes: strs }, []), // target = app or url
    output: obj({ mode: { enum: ['tree', 'snapshot', 'screenshot', 'hybrid'] }, depth: int }), default: { mode: 'snapshot', depth: 3 } },
  'computer.ground': { input: obj({ instruction: str, elements: { type: 'array', items: obj({ ref: str, label: str }, ['ref']) } }, ['instruction', 'elements']),
    output: obj({ ref: str, confidence: conf }), default: { ref: '', confidence: 0 }, failClosed: true },
  'computer.act': { input: obj({ goal: str, observation: str, allowed: strs }, ['goal']),
    output: obj({ action: str, ref: str, text: str }), default: { action: 'none', ref: '', text: '' }, failClosed: true },
  'computer.check': { input: obj({ expected: str, before: str, after: str }, []),
    output: obj({ ok: bool, reason: str }), default: { ok: false, reason: 'unverified' }, failClosed: true },
  'voice.turn': { input: obj({ silenceMs: num, partial: str }, ['silenceMs']),
    output: obj({ end: bool }), default: { end: false } },
};

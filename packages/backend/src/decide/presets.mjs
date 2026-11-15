// Presets: one decider spec per built-in point. Scripts named builtin:* are registered by createDecider.
const m = (model, runner = 'default') => ({ kind: 'model', runner, model });
const k = (output) => ({ kind: 'constant', output });
const sc = (id) => ({ kind: 'script', id });
const V = (n) => ({ var: n });
const rule = (rules, d) => ({ kind: 'rule', rules, default: d });
const sel = (model, effort) => ({ runner: 'default', model, effort });
const NO = { escalate: false, model: '' };
const stopOnBudget = { when: { lte: [V('budgetRemaining'), 0] }, then: { continue: false, reason: 'budget exhausted' } };

const balanced = {
  'model.select': rule([{ when: { eq: [V('difficulty'), 'hard'] }, then: sel('large', 'high') }], sel('medium', 'medium')),
  'model.escalate': rule([
    { when: { in: ['large', V('tried')] }, then: NO },
    { when: { lt: [V('attempt'), 2] }, then: { escalate: true, model: 'large' } }], NO),
  'tool.select': sc('builtin:first'),
  'action.approve': k({ decision: 'ask', reason: 'approval required' }),
  'step.verify': m('medium'),
  'run.continue': rule([stopOnBudget], { continue: true, reason: 'progressing' }),
  'context.load': sc('builtin:fit'),
  'context.compact': sc('builtin:compact'),
  'computer.observe': k({ mode: 'snapshot', depth: 3 }),
  'computer.ground': m('small'),
  'computer.act': m('medium'),
  'computer.check': sc('builtin:changed'),
  'voice.turn': rule([{ when: { gte: [V('silenceMs'), 800] }, then: { end: true } }], { end: false }),
};

export const PRESETS = {
  balanced,
  cheap: {
    ...balanced,
    'model.select': { kind: 'table', keys: ['difficulty'], rows: [{ when: { difficulty: 'hard' }, then: sel('medium', 'medium') }], default: sel('small', 'low') },
    'model.escalate': rule([
      { when: { in: ['large', V('tried')] }, then: NO },
      { when: { in: ['medium', V('tried')] }, then: { escalate: true, model: 'large' } },
      { when: { gte: [V('attempt'), 1] }, then: { escalate: true, model: 'medium' } }], NO),
    'step.verify': m('small'),
    'computer.act': m('small'),
    'computer.observe': k({ mode: 'tree', depth: 2 }),
  },
  quality: {
    ...balanced,
    'model.select': k(sel('large', 'high')),
    'tool.select': m('medium'),
    'step.verify': m('large'),
    'computer.ground': m('medium'),
    'computer.act': m('large'),
    'computer.check': m('large'),
    'computer.observe': k({ mode: 'hybrid', depth: 4 }),
  },
  'local-first': {
    ...balanced,
    'model.select': k({ runner: 'local', model: 'small', effort: 'medium' }),
    'tool.select': m('small', 'local'),
    'step.verify': m('small', 'local'),
    'computer.ground': m('small', 'local'),
    'computer.act': m('small', 'local'),
  },
  careful: {
    ...balanced,
    'action.approve': rule([{ when: { gt: [V('riskTags.length'), 0] }, then: { decision: 'ask', reason: 'risk tags present' } }], { decision: 'ask', reason: 'careful mode' }),
    'step.verify': m('large'),
    'run.continue': rule([stopOnBudget, { when: { and: [{ gt: [V('steps'), 20] }, { lt: [V('progress'), 0.05] }] }, then: { continue: false, reason: 'no progress' } }], { continue: true, reason: 'progressing' }),
    'computer.check': m('large'),
    'computer.observe': k({ mode: 'hybrid', depth: 3 }),
  },
};

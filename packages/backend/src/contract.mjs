// Shared contract for the Suffice orchestration backend.
// Every module lives in its own folder under packages/backend/src/<module>/, exports a factory
// `create<Module>(deps)` from its index.mjs, takes its collaborators as plain objects (never
// imports another module's internals), and has tests in packages/backend/test/<module>.test.mjs.
// No third-party dependencies: Node built-ins only. No package.json here on purpose, so the
// repo's lockfiles do not change.
//
// Typedefs only; the single runtime export is `assertShape`, used by modules to check injected deps.

/**
 * @typedef {Object} Clock
 * @property {() => number} now  milliseconds since epoch; injected so tests are deterministic
 */

/**
 * One line of the journal. Append-only JSONL on disk, one file per run.
 * @typedef {Object} JournalEvent
 * @property {number} seq        1-based, assigned by the journal, strictly increasing
 * @property {number} ts         Clock.now() at append
 * @property {string} runId
 * @property {string} type       e.g. 'run.start', 'step.start', 'step.result', 'step.error', 'gate', 'budget', 'watchdog', 'run.end'
 * @property {string} [stepKey]  stable key of a memoized step
 * @property {*} [data]          JSON-serialisable payload
 */

/**
 * @typedef {Object} Journal
 * @property {(e: {type: string, stepKey?: string, data?: any}) => Promise<JournalEvent>} append
 * @property {() => Promise<JournalEvent[]>} read             all events of this run, in order
 * @property {(stepKey: string) => Promise<{hit: boolean, value?: any}>} lookup   result of a finished step, for resume
 * @property {string} runId
 */

/**
 * @typedef {Object} Bus
 * @property {(type: string, fn: (payload: any) => void) => () => void} on   returns an unsubscribe function
 * @property {(type: string, payload: any) => void} emit                    a throwing listener never breaks emit
 */

/**
 * What an agent runner is asked to do. A runner is the only thing that talks to a model.
 * @typedef {Object} AgentRequest
 * @property {string} prompt
 * @property {string} [model]      provider-neutral name; the runner maps it
 * @property {string} [label]
 * @property {Object} [schema]     JSON Schema for a structured result
 * @property {string} [cwd]
 * @property {AbortSignal} [signal]
 */

/**
 * @typedef {Object} AgentResult
 * @property {boolean} ok
 * @property {string} [text]
 * @property {*} [value]           parsed structured result when a schema was given
 * @property {string} [error]
 * @property {{inputTokens: number, outputTokens: number}} usage   zeros when unknown, never undefined
 * @property {number} ms
 */

/**
 * @typedef {Object} Runner
 * @property {(req: AgentRequest) => Promise<AgentResult>} run
 */

/**
 * A shell command result. `code` is the command's own exit code; modules gate on it, never on output text.
 * @typedef {Object} ExecResult
 * @property {number} code
 * @property {string} stdout
 * @property {string} stderr
 * @property {boolean} timedOut
 */

/**
 * @typedef {(cmd: string, args: string[], opts?: {cwd?: string, timeoutMs?: number, env?: Object}) => Promise<ExecResult>} Exec
 */

/**
 * @typedef {Object} BudgetDecision
 * @property {boolean} allow
 * @property {string} [reason]     plain words when allow is false
 * @property {number} remaining    tokens left in the tightest window
 */

/**
 * @typedef {Object} Budget
 * @property {(estimateTokens: number, tags?: Object) => BudgetDecision} check
 * @property {(usage: {inputTokens: number, outputTokens: number}, tags?: Object) => void} record
 */

/**
 * A plugin manifest (plugin.json in the plugin's folder).
 * @typedef {Object} PluginManifest
 * @property {string} name          lowercase letters, digits and dashes; also the namespace of everything it registers
 * @property {string} version       exact semver
 * @property {string} main          relative path of the ESM entry file
 * @property {string[]} [activation]   events that load it ('onStart', 'onCommand:<name>', 'onWorkflow:<name>', 'onEvent:<type>'); default lazy
 * @property {string[]} [permissions]  subset of 'fs.read','fs.write','exec','net','model','secrets','ui'
 * @property {Object} [contributes]    {commands?, workflows?, runners?, tools?, voices?, panels?}: names only; the code registers them at activation
 */

/**
 * A reader slot: one named, typed piece of state the UI may read and subscribe to. The UI never
 * reaches into modules; it reads slots. Values are plain JSON.
 * @typedef {Object} SlotDef
 * @property {string} id            "<namespace>:<name>", e.g. "runs:list", "run:<runId>:timeline"
 * @property {string} title
 * @property {Object} schema        JSON Schema of the value
 * @property {string[]} [actions]   ids of commands the UI may invoke from this slot
 * @property {'public'|'user'|'secret'} [sensitivity]  'secret' slots are never sent to a UI reader
 */

/**
 * @typedef {Object} Slots
 * @property {(def: SlotDef, initial: any) => {set: (value: any) => void, patch: (partial: Object) => void, remove: () => void}} define
 * @property {(id: string) => {value: any, version: number} | undefined} read
 * @property {(idOrPrefix: string, fn: (id: string, value: any, version: number) => void) => () => void} subscribe
 * @property {() => SlotDef[]} catalog     what the UI can see and use, for discovery
 */

/**
 * An encrypted document envelope, the unit stored on disk and passed between programs.
 * JSON on the outside, ciphertext inside; readable only with the vault key.
 * @typedef {Object} SealedDoc
 * @property {'suffice.sealed'} format
 * @property {1} v
 * @property {string} kind          application type of the payload, e.g. "workflow", "view", "session", "settings"
 * @property {string} id
 * @property {string} alg           "A256GCM"
 * @property {string} kid           key id
 * @property {string} iv            base64
 * @property {string} tag           base64
 * @property {string} ct            base64 ciphertext of the JSON payload
 * @property {Object} [meta]        unencrypted, non-sensitive: {created, modified, schema}
 */

/**
 * A declarative view: data plus how to lay it out. The backend never emits HTML or styles; the
 * frontend skin renders ViewSpecs, so the look stays with the designer.
 * @typedef {Object} ViewSpec
 * @property {'suffice.view'} format
 * @property {1} v
 * @property {string} type          'list'|'table'|'board'|'timeline'|'graph'|'tree'|'calendar'|'gallery'|'canvas'|'detail'|'feed'|'chart'|'split'|'tabs' or "<plugin>:<type>"
 * @property {string} title
 * @property {string} [slot]        slot id that supplies the data, when live
 * @property {*} [data]             inline data when not live
 * @property {Object} [fields]      field name -> {label, role, format}; roles such as 'title','status','date','start','end','group','source','target','value','image'
 * @property {Object} [options]     type-specific layout options (sort, groupBy, filters, density)
 * @property {ViewSpec[]} [children] for 'split' and 'tabs'
 * @property {string[]} [actions]
 */

/** Throws a TypeError naming the first missing or non-function member. */
export function assertShape(name, obj, methods) {
  if (!obj || typeof obj !== 'object') throw new TypeError(`${name}: expected an object`);
  for (const m of methods) if (typeof obj[m] !== 'function') throw new TypeError(`${name}.${m}: expected a function`);
  return obj;
}

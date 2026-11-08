import {resolve} from 'node:path';
import {homedir} from 'node:os';

export const VERSION = '0.1.0-alpha.2';
export const HELP = `Suffice ${VERSION}
Usage: suffice [options] [task]

  suffice                         Start an interactive session
  suffice "fix the failing test"  Start with a task
  suffice --print "explain this"  Run one task, then exit
  suffice login                   Sign in with your own OpenAI account
  suffice doctor                  Check local setup without model inference

Options:
  --cwd PATH          Starting repository (default: current directory)
  --model ID          gpt-6.1-sol (default), gpt-6-luna, or another catalog ID
  --effort LEVEL      off, minimal, low (default), medium, high, xhigh
  --continue          Continue the most recent session in this repository
  --semantic          Enable experimental compiler graph and impact tools
  --recipes           Also enable verified transformation tools (requires --semantic)
  --auto-context      Attach experimental compact context to ordinary reads
  --auto-impact       Attach cached impact evidence after relevant edits
  --auto-verify       Attach deterministic candidate verification plans
  --context-mode MODE semantic (default) or ast for automatic read context
  --packet-tokens N   Automatic packet ceiling, 1-400 (default: 400)
  --context-tokens N  Total automatic context token ceiling (default: 1200)
  --home PATH         Credential/session directory (default: ~/.suffice)
  --max-cost USD      API-equivalent allowance per task (default: 10)
  --timeout SECONDS   Time allowance per task (default: 600)
  --print, -p         Print final answer; task may also come from stdin
  --help, -h          Show this help
  --version, -v       Show version

Interactive: Pi's terminal UI, with /project, /login, /model, /settings, /resume.
Ctrl+C cancels a running task. Ctrl+D exits at an empty prompt.
Commands run with your user permissions. Use a trusted repository.
Pi's interface and engine, with Suffice's tools, prompt and codemode setup.
`;

export function parseOptions(args, env=process.env) {
  const options = {cwd:process.cwd(), home:env.SUFFICE_HOME || resolve(homedir(), '.suffice'), model:'gpt-6.1-sol', effort:'low', maxCost:10, timeout:600, prompt:''};
  const values = {'--cwd':'cwd','--home':'home','--model':'model','--effort':'effort','--max-cost':'maxCost','--timeout':'timeout','--context-mode':'contextMode','--packet-tokens':'packetTokens','--context-tokens':'contextTokens'};
  const words=[];
  for(let i=0;i<args.length;i++) {
    const arg=args[i];
    if(arg==='--') { words.push(...args.slice(i+1)); break; }
    if(['--help','-h'].includes(arg)) options.help=true;
    else if(['--version','-v'].includes(arg)) options.version=true;
    else if(['--print','-p'].includes(arg)) options.print=true;
    else if(arg==='--continue') options.continue=true;
    else if(arg==='--semantic') options.semantic=true;
    else if(arg==='--recipes') options.recipes=true;
    else if(arg==='--auto-context') options.autoContext=true;
    else if(arg==='--auto-impact') options.autoImpact=true;
    else if(arg==='--auto-verify') options.autoVerify=true;
    else if(values[arg]) { if(!args[i+1] || args[i+1].startsWith('--')) throw new Error(`Missing value for ${arg}`); options[values[arg]]=args[++i]; if(arg==='--cwd') options.cwdExplicit=true; }
    else if(arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else words.push(arg);
  }
  if(words.length===1 && ['login','doctor'].includes(words[0])) options.command=words[0];
  else options.prompt=words.join(' ');
  if(options.recipes && !options.semantic) throw new Error('--recipes requires --semantic');
  if(options.contextMode&&!['ast','semantic'].includes(options.contextMode))throw new Error('Context mode must be ast or semantic');
  for(const key of ['packetTokens','contextTokens'])if(options[key]!==undefined){options[key]=Number(options[key]);if(!Number.isInteger(options[key])||options[key]<1||key==='packetTokens'&&options[key]>400)throw new Error('Invalid automatic context token budget');}
  if(!['off','minimal','low','medium','high','xhigh'].includes(options.effort)) throw new Error('Invalid effort. Use off, minimal, low, medium, high, or xhigh.');
  for(const key of ['maxCost','timeout']) {
    options[key]=Number(options[key]);
    if(!Number.isFinite(options[key]) || options[key]<=0) throw new Error(`${key} must be a positive number`);
  }
  options.cwd=resolve(options.cwd); options.home=resolve(options.home);
  return options;
}

import {resolve} from 'node:path';
import {homedir} from 'node:os';
import {VALID_TIERS} from './fast.mjs';

export const VERSION = '0.1.0-alpha.2';
export const HELP = `Suffice ${VERSION}
Usage: suffice [options] [task]

  suffice                         Start an interactive session
  suffice "fix the failing test"  Start with a task
  suffice --print "explain this"  Run one task, then exit
  suffice login                   Sign in with your own OpenAI account
  suffice doctor                  Check local setup without model inference
  suffice setup-automation        Prepare browser and desktop dependencies

Options:
  --cwd PATH          Starting repository (default: current directory)
  --model ID          gpt-6.1-sol (default), gpt-6-luna, or another catalog ID
  --effort LEVEL      off, minimal, low (default), medium, high, xhigh
  --access LEVEL      read, edit, or full (default: full)
  --continue          Continue the most recent session in this repository
  --no-browser        Disable browser tools and their discovery/instructions
  --no-desktop        Disable native app tools and their discovery/instructions
  --browser-headless  Run the dedicated browser without a visible window
  --home PATH         Credential/session directory (default: ~/.suffice)
  --max-cost USD      Optional API-equivalent allowance per task (default: unlimited)
  --timeout SECONDS   Optional time allowance per task (default: unlimited)
  --fast              Speed profile: priority service tier, cached transport,
                      cache warming, tighter retries (higher provider cost)
  --service-tier TIER Provider service tier override (ultrafast, priority,
                      default, auto, flex, scale); implies --fast
  --print, -p         Print final answer; task may also come from stdin
  --help, -h          Show this help
  --version, -v       Show version

Interactive: Pi's terminal UI, with /project, /login, /model, /settings, /resume,
/efficient (sidekick-first task, seeded-race escalation; /efficient sidekick|lead
<id> picks models), /balanced (restore defaults).
Ctrl+C cancels a running task. Ctrl+D exits at an empty prompt.
Commands run with your user permissions. Use a trusted repository.
Pi's interface and engine, with Suffice's tools, prompt and codemode setup.
`;

export function parseOptions(args, env=process.env) {
  const options = {cwd:process.cwd(), home:env.SUFFICE_HOME || resolve(homedir(), '.suffice'), model:'gpt-6.1-sol', effort:'low', access:'full', maxCost:null, timeout:null, prompt:'',browser:env.SUFFICE_BROWSER!=='0',desktop:env.SUFFICE_DESKTOP!=='0',browserHeadless:env.SUFFICE_BROWSER_HEADLESS==='1'};
  const values = {'--cwd':'cwd','--home':'home','--model':'model','--effort':'effort','--access':'access','--max-cost':'maxCost','--timeout':'timeout','--service-tier':'serviceTier'};
  const words=[];
  for(let i=0;i<args.length;i++) {
    const arg=args[i];
    if(arg==='--') { words.push(...args.slice(i+1)); break; }
    if(['--help','-h'].includes(arg)) options.help=true;
    else if(['--version','-v'].includes(arg)) options.version=true;
    else if(['--print','-p'].includes(arg)) options.print=true;
    else if(arg==='--continue') options.continue=true;
    else if(arg==='--no-browser') options.browser=false;
    else if(arg==='--no-desktop') options.desktop=false;
    else if(arg==='--browser-headless') options.browserHeadless=true;
    else if(arg==='--fast') options.speed='fast';
    else if(values[arg]) { if(!args[i+1] || args[i+1].startsWith('--')) throw new Error(`Missing value for ${arg}`); options[values[arg]]=args[++i]; if(arg==='--cwd') options.cwdExplicit=true; }
    else if(arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else words.push(arg);
  }
  if(words.length===1 && ['login','doctor','setup-automation'].includes(words[0])) options.command=words[0];
  else options.prompt=words.join(' ');
  if(!['off','minimal','low','medium','high','xhigh'].includes(options.effort)) throw new Error('Invalid effort. Use off, minimal, low, medium, high, or xhigh.');
  if(!['read','edit','full'].includes(options.access))throw new Error('Invalid access. Use read, edit, or full.');
  if(options.serviceTier){if(!VALID_TIERS.includes(options.serviceTier))throw new Error(`Invalid service tier. Use ${VALID_TIERS.join(', ')}.`);options.speed='fast';}
  for(const key of ['maxCost','timeout']) {
    if(options[key]===null)continue;
    options[key]=Number(options[key]);
    if(!Number.isFinite(options[key]) || options[key]<=0) throw new Error(`${key} must be a positive number`);
  }
  options.cwd=resolve(options.cwd); options.home=resolve(options.home);
  return options;
}

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
  suffice learn connect PATH      Connect the local Model Learner checkout
  suffice learn status            Show this project’s latest tracked task
  suffice learn verify            Attach an independently produced JUnit report

Options:
  --cwd PATH          Starting repository (default: current directory)
  --model ID          gpt-6.1-sol (default), gpt-6-luna, or another catalog ID
  --effort LEVEL      off, minimal, low (default), medium, high, xhigh
  --learn             Track one fresh task in Model Learner
  --learn-artifact P  Exact final artifact file for this task
  --learn-test ID     Required independent JUnit case; repeatable
  --report PATH       Independent JUnit report for learn verify
  --generated-at ISO  Actual report-generation time with timezone
  --exit-code N       Actual independent checker exit code
  --independent       Confirm report was produced independently
  --run UUID          Select an older tracked task (default: latest)
  --continue          Continue the most recent session in this repository
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
  const values = {'--cwd':'cwd','--home':'home','--model':'model','--effort':'effort','--max-cost':'maxCost','--timeout':'timeout','--learn-artifact':'learnArtifact','--report':'learnReport','--generated-at':'learnGeneratedAt','--exit-code':'learnExitCode','--run':'learnerRun'};
  const words=[];
  for(let i=0;i<args.length;i++) {
    const arg=args[i];
    if(arg==='--') { words.push(...args.slice(i+1)); break; }
    if(['--help','-h'].includes(arg)) options.help=true;
    else if(['--version','-v'].includes(arg)) options.version=true;
    else if(['--print','-p'].includes(arg)) options.print=true;
    else if(arg==='--learn') options.learn=true;
    else if(arg==='--independent') options.learnIndependent=true;
    else if(arg==='--learn-test') {if(!args[i+1]||args[i+1].startsWith('--'))throw new Error('Missing --learn-test identity');(options.learnTests??=[]).push(args[++i]);}
    else if(arg==='--continue') options.continue=true;
    else if(values[arg]) { if(!args[i+1] || args[i+1].startsWith('--')) throw new Error(`Missing value for ${arg}`); options[values[arg]]=args[++i]; if(arg==='--cwd') options.cwdExplicit=true; }
    else if(arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else words.push(arg);
  }
  if(words[0]==='learn') {options.command='learn';options.learnerArgs=words.slice(1);}
  else if(words.length===1 && ['login','doctor'].includes(words[0])) options.command=words[0];
  else options.prompt=words.join(' ');
  if(!['off','minimal','low','medium','high','xhigh'].includes(options.effort)) throw new Error('Invalid effort. Use off, minimal, low, medium, high, or xhigh.');
  for(const key of ['maxCost','timeout']) {
    options[key]=Number(options[key]);
    if(!Number.isFinite(options[key]) || options[key]<=0) throw new Error(`${key} must be a positive number`);
  }
  if(options.learnExitCode!==undefined) {if(!options.learnExitCode.trim())throw Error('Checker exit code is required.');options.learnExitCode=Number(options.learnExitCode);if(!Number.isInteger(options.learnExitCode)||options.learnExitCode<0||options.learnExitCode>255)throw Error('Invalid checker exit code.');}
  if((options.learnReport||options.learnGeneratedAt||options.learnExitCode!==undefined||options.learnIndependent)&&!(options.command==='learn'&&options.learnerArgs[0]==='verify'))throw Error('Verification flags require suffice learn verify.');
  if(options.learn&&options.command)throw Error('--learn is a task option, not a learn subcommand.');
  if(options.learn&&options.continue)throw Error('--learn needs a fresh task; omit --continue.');
  if(options.learn&&(!options.learnArtifact||!options.learnTests?.length))throw Error('--learn needs --learn-artifact and --learn-test.');
  options.cwd=resolve(options.cwd); options.home=resolve(options.home);
  return options;
}

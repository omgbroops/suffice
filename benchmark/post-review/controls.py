"""Disposable, independently authored contract-positive controls. Never actor inputs."""
import json
from pathlib import Path
import subprocess
import sys
import importlib.util
STATE=Path('/home/eric_qin/suffice-post-review-v1')

def main():
    rows=[]
    spec=importlib.util.spec_from_file_location('control_checks',Path(__file__).with_name('checks.py'));checks=importlib.util.module_from_spec(spec);spec.loader.exec_module(checks)
    for id in (sys.argv[1:] or ['queue-aborted','queue-timeout','ky-progress','ky-signal','pall-types','emitter-value']):
        root=STATE/'sources'/id
        if id.startswith('queue-'):
            file='source/index.ts';source=(root/file).read_text()
            marker='async add<TaskResultType>(function_: Task<TaskResultType>, options: Partial<EnqueueOptionsType> = {}): Promise<TaskResultType> {'
            if id=='queue-aborted':replacement=marker+'\noptions.signal?.throwIfAborted();'
            else:replacement=marker+"\nif(options.timeout !== undefined && !(Number.isFinite(options.timeout) && options.timeout > 0))throw new TypeError('Invalid timeout');"
            assert source.count(marker)==1;source=source.replace(marker,replacement)
        elif id=='ky-progress':
            file='source/utils/body.ts';source=(root/file).read_text()
            start=source.index('\t\tflush() {');end=source.index('\n\t}));',start)
            source=source[:start]+'''\t\tflush() {
            transferredBytes += previousChunk?.byteLength ?? 0;
            onProgress?.({percent:1,totalBytes:Math.max(totalBytes,transferredBytes),transferredBytes},previousChunk ?? new Uint8Array());
        },'''+source[end:]
        elif id=='ky-signal':
            file='source/utils/merge.ts';source=(root/file).read_text()
            start=source.index('\t\t\t\t// Special handling for AbortSignal instances');end=source.index('\n\t\t\t\t// Special handling for context',start)
            source=source[:start]+'''                const replaceState = getReplaceState(value);
                const {isReplace} = replaceState;
                value = replaceState.value;
                if(key === 'signal') {
                    if(isReplace || value === undefined || value === null)signals.length=0;
                    if(value instanceof globalThis.AbortSignal)signals.push(value);
                    returnValue={...returnValue,signal:undefined};
                    continue;
                }
'''+source[end:]
        elif id=='pall-types':
            file='index.d.ts';source=(root/file).read_text();start=source.index('export default function pAll<');end=source.index('\nexport {type Options}',start)
            source=source[:start]+'''export default function pAll<T>(tasks: Iterable<() => T | PromiseLike<T>>,options?:Options):Promise<Awaited<T>[]>;
'''+source[end:]
        else:
            file='index.d.mts';source=(root/file).read_text().replace('import type EventEmitter from "./index.d.ts"','import EventEmitter from "./index.js"')
        folder=STATE/'controls'/id;folder.mkdir(parents=True,exist_ok=True)
        patch="import {writeFileSync} from 'node:fs';writeFileSync("+json.dumps('/app/'+file)+','+json.dumps(source)+');'
        (folder/'apply.mjs').write_text(patch)
        for mode in ['public','tests']:
            (STATE/'tasks'/id/mode/'check.mjs').write_text(checks.code(id,mode=='tests'))
            result=subprocess.run(['docker','run','--rm','--network','none','--cpus','1','--memory','2g',
                '-v',str(folder)+':/control:ro','-v',str(STATE/'tasks'/id/mode)+':/probe',
                '--entrypoint','sh','suffice-post-review:'+id,'-c',
                "node /control/apply.mjs && if node -e 'process.exit(require(\"./package.json\").scripts?.build?0:1)'; then npm run build; fi && node /probe/check.mjs"],capture_output=True,text=True,timeout=90)
            row={'id':id,'mode':mode,'exitCode':result.returncode,'stdout':result.stdout,'stderr':result.stderr}
            rows.append(row);(STATE/'positive-controls-latest.json').write_text(json.dumps(rows,indent=2)+'\n')
            assert result.returncode==0,(id,mode,result.stdout[-1600:],result.stderr[-1600:])
            print(json.dumps({'positiveControl':id,'mode':mode,'passed':True}),flush=True)

if __name__=='__main__':main()

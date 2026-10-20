"""Harbor adapter: unchanged harnesses inside the original task containers.

This module never reads task tests/solutions or receives verifier results.
Only runtime files (read-only) and campaign-specific OAuth files are mounted.
"""
import json
import asyncio
import os
import shlex
from pathlib import Path

from harbor.agents.installed.base import BaseInstalledAgent


class HarnessTaxAgent(BaseInstalledAgent):
    @staticmethod
    def name():
        return 'suffice-harnesstax'

    async def install(self, environment):
        result = await environment.exec(
            command='mkdir -p /receipts /agent-home; /runtime-bin/node --version; /runtime-bin/node /runtime/benchmark/harnesstax-worker.mjs preflight',
            user='root', timeout_sec=60)
        if result.return_code != 0:
            raise RuntimeError('Runtime preflight failed: ' + (result.stderr or result.stdout or ''))
        (self.logs_dir/'runtime-preflight.txt').write_text(result.stdout or '')

    async def run(self, instruction, environment, context):
        arm = os.environ['HARNESS_TAX_ARM']
        timeout = int(os.environ['HARNESS_TAX_TIMEOUT'])
        checks = json.loads(os.environ.get('HARNESS_TAX_PUBLIC_CHECKS', '[]'))
        # Match the Dockerfile's original working directory, including tasks whose
        # cwd is not /app. Do not create a Git repository or modify task sources.
        where = await environment.exec(command='pwd', timeout_sec=10)
        workspace = (where.stdout or '').strip()
        if not workspace.startswith('/') or workspace == '/':
            raise RuntimeError('Unsupported task cwd: ' + workspace)
        request = {
            'arm': arm, 'workspace': workspace, 'prompt': instruction,
            'checks': checks, 'timeoutMs': timeout*1000,
            'maxCostUsd': 5, 'maxTurns': 100, 'maxCalls': 240,
        }
        path = self.logs_dir/'actor-request.json'
        path.write_text(json.dumps(request, indent=2)+'\n')
        await environment.upload_file(path, '/agent-home/request.json')
        try:
            result = await environment.exec(
                command='/runtime-bin/node /runtime/benchmark/harnesstax-process.mjs start < /agent-home/request.json > /receipts/console.jsonl 2> /receipts/stderr.txt',
                cwd=workspace, timeout_sec=timeout+30,
                env={'PATH':'/runtime-bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
                 'HARNESS_TAX_ARM':arm, 'CODEX_HOME':'/agent-home/codex',
                 'PI_CODING_AGENT_DIR':'/agent-home/pi',
                 'BENCHMARK_MODEL':'gpt-6.1-sol','BENCHMARK_EFFORT':'high',
                     'SSL_CERT_FILE':'/runtime/ca-certificates.crt'})
        except (asyncio.CancelledError,TimeoutError):
            # Harbor's outer timeout can fire before the worker writes its final
            # aggregate. Live bind-mounted receipts survive container removal.
            # Stop actor descendants before Harbor injects the official verifier.
            await environment.exec(command='/runtime-bin/node /runtime/benchmark/harnesstax-process.mjs stop',
                timeout_sec=15,user='root')
            context.metadata={'arm':arm,'status':'timeout','costUnknown':True}
            raise
        # Refreshes persist only in the dedicated auth mount. These paths are not
        # part of the agent log export or public report.
        # /receipts is mounted directly to this trial's host log directory.
        worker = self.logs_dir/'receipts/worker.json'
        if worker.exists():
            value = json.loads(worker.read_text())
            usage = value.get('usage', {})
            context.n_input_tokens = sum(usage.get(k,0) for k in ('input','cacheRead','cacheWrite'))
            context.n_cache_tokens = usage.get('cacheRead',0)
            context.n_output_tokens = usage.get('output',0)
            unknown = usage.get('costUnknown') or value.get('usageCostUnknown')
            context.cost_usd = None if unknown else usage.get('estimatedApiUsd')
            context.metadata = {'arm':arm,'status':value.get('status'),
                                'exitCode':result.return_code, 'costUnknown':bool(unknown),
                                'publicVerification':value.get('verificationStatus')}
        else:
            context.metadata = {'arm':arm,'exitCode':result.return_code,'costUnknown':True,'workerMissing':True}
        # A failed actor is still graded; preserve failures instead of replacing
        # them with retries. Official verification follows only after this return.

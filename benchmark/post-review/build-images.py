"""Build candidate environments only. No model calls or paid launch."""
import concurrent.futures
import json
from pathlib import Path
import subprocess

ROOT=Path('/mnt/c/Users/Eric Qin/Documents/GitHub/suffice')
STATE=Path('/home/eric_qin/suffice-post-review-v1')

def build(row):
    folder=STATE/'sources'/row['id']
    dockerfile=folder/'Dockerfile.suffice-preflight'
    dockerfile.write_text('''FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates bash && rm -rf /var/lib/apt/lists/*
RUN mkdir /opt/checker && cd /opt/checker && npm install --ignore-scripts --no-audit --no-fund typescript@5.9.3
WORKDIR /app
COPY . /app
RUN npm install --ignore-scripts --no-audit --no-fund
RUN if node -e 'process.exit(require("./package.json").scripts?.build?0:1)'; then npm run build; fi
RUN rm -f Dockerfile.suffice-preflight && git init && git add -A && git -c user.name=Benchmark -c user.email=benchmark@example.invalid -c commit.gpgsign=false commit -m "Frozen public issue baseline"
''')
    log=STATE/'build-logs'/(row['id']+'.log');log.parent.mkdir(exist_ok=True)
    with log.open('w') as output:
        result=subprocess.run(['docker','build','-f',str(dockerfile),'-t','suffice-post-review:'+row['id'],str(folder)],stdout=output,stderr=subprocess.STDOUT,timeout=900)
    assert result.returncode==0,'Build failed: '+row['id']
    image=subprocess.check_output(['docker','image','inspect','--format','{{.Id}}','suffice-post-review:'+row['id']],text=True).strip()
    print(json.dumps({'built':row['id'],'image':image}),flush=True)
    return {'id':row['id'],'image':image}

if __name__=='__main__':
    rows=json.loads((ROOT/'benchmark/post-review/candidates.json').read_text())
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(build,rows))
    (STATE/'images.json').write_text(json.dumps(results,indent=2)+'\n')

"""Scan readable benchmark artifacts before publication; never print matches."""
import json
import re
import sys
from pathlib import Path

directory = Path(sys.argv[1]).resolve()
patterns = [r'(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{20,}',
            r'eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}',
            r'gh[pousr]_[A-Za-z0-9]{30,}']
excluded = 0


def readable(value):
    global excluded
    if isinstance(value, dict):
        encrypted_reasoning = (value.get('type') == 'reasoning'
                               and str(value.get('id', '')).startswith('rs_')
                               and isinstance(value.get('encrypted_content'), str))
        if encrypted_reasoning:
            excluded += 1
        return {key: readable(item) for key, item in value.items()
                if not (encrypted_reasoning and key == 'encrypted_content')}
    if isinstance(value, list):
        return [readable(item) for item in value]
    if isinstance(value, str):
        try:
            embedded = json.loads(value)
            if isinstance(embedded, dict) and embedded.get('type') == 'reasoning':
                return readable(embedded)
        except (ValueError, TypeError):
            pass
    return value


flagged = []
files = [path for path in directory.rglob('*') if path.suffix in ['.json', '.jsonl', '.md', '.txt']]
for path in files:
    text = path.read_text(encoding='utf-8-sig')
    if path.suffix == '.jsonl':
        values = [json.loads(line) for line in text.splitlines() if line.strip()]
    elif path.suffix == '.json':
        values = [json.loads(text)]
    else:
        values = [text]
    serialized = [json.dumps(readable(value)) for value in values]
    if any(re.search(pattern, value) for value in serialized for pattern in patterns):
        flagged.append(str(path.relative_to(directory)))
report = {'files': len(files), 'flaggedPaths': flagged,
          'providerEncryptedReasoningObjectsExcluded': excluded,
          'method': 'Credential-shaped pattern scan of readable content. Only structurally identified provider encrypted reasoning is excluded. This is not proof of no secret exposure.'}
(directory / 'credential-pattern-audit.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report))
if flagged:
    raise SystemExit(1)

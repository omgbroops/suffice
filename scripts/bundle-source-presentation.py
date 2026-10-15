"""Export an explicit local review allowlist; stdlib only, no model requests."""
import datetime
import hashlib
import json
from pathlib import Path
import re
import tarfile
import zipfile

root = Path(__file__).resolve().parents[1]
task_ids = ["fastq-resume-window", "rfdc-builtins-state", "bottleneck-weighted-priority"]
folders = ["src", "docs/source-presentation-v2", "reports/source-presentation-v2",
           ".suffice/source-presentation-v1", ".suffice/source-presentation-v2"]
folders += [f"benchmarks/benchmark-v1/tasks/{task}" for task in task_ids]
singles = ["package.json", "package-lock.json", ".gitattributes",
           "tests/source-frames.test.mjs", "tests/source-wire.test.mjs",
           "scripts/source-presentation.mjs", "scripts/source-presentation-v2.mjs",
           "scripts/audit-benchmark-receipts.mjs", "scripts/audit-source-presentation.mjs",
           "scripts/audit-source-presentation-v2.mjs", "scripts/audit-source-instructions.mjs",
           "scripts/bundle-source-presentation.py",
           "reports/source-presentation/offline-audit.json", "reports/source-presentation/results.json"]
excluded = {"BUNDLE.json", "EXPORT-VALIDATION.json"}

def sha(data):
    return hashlib.sha256(data).hexdigest()

def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))

manifest = read_json(root / ".suffice/source-presentation-v2/manifest.json")
if (root / ".suffice/source-presentation-v2/active.lock").exists():
    raise RuntimeError("Refuse to export an active campaign")
for rel, digest in manifest["inputs"].items():
    if sha((root / rel).read_bytes()) != digest:
        raise RuntimeError("Frozen input mismatch: " + rel)

# A 37-byte .env is public upstream fixture data, not the auth store.
# Permit only exact bytes independently recovered from the pinned public tar.
bottleneck = root / "benchmarks/benchmark-v1/tasks/bottleneck-weighted-priority"
task = read_json(bottleneck / "task.json")
public_env = set()
sources = (task["provenance"]["sourceArchives"] if isinstance(task["provenance"], dict)
           else [{"path": "download/upstream.tar.gz", "sha256": manifest["inputs"][
               "benchmarks/benchmark-v1/tasks/bottleneck-weighted-priority/download/upstream.tar.gz"]}])
for source in sources:
    archive = bottleneck / source["path"]
    if sha(archive.read_bytes()) != source["sha256"]:
        raise RuntimeError("Upstream archive hash mismatch")
    with tarfile.open(archive) as tf:
        for member in tf.getmembers():
            if member.isfile() and Path(member.name).name == ".env":
                public_env.add(sha(tf.extractfile(member).read()))

paths = {root / name for name in singles}
for name in folders:
    base = root / name
    for path in base.rglob("*"):
        if path.is_symlink() or path.is_junction():
            raise RuntimeError("Unexpected link in export allowlist")
        if path.is_file() and path.name not in excluded:
            paths.add(path)

payload = {}
public_env_files = 0
credential_patterns = [re.compile(rb"\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}"),
                       re.compile(rb"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}")]
for path in sorted(paths):
    rel = path.relative_to(root).as_posix()
    if path.name in {"auth.json", "login-status.json", "catalog.json", "active.lock"} or "node_modules" in path.parts:
        raise RuntimeError("Forbidden private/dependency path in export")
    data = path.read_bytes()
    if path.name == ".env":
        if sha(data) not in public_env:
            raise RuntimeError("Non-public environment file")
        public_env_files += 1
    if any(pattern.search(data) for pattern in credential_patterns):
        raise RuntimeError("Credential-like value detected; no value printed")
    payload[rel] = data
if sum(map(len, payload.values())) > 80 * 1024**2:
    raise RuntimeError("Export exceeds disk bound")

at = datetime.datetime.now(datetime.timezone.utc)
inside = {"at": at.isoformat(), "scope": "Complete v2 benchmark receipts, retained v1 zero-request startup failures, and explicit reproducibility inputs. No engineering transcripts or credential stores.",
          "strictInstructionParityPassed": False,
          "fileHashes": {name: sha(data) for name, data in payload.items()}}
payload["BUNDLE-MANIFEST.json"] = (json.dumps(inside, indent=2) + "\n").encode()
outdir = root / ".suffice/review-bundles"
outdir.mkdir(parents=True, exist_ok=True)
target = outdir / ("source-presentation-v2-" + at.strftime("%Y%m%d-%H%M%S") + ".zip")
with zipfile.ZipFile(target, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for name, data in payload.items():
        z.writestr(name, data)
with zipfile.ZipFile(target) as z:
    if z.testzip() is not None or set(z.namelist()) != set(payload):
        raise RuntimeError("Archive integrity mismatch")
    for name, data in payload.items():
        if sha(z.read(name)) != sha(data):
            raise RuntimeError("Archive entry hash mismatch")

receipt = {"at": at.isoformat(), "path": str(target), "sha256": sha(target.read_bytes()),
           "files": len(payload), "uncompressedBytes": sum(map(len, payload.values())),
           "zipBytes": target.stat().st_size, "entryHashesVerified": True,
           "credentialStoreExcluded": True, "credentialPatternMatches": 0,
           "publicEnvFilesVerifiedAgainstPinnedTar": public_env_files,
           "strictInstructionParityPassed": False}
encoded = json.dumps(receipt, indent=2) + "\n"
(root / "reports/source-presentation-v2/BUNDLE.json").write_text(encoded, encoding="utf-8")
pointer = Path("C:/Users/Mohammed/Documents/GitHub/suffice/reports")
if pointer.is_dir():
    (pointer / "SOURCE-PRESENTATION-BUNDLE.json").write_text(encoded, encoding="utf-8")
print(json.dumps(receipt))

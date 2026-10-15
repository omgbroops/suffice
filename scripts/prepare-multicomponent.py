"""Reproduce the bounded, injected Bottleneck calibration task. No package install."""
import hashlib
import json
import pathlib
import tarfile
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
TASK = ROOT / "benchmarks/multicomponent/bottleneck-weighted-priority"
COMMIT = "8a8bde9cde151c278397703c48f2bba4ded2bae7"
URL = f"https://codeload.github.com/SGrondin/bottleneck/tar.gz/{COMMIT}"
ARCHIVE_SHA256 = "be098c12058d7c0280f9a5a6220f4bff8d5f2241058d12afb32e140062b2d48b"
ARCHIVE = TASK / "download/upstream.tar.gz"
MAX_DOWNLOAD = 8 * 1024 * 1024
MAX_EXPANDED = 30 * 1024 * 1024


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    ARCHIVE.parent.mkdir(parents=True, exist_ok=True)
    if not ARCHIVE.exists():
        with urllib.request.urlopen(URL) as response:
            data = response.read(MAX_DOWNLOAD + 1)
        if len(data) > MAX_DOWNLOAD:
            raise RuntimeError("Download limit exceeded")
        ARCHIVE.write_bytes(data)
    archive_bytes = ARCHIVE.read_bytes()
    if len(archive_bytes) > MAX_DOWNLOAD:
        raise RuntimeError("Download limit exceeded")
    if digest(archive_bytes) != ARCHIVE_SHA256:
        raise RuntimeError("Pinned archive digest mismatch")
    with tarfile.open(ARCHIVE) as archive:
        members = archive.getmembers()
        if any(not (m.isdir() or m.isfile()) for m in members):
            raise RuntimeError("Archive must contain regular files and directories only")
        files = [m for m in members if m.isfile()]
        if sum(m.size for m in files) > MAX_EXPANDED // 2:
            raise RuntimeError("Two complete source copies would exceed artifact limit")
        manifest = {}
        for member in files:
            parts = pathlib.PurePosixPath(member.name).parts[1:]
            if not parts or any(p in ("..", ".") for p in parts):
                raise RuntimeError("Unsafe source path")
            relative = pathlib.Path(*parts)
            data = archive.extractfile(member).read()
            manifest[relative.as_posix()] = {"sha256": digest(data), "bytes": len(data)}
            for kind in ("actor", "reference"):
                dest = TASK / kind / "src" / relative
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(data)
    injections = [
        ("src/lib/Queues.js", "for (j = 0, len = arr.length; j < len; j++) {", "for (j = arr.length - 1; j >= 0; j--) {"),
        ("src/lib/LocalDatastore.js", "_this13._running -= weight;", "_this13._running -= 1;"),
    ]
    changes = []
    for relative, original, defective in injections:
        dest = TASK / "actor" / relative
        text = dest.read_bytes().decode("utf-8")
        if text.count(original) != 1:
            raise RuntimeError(f"Injection anchor mismatch: {relative}")
        dest.write_bytes(text.replace(original, defective).encode("utf-8"))
        changes.append({"path": relative, "upstreamText": original, "injectedText": defective})
    visible = (TASK / "visible.test.mjs").read_bytes()
    prompt = json.loads((TASK / "task.json").read_text(encoding="utf-8"))["publicPrompt"]
    for kind in ("actor", "reference"):
        tests = TASK / kind / "tests"
        tests.mkdir(parents=True, exist_ok=True)
        (tests / "visible.test.mjs").write_bytes(visible)
        (TASK / kind / "README.md").write_text(prompt + "\n", encoding="utf-8")
    receipt = {
        "repository": "SGrondin/bottleneck", "sourceCommit": COMMIT,
        "sourceUrl": URL, "downloadBytes": len(archive_bytes),
        "archiveSha256": digest(archive_bytes), "upstreamFiles": len(manifest),
        "upstreamBytes": sum(m["bytes"] for m in manifest.values()),
        "manifest": manifest, "injections": changes,
        "reference": "Every reference/src file is byte-identical to the pinned archive.",
        "localAdaptations": [], "vendoredDependencies": [],
        "runtime": "Node native CommonJS runtime, dependency-free local datastore only",
        "limits": {"downloadBytes": MAX_DOWNLOAD, "taskArtifactBytes": MAX_EXPANDED},
    }
    (TASK / "source.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: receipt[key] for key in ("sourceCommit", "downloadBytes", "upstreamFiles", "upstreamBytes")}))


if __name__ == "__main__":
    main()

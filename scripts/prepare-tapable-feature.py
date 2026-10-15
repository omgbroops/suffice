"""Prepare one bounded, authored Tapable feature task; no package installation."""
import hashlib
import json
import pathlib
import tarfile
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
TASK = ROOT / "benchmarks/multicomponent/tapable-abortable-hooks"
COMMIT = "a0a7b26224557bd8bb09b97e0126b7dbda9f8e6a"
URL = f"https://codeload.github.com/webpack/tapable/tar.gz/{COMMIT}"
ARCHIVE = TASK / "download/upstream.tar.gz"
ARCHIVE_SHA256 = "3d861b6776f11f51933dd9745fe2ecf1724d694a92012cd1d086cb066431afed"
MAX_DOWNLOAD = 8 * 1024 * 1024
MAX_ARTIFACT = 30 * 1024 * 1024


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
    data = ARCHIVE.read_bytes()
    if len(data) > MAX_DOWNLOAD or digest(data) != ARCHIVE_SHA256:
        raise RuntimeError("Pinned source archive size or hash mismatch")
    task = json.loads((TASK / "task.json").read_text(encoding="utf-8"))
    patches = json.loads((TASK / "private/reference-patches.json").read_text(encoding="utf-8"))
    if sorted(patch["path"] for patch in patches) != sorted(task["allowedEditPaths"]):
        raise RuntimeError("Reference modification scope mismatch")
    manifest = {}
    with tarfile.open(ARCHIVE) as archive:
        members = archive.getmembers()
        if any(not (member.isfile() or member.isdir()) for member in members):
            raise RuntimeError("Archive must contain only regular files and directories")
        files = [member for member in members if member.isfile()]
        if sum(member.size for member in files) * 2 > MAX_ARTIFACT:
            raise RuntimeError("Complete source copies exceed artifact limit")
        for member in files:
            parts = pathlib.PurePosixPath(member.name).parts[1:]
            if not parts or any(part in ("..", ".") for part in parts):
                raise RuntimeError("Unsafe source archive path")
            relative = pathlib.Path(*parts)
            content = archive.extractfile(member).read()
            manifest[relative.as_posix()] = {"sha256": digest(content), "bytes": len(content)}
            for kind in ("actor", "reference"):
                dest = TASK / kind / "src" / relative
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(content)
    modifications = []
    for patch in patches:
        path = pathlib.PurePosixPath(patch["path"])
        if path.is_absolute() or ".." in path.parts or patch["path"] not in task["allowedEditPaths"]:
            raise RuntimeError("Invalid reference patch path")
        target = TASK / "reference" / patch["path"]
        before = patch["before"].encode("utf-8")
        after = patch["after"].encode("utf-8")
        if target.read_bytes() != before:
            raise RuntimeError(f"Pinned reference preimage mismatch: {path}")
        target.write_bytes(after)
        modifications.append({"path": patch["path"], "beforeSha256": digest(before), "afterSha256": digest(after)})
    smoke = (TASK / "smoke.test.mjs").read_bytes()
    feature = (TASK / "feature.test.mjs").read_bytes()
    visible = smoke + b"\n" + feature[feature.index(b"test("):]
    (TASK / "visible.test.mjs").write_bytes(visible)
    for kind in ("actor", "reference"):
        tests = TASK / kind / "tests"
        tests.mkdir(parents=True, exist_ok=True)
        for name, content in (("smoke", smoke), ("feature", feature), ("visible", visible)):
            (tests / (name + ".test.mjs")).write_bytes(content)
        (TASK / kind / "README.md").write_bytes((task["publicPrompt"] + "\n").encode("utf-8"))
    receipt = {
        "repository": task["repository"], "sourceCommit": COMMIT, "sourceUrl": URL,
        "archiveSha256": digest(data), "downloadBytes": len(data),
        "upstreamFiles": len(manifest), "upstreamBytes": sum(entry["bytes"] for entry in manifest.values()),
        "manifest": manifest, "referenceModifications": modifications,
        "baseline": "Complete byte-identical upstream archive; no injected defects or source adaptations",
        "reference": "Authored known feature reference; only the four documented production modules differ",
        "vendoredDependencies": [], "localAdaptations": [],
        "runtime": "Native Node CommonJS; package metadata has no runtime dependencies",
        "limits": {"downloadBytes": MAX_DOWNLOAD, "taskArtifactBytes": MAX_ARTIFACT},
    }
    (TASK / "source.json").write_bytes((json.dumps(receipt, indent=2) + "\n").encode("utf-8"))
    print(json.dumps({key: receipt[key] for key in ("sourceCommit", "downloadBytes", "upstreamFiles", "upstreamBytes")}))


if __name__ == "__main__":
    main()

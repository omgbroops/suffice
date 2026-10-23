"""Independently verify saved ZIP bytes against the source SHA256 inventory."""
import hashlib
import json
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parent
inventory = json.loads((root / "evidence-files.json").read_text(encoding="utf-8"))
receipt = json.loads((root / "archive.json").read_text(encoding="utf-8"))
verified = []
for archive in receipt["archives"]:
    path = root / archive["name"]
    assert hashlib.sha256(path.read_bytes()).hexdigest() == archive["sha256"]
    expected = {row["path"]: row for row in inventory["files"] if row["archive"] == path.name}
    with zipfile.ZipFile(path) as stream:
        assert len(stream.namelist()) == len(expected)
        assert set(stream.namelist()) == set(expected)
        assert stream.testzip() is None
        for name, row in expected.items():
            data = stream.read(name)
            assert len(data) == row["bytes"]
            assert hashlib.sha256(data).hexdigest() == row["sha256"], name
    verified.append({"archive": path.name, "verifiedEntries": len(expected), "sha256": archive["sha256"]})
proof = {"passed": True, "implementation": "Python standard library zipfile + hashlib", "archives": verified}
(root / "independent-zip-audit.json").write_text(json.dumps(proof, indent=2) + "\n", encoding="utf-8")
print(json.dumps(proof))

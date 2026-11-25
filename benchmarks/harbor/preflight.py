#!/usr/bin/env python3
"""Validate local prerequisites before spending benchmark attempts."""
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def fail(message):
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def load_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except OSError:
        fail(f"missing {path}; run `suffice login` first")
    except ValueError:
        fail(f"invalid JSON in {path}")


def main():
    auth_dir = Path(os.environ.get("SUFFICE_AUTH_DIR", Path.home() / ".suffice")).expanduser()
    auth = load_json(auth_dir / "auth.json")
    credential = auth.get("openai") if isinstance(auth, dict) else None
    if not isinstance(credential, dict) or credential.get("type") != "oauth":
        fail(f"{auth_dir / 'auth.json'} does not contain an OpenAI OAuth credential")
    for key in ("access", "refresh", "expires", "clientId"):
        if not credential.get(key):
            fail(f"OpenAI OAuth credential is missing {key}")

    catalog = load_json(auth_dir / "catalog.json")
    models = ((catalog.get("openai") or {}).get("models") or [])
    if isinstance(models, dict):
        models = list(models.values())
    by_id = {model.get("id"): model for model in models if isinstance(model, dict)}
    required = [os.environ.get("SUFFICE_STRONG_MODEL", "gpt-6.2-sol"), os.environ.get("SUFFICE_CHEAP_MODEL", "gpt-6-luna")]
    for model_id in dict.fromkeys(required):
        model = by_id.get(model_id)
        if model is None:
            fail(f"{model_id} is absent from {auth_dir / 'catalog.json'}")
        if not isinstance((model.get("cost") or {}).get("output"), (int, float)):
            print(f"WARNING: {model_id} has no catalog cost metadata; cost telemetry will be incomplete")

    if not shutil.which("docker"):
        fail("docker is not installed")
    probe = subprocess.run(["docker", "info"], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    if probe.returncode:
        fail(f"docker is not usable: {probe.stderr.strip()}")
    harbor = os.environ.get("HARBOR", "harbor")
    if not shutil.which(harbor) and not Path(harbor).exists():
        fail(f"harbor executable not found: {harbor}")
    print("preflight ok")


if __name__ == "__main__":
    main()

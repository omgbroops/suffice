#!/usr/bin/env python3
"""Small OpenAI credential-injecting reverse proxy for benchmark containers.

The task agent receives only a dummy credential. This sidecar holds the real
OAuth credential in a private container, refreshes it under a shared file lock,
and forwards only /v1/* requests to api.openai.com.
"""
import fcntl
import http.client
import json
import os
import ssl
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

SECRET_DIR = Path(os.environ.get("SUFFICE_PROXY_SECRET_DIR", "/secret"))
AUTH_PATH = SECRET_DIR / "auth.json"
LOCK_PATH = SECRET_DIR / "auth.lock"
TOKEN_HOST = "auth.openai.com"
API_HOST = "api.openai.com"
RESOURCE = "https://api.openai.com/v1"
EXPIRY_MARGIN_SEC = 180
ALLOWED_MODELS = {value.strip() for value in os.environ.get("SUFFICE_PROXY_ALLOWED_MODELS", "").split(",") if value.strip()}
INFERENCE_PATHS = {"/v1/responses", "/v1/chat/completions"}
CHATGPT_UNSUPPORTED_FIELDS = {"prompt_cache_retention", "prompt_cache_options", "max_output_tokens", "temperature"}


def sanitize_inference_body(body, allowed_models):
    if body is None:
        return None, None
    try:
        payload = json.loads(body)
    except (TypeError, ValueError):
        return None, "inference request body must be JSON"
    if not isinstance(payload, dict):
        return None, "inference request body must be a JSON object"
    model = payload.get("model")
    if allowed_models and model not in allowed_models:
        return None, "model is not allowed for this benchmark run"
    for field in CHATGPT_UNSUPPORTED_FIELDS:
        payload.pop(field, None)
    # Pi only omits configuration_update items when it knows the credential is
    # direct ChatGPT OAuth. The proxy endpoint hides that signal, so remove the
    # unsupported control items centrally before forwarding upstream.
    if isinstance(payload.get("input"), list):
        payload["input"] = [
            item for item in payload["input"]
            if not (isinstance(item, dict) and item.get("type") == "configuration_update")
        ]
    return json.dumps(payload, separators=(",", ":")).encode(), None


def credential_from(payload):
    if not isinstance(payload, dict):
        raise RuntimeError("auth.json is not an object")
    value = payload.get("openai", payload)
    if not isinstance(value, dict) or value.get("type") != "oauth":
        raise RuntimeError("auth.json does not contain an OpenAI OAuth credential")
    for key in ("access", "refresh", "expires", "clientId"):
        if not value.get(key):
            raise RuntimeError(f"OpenAI OAuth credential is missing {key}")
    return value


def write_json_atomic(path, value):
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(value, separators=(",", ":")), encoding="utf-8")
    # The bind-mounted state directory itself is 0700 on the host. Keep the
    # rotated file readable to the host account that owns the benchmark so the
    # launcher can persist the rotated refresh token when the run exits.
    os.chmod(tmp, 0o644)
    os.replace(tmp, path)


def token_request(body):
    connection = http.client.HTTPSConnection(TOKEN_HOST, timeout=30, context=ssl.create_default_context())
    connection.request(
        "POST",
        "/api/accounts/oauth/token",
        urllib.parse.urlencode(body),
        {"accept": "application/json", "content-type": "application/x-www-form-urlencoded"},
    )
    response = connection.getresponse()
    raw = response.read()
    connection.close()
    if response.status != 200:
        raise RuntimeError(f"OpenAI OAuth refresh failed with HTTP {response.status}")
    payload = json.loads(raw)
    return payload


def refreshed(credential):
    token = token_request({
        "grant_type": "refresh_token",
        "client_id": credential["clientId"],
        "refresh_token": credential["refresh"],
        "resource": RESOURCE,
    })
    scope = token.get("scope", "")
    scopes = scope.split() if isinstance(scope, str) else credential.get("scopes", [])
    return {
        **credential,
        "type": "oauth",
        "access": token["access_token"],
        "refresh": token["refresh_token"],
        "expires": int(time.time() * 1000) + int(token["expires_in"]) * 1000 - EXPIRY_MARGIN_SEC * 1000,
        "clientId": credential["clientId"],
        "scopes": scopes,
    }


def access_token():
    LOCK_PATH.touch(mode=0o600, exist_ok=True)
    with LOCK_PATH.open("r+") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        stored = json.loads(AUTH_PATH.read_text(encoding="utf-8"))
        credential = credential_from(stored)
        if int(credential["expires"]) - EXPIRY_MARGIN_SEC * 1000 <= int(time.time() * 1000):
            credential = refreshed(credential)
            if "openai" in stored:
                stored["openai"] = credential
            else:
                stored = credential
            write_json_atomic(AUTH_PATH, stored)
        return credential["access"]


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "SufficeOpenAIProxy/0.1"

    def log_message(self, fmt, *args):
        return

    def _health(self):
        body = b"ok\n"
        self.send_response(200)
        self.send_header("content-type", "text/plain")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            self._health()
            return
        self._forward()

    def do_POST(self):
        self._forward()

    def do_PUT(self):
        self._forward()

    def do_DELETE(self):
        self._forward()

    def _forward(self):
        try:
            parsed = urllib.parse.urlsplit(self.path)
            if self.command != "POST" or parsed.path not in INFERENCE_PATHS:
                self.send_error(403, "only configured inference endpoints are proxied")
                return
            length = int(self.headers.get("content-length") or "0")
            body = self.rfile.read(length) if length else None
            body, rejection = sanitize_inference_body(body, ALLOWED_MODELS)
            if rejection:
                self.send_error(403, rejection)
                return
            token = access_token()
            connection = http.client.HTTPSConnection(API_HOST, timeout=600, context=ssl.create_default_context())
            headers = {}
            for key, value in self.headers.items():
                lower = key.lower()
                if lower in {"host", "authorization", "connection", "content-length", "proxy-authorization", "transfer-encoding"}:
                    continue
                headers[key] = value
            headers["authorization"] = f"Bearer {token}"
            headers["host"] = API_HOST
            connection.request(self.command, parsed.path + (("?" + parsed.query) if parsed.query else ""), body=body, headers=headers)
            upstream = connection.getresponse()
            self.send_response(upstream.status, upstream.reason)
            skip = {"connection", "transfer-encoding", "content-length", "content-encoding", "keep-alive"}
            for key, value in upstream.getheaders():
                if key.lower() not in skip:
                    self.send_header(key, value)
            # Preserve upstream compression exactly, but stream with explicit chunked framing.
            encoding = upstream.getheader("content-encoding")
            if encoding:
                self.send_header("content-encoding", encoding)
            self.send_header("transfer-encoding", "chunked")
            self.end_headers()
            while True:
                chunk = upstream.read(16384)
                if not chunk:
                    break
                self.wfile.write(f"{len(chunk):x}\r\n".encode("ascii") + chunk + b"\r\n")
                self.wfile.flush()
            self.wfile.write(b"0\r\n\r\n")
            self.wfile.flush()
            connection.close()
        except (BrokenPipeError, ConnectionResetError):
            return
        except Exception as exc:
            body = json.dumps({"error": {"message": str(exc), "type": "suffice_proxy_error"}}).encode()
            try:
                self.send_response(502)
                self.send_header("content-type", "application/json")
                self.send_header("content-length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass


def main():
    if not AUTH_PATH.exists():
        raise SystemExit(f"missing credential file: {AUTH_PATH}")
    port = int(os.environ.get("SUFFICE_PROXY_PORT", "8787"))
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    server.serve_forever()


if __name__ == "__main__":
    main()

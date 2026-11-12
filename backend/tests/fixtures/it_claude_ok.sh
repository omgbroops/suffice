#!/bin/sh
# Fake claude for server_it: marks that it started, then replays a stream-json transcript.
touch "$SUFFICE_IT_DIR/started-claude"
cat "$(dirname "$0")/it_claude_ok.jsonl"

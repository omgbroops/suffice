#!/bin/sh
# Fake claude for server_it: like it_claude_ok.sh but reports 90% of the seven_day window.
touch "$SUFFICE_IT_DIR/started-claude"
cat "$(dirname "$0")/it_claude_ratelimit.jsonl"

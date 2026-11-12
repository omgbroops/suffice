#!/bin/sh
# Fake agent CLI for tests. Never runs a real agent.
# Env: ARGV_OUT (dump argv, one per line), PID_OUT (write own pid),
#      MODE = ok | fail | tool | sleep (default ok), SLEEP_SECS (default 10).
if [ -n "$ARGV_OUT" ]; then
  for a in "$@"; do printf '%s\n' "$a"; done >> "$ARGV_OUT"
fi
if [ -n "$MARKER" ]; then
  touch "$MARKER"
fi
if [ -n "$PID_OUT" ]; then
  echo $$ > "$PID_OUT"
fi
SID="fake-session-1"
echo "{\"type\":\"system\",\"subtype\":\"init\",\"session_id\":\"$SID\"}"
case "${MODE:-ok}" in
  fail)
    echo "boom" >&2
    exit 1
    ;;
  tool)
    echo "{\"type\":\"assistant\",\"message\":{\"content\":[{\"type\":\"tool_use\",\"name\":\"Bash\",\"input\":{\"command\":\"git push\"}}]}}"
    ;;
  sleep)
    echo "{\"type\":\"assistant\",\"message\":{\"content\":[{\"type\":\"text\",\"text\":\"working\"}]}}"
    sleep "${SLEEP_SECS:-10}"
    ;;
esac
echo "{\"type\":\"assistant\",\"message\":{\"content\":[{\"type\":\"text\",\"text\":\"done\"}]}}"
echo "{\"type\":\"result\",\"subtype\":\"success\",\"is_error\":false,\"result\":\"done\",\"total_cost_usd\":0.0,\"session_id\":\"$SID\"}"
exit 0

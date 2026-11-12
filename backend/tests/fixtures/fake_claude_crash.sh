#!/bin/sh
# Fake agent CLI for the crash-recovery test. Never runs a real agent.
# Run 1 sleeps 30 s (so the test can kill the server while it runs); later runs finish at once.
# State lives in the task cwd: count (run number) and markers ("start N" / "end N" lines).
N=$(( $(cat count 2>/dev/null || echo 0) + 1 ))
echo "$N" > count
echo "start $N" >> markers
echo "{\"type\":\"system\",\"subtype\":\"init\",\"session_id\":\"crash-$N\"}"
if [ "$N" = 1 ]; then sleep 30; else sleep 1; fi
echo "end $N" >> markers
echo "{\"type\":\"result\",\"subtype\":\"success\",\"is_error\":false,\"result\":\"done\",\"total_cost_usd\":0.0,\"session_id\":\"crash-$N\"}"

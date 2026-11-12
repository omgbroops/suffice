#!/usr/bin/env python3
# Orphan stand-in for recovery tests: a leader with a child, both should die on restart.
# python3 rather than sh: macOS hides the environment of Apple platform binaries from ps -E.
import subprocess, time
subprocess.Popen(["sleep", "30"])
time.sleep(30)

#!/bin/sh
set -eu
printf 'SUFFICE_LAUNCH_PID=%s\n' "$$"
exec "$@"

#!/bin/bash
set -euo pipefail
export PYTHONDONTWRITEBYTECODE=1
exec python3 "$(cd "$(dirname "$0")" && pwd)/phase0-saori.py" "$@"

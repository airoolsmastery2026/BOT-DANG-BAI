#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_BIN="${PYTHON_BIN:-$SCRIPT_DIR/.venv/bin/python}"
LOCK_FILE="${FACEBOOK_LOCK_FILE:-$SCRIPT_DIR/facebook-auto-post.lock}"

if [[ ! -x "$PYTHON_BIN" ]]; then
  echo "Không tìm thấy Python executable: $PYTHON_BIN" >&2
  exit 1
fi

if ! command -v flock >/dev/null 2>&1; then
  echo "Thiếu lệnh flock. Hãy cài util-linux hoặc chạy auto_post.py trực tiếp." >&2
  exit 1
fi

exec flock --nonblock "$LOCK_FILE" "$PYTHON_BIN" "$SCRIPT_DIR/auto_post.py"

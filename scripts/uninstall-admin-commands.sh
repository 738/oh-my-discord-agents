#!/bin/bash
#
# uninstall-admin-commands.sh
#
# install-admin-commands.sh가 각 에이전트 레포 CLAUDE.md에 주입한 블록을 제거합니다.
# 마커(<!-- BEGIN/END ADMIN_COMMANDS ... -->) 사이의 라인만 제거 — 다른 내용은 보존.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
CONFIG_PATH="${AGENTS_CONFIG:-$REPO_ROOT/agents.json}"

if [ ! -f "$CONFIG_PATH" ]; then
  echo "❌ agents.json 없음: $CONFIG_PATH" >&2
  exit 1
fi

ENTRIES_TMP="$(mktemp)"
node -e "
  const cfg = require('$CONFIG_PATH');
  for (const [id, agent] of Object.entries(cfg)) {
    if (!agent.repo) continue;
    console.log(id + '\t' + agent.repo);
  }
" > "$ENTRIES_TMP"

REMOVED=0
SKIPPED=0

while IFS=$'\t' read -r id repo; do
  [ -z "$id" ] && continue
  claude_md="$repo/CLAUDE.md"

  if [ ! -f "$claude_md" ]; then
    continue
  fi

  if ! grep -Fq "BEGIN ADMIN_COMMANDS (managed by install-admin-commands.sh)" "$claude_md"; then
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # BEGIN~END 블록 + 바로 뒤 공백 한 줄 제거
  awk '
    /BEGIN ADMIN_COMMANDS \(managed by install-admin-commands.sh\)/ { skip=1; next }
    /END ADMIN_COMMANDS/ { skip=0; skip_blank=1; next }
    skip { next }
    skip_blank && /^$/ { skip_blank=0; next }
    { skip_blank=0; print }
  ' "$claude_md" > "$claude_md.tmp"
  mv "$claude_md.tmp" "$claude_md"

  echo "  ✓ $id — 제거 완료"
  REMOVED=$((REMOVED + 1))
done < "$ENTRIES_TMP"

rm -f "$ENTRIES_TMP"

echo ""
echo "완료: 제거 $REMOVED, 스킵 $SKIPPED"

#!/bin/bash
#
# install-admin-commands.sh
#
# agents.json을 순회하여 각 에이전트 레포의 CLAUDE.md 최상단에
# ADMIN_COMMANDS.md를 import하는 한 줄을 주입합니다.
#
# 멱등(idempotent): 이미 import 줄이 있으면 스킵합니다.
#
# 사용법:
#   bash scripts/install-admin-commands.sh            # agents.json 기본 경로
#   AGENTS_CONFIG=./agents.json bash scripts/install-admin-commands.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
CONFIG_PATH="${AGENTS_CONFIG:-$REPO_ROOT/agents.json}"
ADMIN_DOC="$REPO_ROOT/docs/ADMIN_COMMANDS.md"

if [ ! -f "$CONFIG_PATH" ]; then
  echo "❌ agents.json 없음: $CONFIG_PATH" >&2
  exit 1
fi

if [ ! -f "$ADMIN_DOC" ]; then
  echo "❌ ADMIN_COMMANDS.md 없음: $ADMIN_DOC" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "❌ node 필요" >&2
  exit 1
fi

IMPORT_LINE="@${ADMIN_DOC}"
MARKER_HEADER="<!-- BEGIN ADMIN_COMMANDS (managed by install-admin-commands.sh) -->"
MARKER_FOOTER="<!-- END ADMIN_COMMANDS -->"

echo "[install] agents.json → $CONFIG_PATH"
echo "[install] ADMIN_COMMANDS → $ADMIN_DOC"
echo ""

# agents.json에서 id + repo 경로 뽑기 (node로 JSON 파싱)
ENTRIES_TMP="$(mktemp)"
node -e "
  const cfg = require('$CONFIG_PATH');
  for (const [id, agent] of Object.entries(cfg)) {
    if (!agent.repo) continue;
    console.log(id + '\t' + agent.repo);
  }
" > "$ENTRIES_TMP"

if [ ! -s "$ENTRIES_TMP" ]; then
  echo "⚠️  agents.json에 등록된 에이전트 없음"
  rm -f "$ENTRIES_TMP"
  exit 0
fi

INSTALLED=0
SKIPPED=0
MISSING=0

while IFS=$'\t' read -r id repo; do
  [ -z "$id" ] && continue
  claude_md="$repo/CLAUDE.md"

  if [ ! -d "$repo" ]; then
    echo "  ⚠️  $id — 레포 경로 없음 ($repo) → 스킵"
    MISSING=$((MISSING + 1))
    continue
  fi

  if grep -Fq "$MARKER_HEADER" "$claude_md" 2>/dev/null; then
    echo "  ⏭️  $id — 이미 주입됨 (CLAUDE.md)"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # CLAUDE.md 없으면 새로 만들고, 있으면 최상단에 블록 prepend
  tmp="$(mktemp)"
  {
    echo "$MARKER_HEADER"
    echo "$IMPORT_LINE"
    echo "$MARKER_FOOTER"
    echo ""
    if [ -f "$claude_md" ]; then
      cat "$claude_md"
    fi
  } > "$tmp"
  mv "$tmp" "$claude_md"

  echo "  ✓ $id — 주입 완료 ($claude_md)"
  INSTALLED=$((INSTALLED + 1))
done < "$ENTRIES_TMP"

rm -f "$ENTRIES_TMP"

echo ""
echo "완료: 주입 $INSTALLED, 스킵 $SKIPPED, 누락 $MISSING"
echo ""
echo "⚠️  에이전트가 새 지침을 읽으려면 세션 재시작이 필요합니다:"
echo "     npx agents restart-all"

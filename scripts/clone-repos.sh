#!/bin/bash
# 에이전트 레포 일괄 클론 스크립트
# 사용법: bash scripts/clone-repos.sh [레포디렉토리]
#
# 이 파일을 수정하여 본인의 레포 목록을 추가하세요.

set -e

REPOS_DIR="${1:-.repos}"

# === 여기에 레포 목록을 추가하세요 ===
# 형식: "에이전트이름|git_clone_url"
declare -a REPOS=(
  "my-project|git@github.com:username/my-project.git"
  "another-project|git@github.com:username/another-project.git"
)

mkdir -p "$REPOS_DIR"

for entry in "${REPOS[@]}"; do
  name="${entry%%|*}"
  url="${entry##*|}"
  target="$REPOS_DIR/$name"

  if [ -d "$target/.git" ]; then
    echo "✅ $name — 이미 존재, git pull"
    cd "$target" && git pull --ff-only 2>/dev/null || true
  else
    echo "📥 $name — 클론 중..."
    git clone "$url" "$target"
  fi
done

echo ""
echo "✅ 전체 레포 준비 완료 ($REPOS_DIR)"

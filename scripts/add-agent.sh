#!/bin/bash
# 에이전트 자동 추가 스크립트
#
# agents.json 수정 → 레포 클론 → fresh 세션까지 자동화.
#
# 사용법:
#   bash scripts/add-agent.sh <name> <repo-url> <channel-id> <bot-token> [description]
#
# 예시 (로컬에서 바로 실행):
#   bash scripts/add-agent.sh my-project git@github.com:me/my-project.git 1234...678 MTxxx "프로젝트 설명"
#
# 환경변수:
#   REPOS_DIR           레포 클론 디렉토리 (기본: .repos — agent-hub 레포 안)
#   ALLOW_FROM          Discord 유저 ID (필수)
#
# 원격 서버에 SSH로 적용하고 싶으면:
#   REMOTE_SSH          SSH alias 설정 시: git commit + push → ssh → pull → clone → fresh
#   REMOTE_REPOS_DIR    서버 레포 디렉토리 (기본: $HOME/repos)
#   REMOTE_HUB_DIR      서버 agent-hub 경로 (기본: ~/oh-my-discord-agents)

set -e

if [ $# -lt 4 ]; then
  cat <<EOF
사용법: bash scripts/add-agent.sh <name> <repo-url> <channel-id> <bot-token> [description]

필수 환경변수:
  ALLOW_FROM=<디스코드유저ID>    에이전트 제어 권한 유저 ID

예시:
  ALLOW_FROM=1234567890 bash scripts/add-agent.sh my-app git@github.com:me/my-app.git 99887766 MTxxx "내 앱"

원격 배포 (SSH):
  REMOTE_SSH=myserver ALLOW_FROM=... bash scripts/add-agent.sh ...
EOF
  exit 1
fi

NAME="$1"
REPO_URL="$2"
CHANNEL_ID="$3"
BOT_TOKEN="$4"
DESCRIPTION="${5:-$NAME}"

if [ -z "${ALLOW_FROM:-}" ]; then
  echo "❌ ALLOW_FROM 환경변수를 설정하세요 (Discord 유저 ID)"
  exit 1
fi

cd "$(dirname "$0")/.."

if ! command -v jq > /dev/null; then
  echo "❌ jq가 필요합니다. 'brew install jq' 또는 'apt install jq'"
  exit 1
fi

REMOTE_MODE=false
if [ -n "${REMOTE_SSH:-}" ]; then
  REMOTE_MODE=true
  REPOS_DIR="${REMOTE_REPOS_DIR:-$HOME/repos}"
  HUB_DIR="${REMOTE_HUB_DIR:-~/oh-my-discord-agents}"
else
  REPOS_DIR="${REPOS_DIR:-.repos}"
fi

# REPOS_DIR이 상대경로면 절대경로로 (agents.json에 기록용)
if [ "$REMOTE_MODE" = false ]; then
  case "$REPOS_DIR" in
    /*) ABS_REPOS_DIR="$REPOS_DIR" ;;
    *)  ABS_REPOS_DIR="$(cd "$(pwd)" && echo "$(pwd)/$REPOS_DIR")" ;;
  esac
  REPO_PATH="$ABS_REPOS_DIR/$NAME"
else
  REPO_PATH="$REPOS_DIR/$NAME"
fi

# 1. agents.json 업데이트
echo "[1/4] agents.json 업데이트 ($NAME)"

# agents.json 없으면 생성
[ ! -f agents.json ] && echo '{}' > agents.json

if jq -e --arg name "$NAME" '.[$name]' agents.json > /dev/null 2>&1; then
  echo "❌ 이미 존재하는 에이전트: $NAME"
  exit 1
fi

jq --arg name "$NAME" \
   --arg channelId "$CHANNEL_ID" \
   --arg repo "$REPO_PATH" \
   --arg botToken "$BOT_TOKEN" \
   --arg allowFrom "$ALLOW_FROM" \
   --arg description "$DESCRIPTION" \
   '. + {($name): {
      channels: [{id: $channelId, requireMention: false}],
      repo: $repo,
      botToken: $botToken,
      allowFrom: [$allowFrom],
      description: $description
    }}' agents.json > agents.json.tmp && mv agents.json.tmp agents.json

# 2. 레포 클론
if [ "$REMOTE_MODE" = true ]; then
  echo "[2/4] git commit + push → 원격 서버($REMOTE_SSH)에서 pull + clone"
  git add agents.json
  git commit -m "feat: add $NAME agent"
  git push

  ssh "$REMOTE_SSH" bash -s <<EOF
set -e
cd $HUB_DIR
git pull --ff-only
if [ ! -d "$REPO_PATH/.git" ]; then
  echo "📥 레포 클론: $REPO_URL → $REPO_PATH"
  mkdir -p "$REPOS_DIR"
  git clone "$REPO_URL" "$REPO_PATH"
else
  echo "✅ 레포 이미 존재: $REPO_PATH"
fi
EOF
else
  echo "[2/4] 레포 클론"
  mkdir -p "$ABS_REPOS_DIR"
  if [ ! -d "$REPO_PATH/.git" ]; then
    echo "📥 $REPO_URL → $REPO_PATH"
    git clone "$REPO_URL" "$REPO_PATH"
  else
    echo "✅ 레포 이미 존재: $REPO_PATH"
  fi
fi

# 3. fresh session
echo "[3/4] npx agents fresh $NAME"
if [ "$REMOTE_MODE" = true ]; then
  ssh "$REMOTE_SSH" "cd $HUB_DIR && npx agents fresh $NAME"
else
  npx agents fresh "$NAME"
fi

# 4. 상태 확인
echo "[4/4] 상태 확인"
sleep 2
if [ "$REMOTE_MODE" = true ]; then
  ssh "$REMOTE_SSH" "cd $HUB_DIR && npx agents status $NAME"
else
  npx agents status "$NAME"
fi

echo ""
echo "✅ $NAME 에이전트 추가 완료"
echo "   채널: $CHANNEL_ID"
echo "   레포: $REPO_PATH"

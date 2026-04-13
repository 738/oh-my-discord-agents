#!/bin/bash
# 모든 에이전트 세션에 접속하여 Discord 봇 활성화
# 사용법: bash scripts/activate-all.sh

SESSIONS=$(tmux ls 2>/dev/null | cut -d: -f1)

if [ -z "$SESSIONS" ]; then
  echo "❌ 실행 중인 tmux 세션이 없습니다."
  echo "먼저 npm run dev를 실행하세요."
  exit 1
fi

echo "📋 세션 목록:"
echo "$SESSIONS"
echo ""

for session in $SESSIONS; do
  echo "🔄 $session — 활성화 중..."
  # 빈 키 전송으로 세션 깨우기
  tmux send-keys -t "$session" "" 2>/dev/null
  sleep 1
done

echo ""
echo "✅ 전체 세션 활성화 완료"
echo "Discord 봇이 온라인 상태인지 확인하세요."

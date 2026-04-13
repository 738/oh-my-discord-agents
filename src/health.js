import { getAgents } from './config.js';
import { sessionExists, restartSession } from './tmux.js';

const HEALTH_INTERVAL = 5 * 60 * 1000;

async function sendLog(message) {
  const webhookUrl = process.env.LOG_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message }),
    });
  } catch (err) {
    console.error('[health] webhook 전송 실패:', err.message);
  }
}

export function startHealthCheck() {
  setInterval(async () => {
    const agents = getAgents();

    for (const [id, agent] of Object.entries(agents)) {
      if (!sessionExists(id)) {
        restartSession(id, agent);
        console.log(`[health] ${id} 세션 죽음 → 자동 재시작`);
        await sendLog(`🔄 **${id}** 세션 죽음 감지 → 자동 재시작 완료`);
      }
    }
  }, HEALTH_INTERVAL);

  console.log('[health] 헬스체크 시작 (5분 간격)');
}

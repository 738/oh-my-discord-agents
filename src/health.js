import { getAgents } from './config.js';
import { sessionExists, restartSession, getSessionStatus, sendKeys } from './tmux.js';

const HEALTH_INTERVAL = 5 * 60 * 1000;
const IMAGE_OVERFLOW_INTERVAL = 30 * 1000;
const COMPACT_COOLDOWN = 2 * 60 * 1000;
const IMAGE_OVERFLOW_PATTERN = /exceeds the dimension limit|many-image requests/i;
const lastCompactAt = new Map();

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

export function startImageOverflowWatcher() {
  setInterval(async () => {
    const agents = getAgents();
    const now = Date.now();

    for (const id of Object.keys(agents)) {
      if (!sessionExists(id)) continue;

      const { lastOutput } = getSessionStatus(id, { scrollback: 200 });
      if (!IMAGE_OVERFLOW_PATTERN.test(lastOutput)) continue;

      const last = lastCompactAt.get(id) ?? 0;
      if (now - last < COMPACT_COOLDOWN) continue;

      lastCompactAt.set(id, now);
      try {
        sendKeys(id, '/compact');
        console.log(`[image-overflow] ${id} → /compact 자동 실행`);
        await sendLog(`🖼️ **${id}** 이미지 한도 감지 → \`/compact\` 자동 실행`);
      } catch (err) {
        console.error(`[image-overflow] ${id} sendKeys 실패:`, err.message);
      }
    }
  }, IMAGE_OVERFLOW_INTERVAL);

  console.log('[image-overflow] watcher 시작 (30초 간격)');
}

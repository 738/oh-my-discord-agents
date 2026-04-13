import { getAgents, onReload } from './config.js';
import { initAllSessions, initNewSessions } from './tmux.js';
import { startHealthCheck } from './health.js';

console.log('🚀 Agent Hub 시작');

const results = initAllSessions();
const created = results.filter((r) => r.status === 'created').length;
const existing = results.filter((r) => r.status === 'exists').length;
console.log(`[init] 세션 ${created}개 생성, ${existing}개 기존`);

onReload((agents) => {
  initNewSessions(agents);
});

startHealthCheck();

console.log('✅ Agent Hub 준비 완료');

setInterval(() => {}, 60_000);

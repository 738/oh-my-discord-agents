import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { getAgents } from './config.js';

const HOME = process.env.HOME;
const AGENTS_STATE_BASE = `${HOME}/.claude-agents`;

/**
 * 모든 에이전트의 tmux 세션을 초기화
 */
export function initAllSessions() {
  const agents = getAgents();
  const results = [];

  for (const [id, agent] of Object.entries(agents)) {
    if (sessionExists(id)) {
      console.log(`[tmux] ${id} — 세션 존재, 스킵`);
      results.push({ id, status: 'exists' });
    } else {
      setupDiscordState(id, agent);
      createSession(id, agent);
      results.push({ id, status: 'created' });
    }
  }

  return results;
}

/**
 * 새로 추가된 에이전트만 세션 생성
 */
export function initNewSessions(agents) {
  for (const [id, agent] of Object.entries(agents)) {
    if (!sessionExists(id)) {
      setupDiscordState(id, agent);
      createSession(id, agent);
      console.log(`[tmux] ${id} — 새 세션 생성`);
    }
  }
}

/**
 * 에이전트별 Discord state 디렉토리 생성
 * DISCORD_STATE_DIR로 봇 토큰 + access.json 격리
 */
export function setupDiscordState(agentId, agent) {
  const stateDir = `${AGENTS_STATE_BASE}/${agentId}/discord`;
  mkdirSync(stateDir, { recursive: true });

  // 봇 토큰
  if (agent.botToken) {
    writeFileSync(`${stateDir}/.env`, `DISCORD_BOT_TOKEN=${agent.botToken}\n`, { mode: 0o600 });
  }

  // access.json
  const access = {
    dmPolicy: 'allowlist',
    allowFrom: agent.allowFrom || [],
    groups: {},
    pending: {},
  };

  const channels = agent.channels || (agent.channelId ? [{ id: agent.channelId }] : []);
  for (const ch of channels) {
    access.groups[ch.id] = {
      requireMention: ch.requireMention ?? false,
      allowFrom: agent.allowFrom || [],
    };
  }

  writeFileSync(`${stateDir}/access.json`, JSON.stringify(access, null, 2) + '\n');
  console.log(`[setup] ${agentId} — Discord state 설정 완료 (${stateDir})`);
}

export function sessionExists(sessionName) {
  try {
    execSync(`tmux has-session -t ${sessionName} 2>/dev/null`);
    return true;
  } catch {
    return false;
  }
}

/**
 * tmux 세션 생성
 * - DISCORD_STATE_DIR로 에이전트별 봇 토큰 격리
 * - continueSession=true면 `claude --continue`로 직전 대화 이어가기 (모델 전환 등에 사용)
 */
export function createSession(sessionName, agent, { continueSession = false } = {}) {
  const stateDir = `${AGENTS_STATE_BASE}/${sessionName}/discord`;
  execSync(`tmux new-session -d -s ${sessionName} -c ${agent.repo}`);

  const continueFlag = continueSession ? '--continue ' : '';
  const cmd = `export DISCORD_STATE_DIR='${stateDir}' && claude ${continueFlag}--dangerously-skip-permissions --chrome --channels plugin:discord@claude-plugins-official`;
  execSync(`tmux send-keys -t ${sessionName} "${cmd}" Enter`);

  // trust 프롬프트 자동 수락 (3초 대기 후 Enter)
  execSync('sleep 3');
  try { execSync(`tmux send-keys -t ${sessionName} Enter`); } catch {}

  console.log(`[tmux] ${sessionName} — 세션 생성 완료 (${agent.repo}${continueSession ? ', --continue' : ''})`);
}

export function killSession(agentId) {
  try {
    execSync(`tmux kill-session -t ${agentId} 2>/dev/null`);
    return true;
  } catch {
    return false;
  }
}

/**
 * 세션 재시작
 * continueSession=true(기본값): 직전 대화 이어서 재시작 (claude --continue)
 * continueSession=false: 새 세션으로 시작 (히스토리 없음)
 */
export function restartSession(agentId, agent, { continueSession = true } = {}) {
  killSession(agentId);
  setupDiscordState(agentId, agent);
  createSession(agentId, agent, { continueSession });
  console.log(`[tmux] ${agentId} — 세션 재시작 (${continueSession ? '이어서' : '새로'})`);
}

/**
 * 세션 상태 + 최근 출력 스냅샷
 */
export function getSessionStatus(agentId) {
  const running = sessionExists(agentId);
  if (!running) return { running: false, lastOutput: '' };
  let lastOutput = '';
  try {
    lastOutput = execSync(`tmux capture-pane -t ${agentId} -p`).toString().trim();
  } catch {}
  return { running: true, lastOutput };
}

/**
 * 현재 살아있는 tmux 세션 이름 목록
 */
export function listTmuxSessions() {
  try {
    const out = execSync(`tmux ls 2>/dev/null || true`).toString().trim();
    if (!out) return [];
    return out.split('\n').map((line) => line.split(':')[0]);
  } catch {
    return [];
  }
}

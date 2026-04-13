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
function setupDiscordState(agentId, agent) {
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

  if (agent.channelId) {
    access.groups[agent.channelId] = {
      requireMention: false,
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
 * DISCORD_STATE_DIR로 에이전트별 봇 토큰 격리
 */
function createSession(sessionName, agent) {
  const stateDir = `${AGENTS_STATE_BASE}/${sessionName}/discord`;
  execSync(`tmux new-session -d -s ${sessionName} -c ${agent.repo}`);

  const cmd = `export DISCORD_STATE_DIR='${stateDir}' && claude --dangerously-skip-permissions --chrome --channels plugin:discord@claude-plugins-official`;
  execSync(`tmux send-keys -t ${sessionName} "${cmd}" Enter`);

  // trust 프롬프트 자동 수락 (3초 대기 후 Enter)
  execSync('sleep 3');
  try { execSync(`tmux send-keys -t ${sessionName} Enter`); } catch {}

  console.log(`[tmux] ${sessionName} — 세션 생성 완료 (${agent.repo})`);
}

export function killSession(agentId) {
  try {
    execSync(`tmux kill-session -t ${agentId} 2>/dev/null`);
    return true;
  } catch {
    return false;
  }
}

export function restartSession(agentId, agent) {
  killSession(agentId);
  setupDiscordState(agentId, agent);
  createSession(agentId, agent);
  console.log(`[tmux] ${agentId} — 세션 재시작`);
}

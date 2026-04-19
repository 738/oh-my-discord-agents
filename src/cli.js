#!/usr/bin/env node
import { execSync } from 'child_process';
import { getAgentsOnce as getAgents } from './config.js';
import {
  initAllSessions,
  restartSession,
  killSession,
  sessionExists,
  getSessionStatus,
  listTmuxSessions,
  sendKeys,
} from './tmux.js';

const [, , rawCmd, ...rest] = process.argv;
const args = rest.filter((a) => !a.startsWith('--'));
const flags = new Set(rest.filter((a) => a.startsWith('--')));
const cmd = rawCmd || 'help';

function die(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

function usage() {
  console.log(`agents — Claude Code 에이전트 CLI

사용법:
  agents <command> [args] [--flags]

세션 조회
  list                          모든 에이전트와 세션 상태(🟢/🔴)
  status <id>                   특정 에이전트 상세 상태 + 최근 출력
  logs <id> [--lines=30]        tmux 최근 출력
  attach <id>                   tmux 세션 attach (인터랙티브)

재시작 (이어서 — claude --continue)
  restart <id>                  특정 에이전트 이어서 재시작
  restart-all [--parallel]      전체 이어서 재시작 ← 모델 전환용

재시작 (새로)
  fresh <id>                    특정 에이전트 새 세션
  fresh-all [--parallel]        전체 새 세션

대화 제어 (tmux send-keys 기반 — slash command 전달)
  send <id> "<text>"            본 세션에 텍스트 전송 + Enter
  send-all "<text>" [--parallel]  전체 세션에 브로드캐스트
  compact <id>                  send <id> "/compact" 단축
  compact-all [--parallel]      전체 세션 /compact
  clear <id>                    send <id> "/clear" 단축
  clear-all [--parallel]        전체 세션 /clear

기타
  kill <id>                     세션만 종료 (재시작 없이)
  kill-all                      모든 세션 종료
  init                          미존재 세션만 생성 (index.js와 동일)
  help                          이 도움말

예시:
  agents list
  agents restart-all            # Opus 4.7 등 새 모델로 이어서 전환
  agents fresh life-os          # life-os만 히스토리 리셋
  agents status business-os
  agents send life-os "/cost"   # 임의 slash command 전달
  agents compact-all --parallel # 전체 대화 압축 (동시에)
`);
}

function requireAgent(id) {
  if (!id) die('에이전트 ID를 지정하세요. (agents help)');
  const agents = getAgents();
  if (!agents[id]) die(`알 수 없는 에이전트: ${id}\n등록된 ID: ${Object.keys(agents).join(', ')}`);
  return agents[id];
}

function getLinesFlag(defaultValue) {
  for (const f of flags) {
    const m = f.match(/^--lines=(\d+)$/);
    if (m) return parseInt(m[1], 10);
  }
  return defaultValue;
}

async function runSendAll(text) {
  const agents = getAgents();
  const entries = Object.entries(agents);
  const parallel = flags.has('--parallel');
  console.log(`[cli] ${entries.length}개 에이전트에 송신 (${parallel ? '병렬' : '순차'}): ${JSON.stringify(text)}`);
  const exec = async ([id]) => {
    if (!sessionExists(id)) {
      console.log(`  ⚠️ ${id} — 세션 없음, 스킵`);
      return;
    }
    try {
      sendKeys(id, text);
      console.log(`  ✓ ${id}`);
    } catch (err) {
      console.log(`  ✗ ${id} — ${err.message}`);
    }
  };
  if (parallel) {
    await Promise.all(entries.map(exec));
  } else {
    for (const entry of entries) await exec(entry);
  }
  console.log('✅ 송신 완료');
}

async function runRestartAll({ continueSession }) {
  const agents = getAgents();
  const entries = Object.entries(agents);
  const parallel = flags.has('--parallel');
  const label = continueSession ? '이어서' : '새로';
  console.log(`[cli] ${entries.length}개 에이전트 ${label} 재시작 (${parallel ? '병렬' : '순차'})`);

  if (parallel) {
    await Promise.all(
      entries.map(([id, agent]) =>
        Promise.resolve().then(() => restartSession(id, agent, { continueSession })),
      ),
    );
  } else {
    for (const [id, agent] of entries) {
      restartSession(id, agent, { continueSession });
    }
  }
  console.log(`✅ 전체 ${label} 재시작 완료 (${entries.length}개)`);
}

async function main() {
  switch (cmd) {
    case 'list': {
      const agents = getAgents();
      const tmuxList = new Set(listTmuxSessions());
      const ids = Object.keys(agents);
      if (!ids.length) die('등록된 에이전트가 없습니다.');
      const width = Math.max(...ids.map((i) => i.length));
      for (const id of ids) {
        const running = tmuxList.has(id);
        const desc = agents[id].description || '';
        console.log(`${running ? '🟢' : '🔴'} ${id.padEnd(width)}  ${desc}`);
      }
      break;
    }

    case 'status': {
      const id = args[0];
      const agent = requireAgent(id);
      const status = getSessionStatus(id);
      console.log(`에이전트: ${id}`);
      console.log(`상태: ${status.running ? '🟢 running' : '🔴 dead'}`);
      console.log(`레포: ${agent.repo}`);
      if (agent.description) console.log(`설명: ${agent.description}`);
      if (status.running && status.lastOutput) {
        const tail = status.lastOutput.split('\n').slice(-10).join('\n');
        console.log('\n--- 최근 출력 (tail 10) ---');
        console.log(tail);
      }
      break;
    }

    case 'logs': {
      const id = args[0];
      requireAgent(id);
      if (!sessionExists(id)) die(`세션이 없습니다: ${id}`);
      const lines = getLinesFlag(30);
      const out = execSync(`tmux capture-pane -t ${id} -p`).toString();
      console.log(out.split('\n').slice(-lines).join('\n'));
      break;
    }

    case 'attach': {
      const id = args[0];
      requireAgent(id);
      if (!sessionExists(id)) die(`세션이 없습니다: ${id}`);
      execSync(`tmux attach -t ${id}`, { stdio: 'inherit' });
      break;
    }

    case 'restart': {
      const id = args[0];
      const agent = requireAgent(id);
      restartSession(id, agent, { continueSession: true });
      console.log(`✅ ${id} 이어서 재시작 완료`);
      break;
    }

    case 'fresh': {
      const id = args[0];
      const agent = requireAgent(id);
      restartSession(id, agent, { continueSession: false });
      console.log(`✅ ${id} 새 세션 시작 완료`);
      break;
    }

    case 'send': {
      const id = args[0];
      const text = args[1];
      requireAgent(id);
      if (text === undefined || text === '') die('전송할 텍스트를 지정하세요. 예: agents send life-os "/compact"');
      sendKeys(id, text);
      console.log(`✅ ${id} ← ${JSON.stringify(text)}`);
      break;
    }

    case 'send-all': {
      const text = args[0];
      if (text === undefined || text === '') die('전송할 텍스트를 지정하세요. 예: agents send-all "/compact"');
      await runSendAll(text);
      break;
    }

    case 'compact': {
      const id = args[0];
      requireAgent(id);
      sendKeys(id, '/compact');
      console.log(`🗜️  ${id} /compact 전송`);
      break;
    }

    case 'compact-all': {
      await runSendAll('/compact');
      break;
    }

    case 'clear': {
      const id = args[0];
      requireAgent(id);
      sendKeys(id, '/clear');
      console.log(`🧹 ${id} /clear 전송`);
      break;
    }

    case 'clear-all': {
      await runSendAll('/clear');
      break;
    }

    case 'restart-all': {
      await runRestartAll({ continueSession: true });
      break;
    }

    case 'fresh-all': {
      await runRestartAll({ continueSession: false });
      break;
    }

    case 'kill': {
      const id = args[0];
      requireAgent(id);
      const ok = killSession(id);
      console.log(ok ? `🔴 ${id} 세션 종료` : `세션이 없습니다: ${id}`);
      break;
    }

    case 'kill-all': {
      const agents = getAgents();
      let count = 0;
      for (const id of Object.keys(agents)) {
        if (killSession(id)) count++;
      }
      console.log(`🔴 ${count}개 세션 종료`);
      break;
    }

    case 'init': {
      const results = initAllSessions();
      const created = results.filter((r) => r.status === 'created').length;
      const existing = results.filter((r) => r.status === 'exists').length;
      console.log(`[init] 세션 ${created}개 생성, ${existing}개 기존`);
      break;
    }

    case 'help':
    case '--help':
    case '-h': {
      usage();
      break;
    }

    default: {
      console.error(`알 수 없는 커맨드: ${cmd}\n`);
      usage();
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

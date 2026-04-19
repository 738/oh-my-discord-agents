import { readFileSync, watchFile } from 'fs';
import { resolve } from 'path';

const CONFIG_PATH = resolve(process.env.AGENTS_CONFIG || './agents.json');

let agents = null;
let watcherStarted = false;
const listeners = [];

function load() {
  const raw = readFileSync(CONFIG_PATH, 'utf-8');
  return JSON.parse(raw);
}

function ensureLoaded() {
  if (agents === null) {
    agents = load();
  }
  if (!watcherStarted) {
    watcherStarted = true;
    watchFile(CONFIG_PATH, { interval: 3000 }, () => {
      try {
        agents = load();
        console.log(`[config] agents.json 리로드 완료 (${Object.keys(agents).length}개 에이전트)`);
        listeners.forEach((fn) => fn(agents));
      } catch (err) {
        console.error('[config] agents.json 리로드 실패:', err.message);
      }
    });
  }
}

export function getAgents() {
  ensureLoaded();
  return agents;
}

export function onReload(fn) {
  ensureLoaded();
  listeners.push(fn);
}

/**
 * watcher 없이 agents.json을 단발성으로 읽어옴 (CLI 등 단기 실행 용도)
 */
export function getAgentsOnce() {
  return load();
}

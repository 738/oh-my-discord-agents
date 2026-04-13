import { readFileSync, watchFile } from 'fs';
import { resolve } from 'path';

const CONFIG_PATH = resolve(process.env.AGENTS_CONFIG || './agents.json');

let agents = load();

function load() {
  const raw = readFileSync(CONFIG_PATH, 'utf-8');
  return JSON.parse(raw);
}

const listeners = [];

watchFile(CONFIG_PATH, { interval: 3000 }, () => {
  try {
    agents = load();
    console.log(`[config] agents.json 리로드 완료 (${Object.keys(agents).length}개 에이전트)`);
    listeners.forEach((fn) => fn(agents));
  } catch (err) {
    console.error('[config] agents.json 리로드 실패:', err.message);
  }
});

export function getAgents() {
  return agents;
}

export function onReload(fn) {
  listeners.push(fn);
}

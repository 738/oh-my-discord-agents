# Oh My Discord Agents

> 하나의 서버에서 여러 Claude Code 에이전트를 Discord 채널로 운영하는 템플릿

채널 하나 = 에이전트 하나. Discord에서 메시지를 보내면 해당 프로젝트의 Claude Code가 응답합니다.

## 구조

```
┌─ Discord Server ─────────────────────┐
│                                      │
│  #project-a      ──→  🤖 봇A         │
│  #project-b      ──→  🤖 봇B         │
│  #project-c      ──→  🤖 봇C         │
│                                      │
└──────────────────────────────────────┘
         │
         ▼
┌─ 서버 (tmux) ────────────────────────┐
│                                      │
│  tmux: project-a                     │
│  └─ claude --channels discord        │
│     └─ DISCORD_STATE_DIR (봇A 격리)   │
│                                      │
│  tmux: project-b                     │
│  └─ claude --channels discord        │
│     └─ DISCORD_STATE_DIR (봇B 격리)   │
│                                      │
│  ...                                 │
└──────────────────────────────────────┘
```

## 실행 구조

```mermaid
graph TD
    A[npm run dev] --> B[index.js]
    B --> C[config.js<br/>agents.json 로드]
    B --> D[tmux.js<br/>initAllSessions]
    B --> E[health.js<br/>startHealthCheck]

    C -->|watchFile 3초| C1{agents.json 변경?}
    C1 -->|Yes| C2[리로드 + onReload 콜백]
    C2 --> D2[initNewSessions<br/>새 에이전트만 세션 생성]

    D --> F{에이전트별 루프}
    F --> G{세션 존재?}
    G -->|No| H[setupDiscordState<br/>봇토큰 + access.json 생성]
    H --> I[createSession<br/>tmux 세션 생성]
    I --> J[claude --channels discord<br/>DISCORD_STATE_DIR 격리]
    G -->|Yes| K[스킵]

    E -->|5분 간격| L{에이전트별 체크}
    L --> M{세션 살아있음?}
    M -->|No| N[restartSession<br/>자동 복구]
    N -->|webhook| O[Discord 알림]
    M -->|Yes| P[패스]

    style A fill:#4a9eff,color:#fff
    style J fill:#5865F2,color:#fff
    style N fill:#ed4245,color:#fff
    style O fill:#57F287,color:#fff
```

## 핵심 원리

Claude Code의 `--channels plugin:discord@claude-plugins-official` 기능으로 Discord 채널과 연결합니다.

`DISCORD_STATE_DIR` 환경변수로 에이전트마다 봇 토큰과 접근 설정을 격리하여, **하나의 서버에서 여러 Discord 봇을 동시에 운영**할 수 있습니다.

## 사전 준비

- Linux 서버 (tmux 필요)
- [Claude Code](https://claude.ai/code) 설치 + `claude login` (OAuth)
- [Bun](https://bun.sh) 설치 (Discord 채널 플러그인 런타임)
- Claude Code 내에서 `/plugin install discord@claude-plugins-official`

## 빠른 시작

### 1. 클론

```bash
git clone https://github.com/738/oh-my-discord-agents.git
cd oh-my-discord-agents
```

### 2. Discord 봇 생성

에이전트 수만큼 봇을 생성합니다. 각 봇마다 [Discord Developer Portal](https://discord.com/developers/applications)에서:

1. **New Application** → 앱 이름 입력
2. **Bot** 탭 → Privileged Gateway Intents **3개 모두 활성화**:
   - Presence Intent
   - Server Members Intent
   - Message Content Intent
3. **Bot** → **Reset Token** → 토큰 복사 (한 번만 표시됨)
4. **OAuth2** → **URL Generator**:
   - Scopes: `bot`
   - Bot Permissions: `Send Messages`, `Read Message History`, `View Channels`
   - 생성된 URL로 접속 → 서버에 봇 추가

### 3. Discord 채널 생성

1. Discord 서버에서 에이전트별 채널 생성 (예: `#project-a`)
2. 채널 우클릭 → **채널 ID 복사**
   - 개발자 모드 필요: 사용자 설정 → 고급 → 개발자 모드 활성화

### 4. agents.json 설정

`agents.example.json`을 복사하여 작성합니다:

```bash
cp agents.example.json agents.json
```

```json
{
  "project-a": {
    "channels": [
      { "id": "디스코드채널ID_1", "requireMention": false },
      { "id": "디스코드채널ID_2", "requireMention": true }
    ],
    "repo": "/path/to/project-a",
    "botToken": "봇토큰",
    "allowFrom": ["디스코드유저ID"],
    "description": "프로젝트 A"
  },
  "project-b": {
    "channels": [
      { "id": "디스코드채널ID", "requireMention": true }
    ],
    "repo": "/path/to/project-b",
    "botToken": "봇토큰",
    "allowFrom": ["디스코드유저ID"],
    "description": "프로젝트 B"
  }
}
```

| 필드 | 설명 |
|------|------|
| `channels` | 채널 설정 배열 |
| `channels[].id` | Discord 채널 ID |
| `channels[].requireMention` | `true`면 해당 채널에서 봇 멘션 시에만 응답 (기본값: `false`) |
| `repo` | 프로젝트 레포 경로 (절대 경로) |
| `botToken` | Discord 봇 토큰 |
| `allowFrom` | 허용할 Discord 유저 ID 목록 |
| `description` | 에이전트 설명 (로그용) |

> **유저 ID 확인:** Discord에서 본인 프로필 우클릭 → 사용자 ID 복사

### 5. 실행

```bash
cp .env.example .env
# LOG_WEBHOOK_URL 설정 (선택 — Discord webhook으로 헬스체크 알림)

npm run dev
```

### 6. 확인

```bash
# 세션 확인
tmux ls

# 에이전트 세션 접속
tmux attach -t project-a
# "Listening for channel messages" 표시되면 성공
# Ctrl+B, D 로 빠져나오기
```

Discord 채널에 메시지를 보내서 응답이 오는지 확인합니다.

## 파일 구조

```
oh-my-discord-agents/
├── src/
│   ├── index.js      # 엔트리포인트
│   ├── config.js     # agents.json 로드 + 핫 리로드 (3초)
│   ├── tmux.js       # tmux 세션 관리 + DISCORD_STATE_DIR 격리
│   └── health.js     # 5분 헬스체크 + 자동 복구 + webhook 알림
├── scripts/
│   └── clone-repos.sh    # 레포 일괄 클론 스크립트
├── agents.json           # 에이전트 설정 (직접 작성)
├── agents.example.json   # 에이전트 설정 예시
├── .env.example          # 환경변수 템플릿
├── .gitignore
├── package.json
└── README.md
```

## 에이전트 추가

1. Discord에 채널 + 봇 생성
2. `agents.json`에 항목 추가
3. 레포를 서버에 클론
4. 저장하면 핫 리로드로 자동 생성 (또는 `tmux kill-server && npm run dev`)

## 운영

```bash
# 전체 세션 확인
tmux ls

# 특정 에이전트 세션 접속
tmux attach -t project-a

# 전체 재시작
tmux kill-server && npm run dev
```

## 주의사항

- 에이전트가 idle 상태일 때는 토큰을 소비하지 않습니다
- `agents.json`에 봇 토큰이 포함되므로 **public repo에 올리지 마세요**
- 서버 재부팅 시 `npm run dev`를 다시 실행해야 합니다 (systemd 등록 권장)

## Release Notes

### v1.1.0

- **멀티 채널 지원**: 하나의 에이전트가 여러 Discord 채널에서 동시에 응답할 수 있도록 `channels` 배열 설정 추가
- **채널별 멘션 옵션**: `requireMention` 옵션으로 채널마다 봇 멘션 필요 여부를 개별 설정 가능
- **실행 구조 다이어그램**: README에 mermaid 기반 시스템 흐름도 추가
- **하위 호환**: 기존 `channelId` 단일값 형식도 계속 동작

### v1.0.0

- 초기 릴리즈
- tmux 기반 멀티 에이전트 세션 관리
- `DISCORD_STATE_DIR` 격리로 봇 토큰 분리
- agents.json 핫 리로드 (3초 간격)
- 5분 헬스체크 + 자동 복구 + webhook 알림

## 라이선스

MIT

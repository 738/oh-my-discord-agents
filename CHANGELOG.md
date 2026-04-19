# Changelog

모든 주요 변경사항은 이 파일에 기록됩니다.

[Keep a Changelog](https://keepachangelog.com/ko/1.1.0/) 형식을 따르고, [Semantic Versioning](https://semver.org/lang/ko/)을 준수합니다.

## [1.4.0] - 2026-04-20

### Added
- `scripts/add-agent.sh` — 에이전트 추가 자동화 스크립트. 봇 토큰 + 채널 ID + 레포 URL을 주면 `agents.json` 업데이트, 레포 클론, fresh 세션까지 한 번에 처리.
  - 로컬 모드 (기본): 현재 머신에서 `.repos/<name>`에 클론 후 세션 시작
  - 원격 모드 (`REMOTE_SSH=<host>` 설정 시): git commit + push → SSH → git pull → clone → fresh
  - `ALLOW_FROM` 환경변수로 Discord 유저 ID 지정

## [1.3.0] - 2026-04-20

### Added
- `agents send <id> "<text>"` — tmux send-keys 기반으로 임의 slash command 전달
- `agents send-all "<text>" [--parallel]` — 전체 세션 브로드캐스트
- `agents compact` / `agents clear` / `-all` — slash command 단축 커맨드
- Discord 채널에서 `!compact` / `!clear` / `!send` 관리자 명령어 (allowFrom 권한 필요)
- `scripts/install-admin-commands.sh` / `uninstall-admin-commands.sh` — 각 레포 `CLAUDE.md`에 관리자 명령어 지침 자동 주입/해제
- `docs/ADMIN_COMMANDS.md` — 에이전트가 참조하는 Discord 관리자 명령어 가이드

## [1.2.0] - 2026-04-19

### Added
- `agents` CLI — 세션 수동 제어 (list / status / restart / fresh / kill / attach / logs / init)
- `agents restart` / `restart-all` — `claude --continue`로 대화 히스토리 유지한 채 재시작 (모델 전환용)
- `agents fresh` / `fresh-all` — 새 세션 (히스토리 리셋)
- `--parallel` 플래그로 전체 재시작 병렬화

## [1.1.0] - 2026-04-14

### Added
- `agents.json`에 `channels` 배열 지원 — 에이전트 하나가 여러 채널 수신 가능
- `requireMention` per-channel 옵션 — 채널마다 봇 멘션 필요 여부 독립 제어

### Changed
- 단일 `channelId` 필드는 `channels: [{id, requireMention}]` 배열 구조로 마이그레이션

## [1.0.0] - 2026-04-14

### Added
- 초기 릴리스
- `DISCORD_STATE_DIR` 환경변수로 에이전트마다 봇 토큰/접근 설정 격리 → 하나의 서버에서 멀티 봇 운영
- `agents.json` 핫 리로드 — 파일 저장 시 새 에이전트 자동 세션 생성
- 5분 주기 헬스체크 + tmux 세션 자동 복구 + webhook 알림
- `scripts/clone-repos.sh` — 에이전트 레포 일괄 클론
- `scripts/activate-all.sh` — Discord 봇 초기화 일괄 실행

[1.4.0]: https://github.com/738/oh-my-discord-agents/releases/tag/v1.4.0
[1.3.0]: https://github.com/738/oh-my-discord-agents/releases/tag/v1.3.0
[1.2.0]: https://github.com/738/oh-my-discord-agents/releases/tag/v1.2.0
[1.1.0]: https://github.com/738/oh-my-discord-agents/releases/tag/v1.1.0
[1.0.0]: https://github.com/738/oh-my-discord-agents/releases/tag/v1.0.0

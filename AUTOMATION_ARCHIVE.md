# 자동 수집 아카이브 (종료됨)

> **상태: 2026-06-29 자동 수집 중단.**
> 아래는 운영했던 자동화 구조에 대한 기록이다. 실제 스케줄러(launchd) 등록은
> 제거되었으므로 더 이상 매일 자동으로 뉴스를 수집하지 않는다.
> 다시 켜는 방법은 맨 아래 "재가동 방법" 참고.

## 운영 기간

- 2026-05-22 ~ 2026-06-29 (매일 05:00 자동 수집)

## 전체 구조

매일 새벽 5시에 macOS가 헤드리스 Claude Code를 실행해 한국 매체 뉴스를 수집하고,
결과 JSON을 커밋·푸시하면 GitHub Pages가 자동 반영하는 파이프라인이었다.

```
[launchd]  매일 05:00 트리거               ← macOS 기본 스케줄러
    ↓
[scripts/run-collect.sh]  실행 본체        ← zsh 쉘 스크립트
    ↓
[claude -p "..."]  뉴스 수집·JSON 저장     ← Claude Code (헤드리스 모드)
    ↓
[run-collect.sh]  파일 확인 → git add/commit/push   ← 쉘 + git
    ↓
[GitHub Pages]  사이트 자동 갱신
```

## 구성 요소별 역할

| 구성 요소               | 위치                                                         | 역할                                  |
| ----------------------- | ------------------------------------------------------------ | ------------------------------------- |
| launchd 등록(실제 실행) | `~/Library/LaunchAgents/com.taewook.tech-news-collect.plist` | 매일 05:00 트리거                     |
| launchd 설정 사본       | `scripts/com.taewook.tech-news-collect.plist`                | 저장소 보관용(실행 안 됨)             |
| 실행 스크립트           | `scripts/run-collect.sh`                                     | 수집 호출 + 성공 판정 + git 커밋·푸시 |
| 수집 워크플로우 지침    | `collect.md`                                                 | Claude가 따르는 수집 규칙             |
| 실행 로그               | `logs/collect-<날짜>.log`, `logs/launchd.log`                | 날짜별 실행 기록                      |

## Claude가 관여한 지점

`scripts/run-collect.sh` 의 `claude -p` 호출 한 군데에서만 Claude가 동작했다.

```bash
"$CLAUDE" -p "$PROMPT" \
  --allowedTools "WebSearch,WebFetch,Read,Write,Edit,Bash,ToolSearch" \
  --permission-mode acceptEdits
```

- 모드: 헤드리스(`-p`) — 터미널 UI 없이 프롬프트 1회 실행 후 종료
- Claude가 한 일:
  1. `collect.md` 읽어 수집 규칙 파악 (Read)
  2. 웹 검색으로 한국 매체 AI·개발·기타 뉴스 수집 (WebSearch)
  3. 각 기사 원문 확인 — URL·발행일·제목·썸네일 검증 (WebFetch)
  4. 중복 제거 / 카테고리 정렬 / 큐레이션 판단
  5. `data/<날짜>.json` 생성 + `data/index.json` 갱신 (Write/Edit)
- git 커밋·푸시는 Claude가 하지 않고 쉘 스크립트가 담당했다(프롬프트에 명시).

## launchd 스케줄

- `StartCalendarInterval`: 매일 Hour=5, Minute=0
- 사용자 에이전트(`~/Library/LaunchAgents/`)라 **로그인 세션에서만** 실행
- Mac이 완전히 꺼져 있던 날은 건너뜀

## 중단(제거) 작업 내역

자동 수집을 멈추기 위해 수행한 작업:

```bash
# 1. launchd 작업 해제(언로드)
launchctl bootout gui/$(id -u)/com.taewook.tech-news-collect

# 2. 실제 등록 plist 삭제
rm ~/Library/LaunchAgents/com.taewook.tech-news-collect.plist
```

> 저장소 내 `scripts/run-collect.sh` 와 `scripts/com.taewook.tech-news-collect.plist`
> 는 기록 목적으로 남겨둔다(이것만으로는 자동 실행되지 않음).
> 기존 수집 데이터(`data/`)와 사이트는 그대로 유지된다.

## 재가동 방법

다시 매일 자동 수집을 켜려면:

```bash
# 저장소 사본을 LaunchAgents 로 복사
cp scripts/com.taewook.tech-news-collect.plist ~/Library/LaunchAgents/

# launchd 에 등록
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.taewook.tech-news-collect.plist

# (선택) 바로 한 번 실행해 보기
launchctl start com.taewook.tech-news-collect
```

수동으로 한 번만 수집하려면 스케줄러 없이 직접 실행해도 된다:

```bash
zsh scripts/run-collect.sh
```

#!/bin/zsh
#
# 매일 뉴스 수집 — macOS launchd가 매일 05:00에 호출한다.
# collect.md 워크플로우를 헤드리스 Claude Code로 실행해
# data/<오늘날짜>.json 을 만들고 data/index.json 을 갱신한다.
# git 커밋·푸시는 하지 않는다 (사용자가 직접 검토 후 푸시).
#
set -u

PROJ="/Users/yangtaeuk/워크스페이스/01_개인/01_project/01_side/06_tech_news_collection"
CLAUDE="$HOME/.local/bin/claude"
LOG_DIR="$PROJ/logs"

# launchd는 최소 PATH로 실행되므로 직접 지정 (git·python3·claude 등)
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.local/bin"

mkdir -p "$LOG_DIR"
TODAY="$(date '+%Y-%m-%d')"
LOG="$LOG_DIR/collect-$TODAY.log"

PROMPT='이 디렉터리의 collect.md 파일을 읽고, 거기 정의된 "매일 뉴스 수집 워크플로우"를 그대로 실행해줘. 한국 매체에서 발행된 AI·개발·기타(전자기기·경제) 뉴스를 웹 검색으로 수집해 오늘 날짜의 data/<날짜>.json 파일을 만들고 data/index.json 을 갱신해. git 커밋이나 푸시는 절대 하지 마 — 파일 저장까지만 하고 끝내.'

{
  echo "════════ 수집 시작: $(date '+%Y-%m-%d %H:%M:%S %Z') ════════"

  cd "$PROJ" || { echo "ERROR: 프로젝트 폴더 없음: $PROJ"; echo "════════ 종료 (실패) ════════"; exit 1; }

  "$CLAUDE" -p "$PROMPT" \
    --allowedTools "WebSearch,WebFetch,Read,Write,Edit,Bash,ToolSearch" \
    --permission-mode acceptEdits
  RC=$?

  echo
  if [ -f "$PROJ/data/$TODAY.json" ]; then
    echo "✅ 성공: data/$TODAY.json 생성됨 (claude exit=$RC)"
    echo "   → 검토 후  git add data/ && git commit && git push  로 사이트에 반영"
  else
    echo "⚠️  data/$TODAY.json 이 없음 — 수집이 실패했을 수 있음 (claude exit=$RC)"
  fi
  echo "════════ 수집 종료: $(date '+%Y-%m-%d %H:%M:%S %Z') ════════"
} >> "$LOG" 2>&1

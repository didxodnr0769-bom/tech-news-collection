# 테크 뉴스 콜렉션

개발팀이 매일 참고하는 **AI · 개발 · 기타** 뉴스 모음.
Claude Code가 매일 아침 5시에 웹을 검색해 뉴스를 수집하고, 정적 사이트로 공유한다.

## 구조

```
06_tech_news_collection/
├── index.html          # 단일 페이지 (뉴스 + 카테고리 필터 + 태그 집계 + 북마크 + 검색 + 날짜 선택)
├── assets/
│   ├── style.css       # 반응형(768/480px) · 카드/태그/캘린더 스타일 · 읽음 표시
│   └── app.js          # JSON 로드 · 렌더 · 필터/검색 · 태그 집계 · 북마크 · 읽음 표시 · 무한 스크롤
├── data/
│   ├── index.json      # 사이트 메타 + 수집된 날짜 목록
│   └── 2026-05-21.json # 날짜별 뉴스 데이터
├── scripts/
│   ├── run-collect.sh                       # launchd가 매일 호출하는 수집 스크립트
│   └── com.taewook.tech-news-collect.plist  # launchd 설정 참고용 사본
├── logs/               # 수집 실행 로그 (git 추적 제외)
├── collect.md          # 매일 수집 워크플로우 (Claude 실행 지침)
└── README.md
```

## 로컬에서 보기

`file://`로 직접 열면 브라우저 보안 정책 때문에 JSON `fetch`가 막힌다.
정적 서버로 실행할 것:

```bash
cd 06_tech_news_collection
python3 -m http.server 8080
# 브라우저에서 http://localhost:8080 열기
```

## 데이터 형식

**`data/index.json`**
```json
{
  "site_title": "테크 뉴스 콜렉션",
  "description": "...",
  "categories": ["AI", "개발", "기타"],
  "subcategories": { "기타": ["전자기기", "경제"] },
  "dates": ["2026-05-21"],
  "last_updated": "2026-05-21T05:00:00+09:00"
}
```

**`data/<날짜>.json`** — 기사 객체 필드는 `collect.md` 참고. 각 기사에는 핵심 토픽
키워드 1~2개를 담은 `tags` 배열이 포함된다.

## 화면 기능

- **카테고리 필터** — `전체` · `AI` · `개발` · `기타` 중 하나를 누르면 해당 카테고리만
  남는다. 다른 필터(날짜·태그·검색·북마크)와 자유롭게 조합된다.
- **검색** — 상단 검색창에 입력하면 제목·요약에서 키워드를 찾는다. 입력 즉시(input
  이벤트) 필터링되고, 현재의 날짜·카테고리·태그·북마크 조건과 함께 동작한다.
- **날짜 선택** — `‹` / `›` 버튼으로 데이터가 있는 인접 날짜로 이동하고, 가운데 버튼을
  누르면 캘린더 팝업이 열려 임의 날짜를 고를 수 있다(데이터가 있는 날짜만 활성화). 우측
  `전체 기간` 토글로 모든 날짜를 가로지른다. 모든 날짜 JSON을 초기 로드 시 한 번에
  불러오므로 `전체 기간` 상태에서도 검색·필터가 그대로 동작한다.
- **태그 집계** — 모든 기사의 `tags`를 **전체 날짜 기준**으로 집계해 많은 순으로 칩을
  보여주며, 카드 안에서도 `#태그`를 누르면 같은 효과로 필터링된다. 기본은 2줄까지만
  노출하고, `더보기`를 누를 때마다 2줄씩 점진적으로 펼쳐진다(`접기`로 기본 상태 복귀).
- **북마크** — 카드의 ☆ 버튼으로 기사를 북마크하면 브라우저 `localStorage`
  (`tnc:bookmarks`)에 저장된다. 상단 `★ 북마크 N` 토글로 북마크한 기사만 전체 날짜에서
  모아 본다. (기기·브라우저 한정)
- **읽은 기사 표시** — 카드 링크를 클릭하면 새 탭으로 원문이 열리고, 동시에
  `localStorage`(`tnc:read`)에 읽음으로 기록된다. 다시 방문하면 해당 카드의 명암·채도가
  낮아지고 좌상단에 `읽음` 칩이 표시된다. 데스크탑에서는 hover 시 잠깐 원래 색으로
  돌아가 다시 확인하기 쉽다.
- **무한 스크롤** — 기사 수가 많아도 초기에는 30개만 그리고, 스크롤 하단 부근에서
  `IntersectionObserver`(rootMargin 600px)가 sentinel 을 감지해 30개씩 추가 렌더링한다.
  날짜·카테고리·태그·검색·북마크가 바뀌면 다시 처음 30개부터 그린다.
- **모바일 반응형** — 768px / 480px 두 단계 브레이크포인트로 컨트롤·카드·캘린더 팝업이
  자연스럽게 재배치된다. 터치 환경(`@media (hover: none)`)에서는 읽음 시각화가 hover 로
  풀리지 않도록 조정되어 있다.

## 매일 수집 (launchd 자동화)

macOS `launchd`가 **매일 05:00**에 헤드리스 Claude Code를 실행해 `collect.md` 워크플로우를
수행한다. 한국 매체 뉴스를 수집해 `data/<날짜>.json` 생성 + `index.json` 갱신까지 하고
끝낸다 — **git 커밋·푸시는 하지 않는다.** 결과를 직접 검토한 뒤 커밋·푸시한다.

- 실행 스크립트: `scripts/run-collect.sh`
- launchd 설정: `~/Library/LaunchAgents/com.taewook.tech-news-collect.plist`
- 실행 로그: `logs/collect-<날짜>.log`
- Mac이 켜져 있거나 절전 상태면 실행된다(절전 시 깨어날 때). 완전히 꺼져 있으면 그날은 건너뛴다.

**수집 결과를 사이트에 반영 (수동):**
```bash
git add data/
git commit -m "뉴스 수집: <날짜>"
git push        # → GitHub Pages 자동 갱신
```

**바로 한 번 실행해 보기:**
```bash
launchctl start com.taewook.tech-news-collect   # 또는: zsh scripts/run-collect.sh
```

**자동 수집 끄기 / 켜기:**
```bash
launchctl bootout   gui/$(id -u)/com.taewook.tech-news-collect                              # 끄기
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.taewook.tech-news-collect.plist # 켜기
```

## 배포 (GitHub Pages)

- 저장소: https://github.com/didxodnr0769-bom/tech-news-collection
- 공개 사이트: **https://didxodnr0769-bom.github.io/tech-news-collection/**
- `main` 브랜치 루트(`/`)를 GitHub Pages가 서빙한다.
- `data/`에 새 날짜 JSON을 커밋·푸시하면 사이트가 자동으로 갱신된다.

## TODO / 확장 아이디어

- [x] git 저장소 초기화 + GitHub Pages 배포
- [x] launchd로 매일 05:00 자동 수집 등록 (로컬 실행, 푸시는 수동)
- [x] 전체 날짜 태그 집계 + 태그 필터
- [x] 기사 북마크 (localStorage) + 북마크 모아 보기
- [x] 전체 기간 보기 — 모든 날짜 JSON을 불러와 전체 날짜 검색·필터 지원
- [x] 캘린더 팝업 날짜 선택 (데이터 있는 날짜만 활성)
- [x] 태그 영역 더보기/접기 — 2줄씩 점진적 확장
- [x] 읽은 기사 표시 (localStorage `tnc:read`, 명암·채도 저하 + `읽음` 칩)
- [x] 무한 스크롤 (IntersectionObserver, 30개씩 추가 렌더)
- [x] 모바일 반응형 UI 개선 (768/480px 브레이크포인트, 터치 환경 보정)
- [ ] 날짜가 많아지면 전체 로드 대신 `search-index.json` 등으로 최적화
- [ ] `기타` 서브카테고리 2차 필터 UI (서브카테고리가 늘어나면)
- [ ] 팀 공유용 알림 (Slack 등으로 수집 완료 시 링크 전송)
- [ ] 읽음 기록 수동 초기화 UI (현재는 DevTools 에서 `tnc:read` 키 삭제)

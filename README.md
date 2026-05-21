# 테크 뉴스 콜렉션

개발팀이 매일 참고하는 **AI · 개발 · 기타** 뉴스 모음.
Claude Code가 매일 아침 5시에 웹을 검색해 뉴스를 수집하고, 정적 사이트로 공유한다.

## 구조

```
06_tech_news_collection/
├── index.html          # 단일 페이지 (오늘 뉴스 + 카테고리 필터 + 검색 + 날짜 선택)
├── assets/
│   ├── style.css
│   └── app.js          # JSON 로드 · 렌더링 · 필터/검색
├── data/
│   ├── index.json      # 사이트 메타 + 수집된 날짜 목록
│   └── 2026-05-21.json # 날짜별 뉴스 데이터
├── collect.md          # 매일 수집 워크플로우 (Claude 실행 지침)
└── README.md
```

> 현재 `data/`의 내용은 **샘플 데이터**다. `collect.md` 워크플로우로 실제 수집이 한 번 실행되면 교체된다.

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

**`data/<날짜>.json`** — 기사 객체 필드는 `collect.md` 참고.

## 매일 수집

`collect.md`에 전체 절차가 정의되어 있다. 스케줄러(`/schedule`)가 매일 05:00에
Claude Code를 깨워 그 지침을 실행 → JSON 저장 → git 커밋·푸시 → GitHub Pages 갱신.

수동으로 한 번 돌려보려면 Claude Code에서 `collect.md`를 실행하라고 요청하면 된다.

## 배포 (GitHub Pages)

- 저장소: https://github.com/didxodnr0769-bom/tech-news-collection
- 공개 사이트: **https://didxodnr0769-bom.github.io/tech-news-collection/**
- `main` 브랜치 루트(`/`)를 GitHub Pages가 서빙한다.
- `data/`에 새 날짜 JSON을 커밋·푸시하면 사이트가 자동으로 갱신된다.

## TODO / 확장 아이디어

- [x] git 저장소 초기화 + GitHub Pages 배포
- [ ] `/schedule`로 매일 05:00 자동 수집 등록 (푸시 인증 설정 포함)
- [ ] 전체 기간 검색 (날짜별 파일을 모은 `search-index.json` 생성)
- [ ] `기타` 서브카테고리 2차 필터 UI (서브카테고리가 늘어나면)
- [ ] 팀 공유용 알림 (Slack 등으로 수집 완료 시 링크 전송)

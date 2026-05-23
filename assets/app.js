/* 테크 뉴스 콜렉션 — 정적 사이트 클라이언트
 * data/index.json 으로 날짜 목록을 읽고, 모든 날짜의 data/<날짜>.json 을 한 번에 불러온다.
 * 태그 집계와 북마크는 특정 날짜가 아닌 "전체 날짜" 기준으로 동작한다.
 * 북마크는 브라우저 localStorage 에 저장된다.
 */

const BOOKMARK_KEY = 'tnc:bookmarks';

const state = {
  index: null,
  byDate: new Map(), // 날짜 → 기사 배열
  all: [], // 전체 날짜 기사 (수집일 최신순)
  date: null, // 선택된 날짜 또는 'all'(전체 기간)
  category: 'all',
  tag: null,
  query: '',
  bookmarkOnly: false,
  bookmarks: loadBookmarks(), // Set<기사 id>
};

const el = {
  title: document.getElementById('site-title'),
  desc: document.getElementById('site-desc'),
  dateSelect: document.getElementById('date-select'),
  search: document.getElementById('search-input'),
  bookmarkToggle: document.getElementById('bookmark-toggle'),
  filter: document.getElementById('category-filter'),
  tagCloud: document.getElementById('tag-cloud'),
  grid: document.getElementById('news-grid'),
  count: document.getElementById('result-count'),
  empty: document.getElementById('empty-state'),
  lastUpdated: document.getElementById('last-updated'),
};

async function init() {
  try {
    state.index = await fetchJSON('data/index.json');
  } catch (err) {
    showError('데이터를 불러오지 못했습니다. 로컬에서 열었다면 정적 서버로 실행해 주세요. (README 참고)');
    console.error(err);
    return;
  }

  if (state.index.site_title) {
    el.title.textContent = state.index.site_title;
    document.title = state.index.site_title;
  }
  if (state.index.description) el.desc.textContent = state.index.description;
  if (state.index.last_updated) {
    el.lastUpdated.textContent = '마지막 수집: ' + formatDateTime(state.index.last_updated);
  }

  const dates = Array.isArray(state.index.dates) ? state.index.dates : [];
  if (!dates.length) {
    showError('아직 수집된 뉴스가 없습니다.');
    return;
  }

  // 모든 날짜 파일을 한 번에 불러와 전체 날짜 기준 집계·검색이 가능하게 한다
  const files = await Promise.all(
    dates.map((d) => fetchJSON(`data/${d}.json`).catch(() => null))
  );
  dates.forEach((d, i) => {
    const data = files[i];
    const articles = data && Array.isArray(data.articles) ? data.articles : [];
    articles.forEach((a) => {
      a._date = d; // 수집 날짜를 기사에 부착
    });
    state.byDate.set(d, articles);
  });
  // dates 는 최신순 → flatMap 하면 전체 기사도 최신 수집일 순으로 정렬된다
  state.all = dates.flatMap((d) => state.byDate.get(d) || []);

  if (!state.all.length) {
    showError('아직 수집된 뉴스가 없습니다.');
    return;
  }

  buildDateOptions(dates);
  buildCategoryButtons(state.index.categories || []);
  bindEvents();

  state.date = dates[0]; // 기본은 가장 최근 날짜
  el.dateSelect.value = state.date;
  render();
}

function buildDateOptions(dates) {
  const opts = ['<option value="all">전체 기간</option>'].concat(
    dates.map((d) => `<option value="${d}">${formatDate(d)}</option>`)
  );
  el.dateSelect.innerHTML = opts.join('');
}

function buildCategoryButtons(categories) {
  const all = ['all', ...categories];
  el.filter.innerHTML = all
    .map((c) => {
      const label = c === 'all' ? '전체' : c;
      const active = c === state.category ? ' active' : '';
      return `<button class="cat-btn${active}" data-category="${c}">${label}</button>`;
    })
    .join('');
}

function bindEvents() {
  el.dateSelect.addEventListener('change', (e) => {
    state.date = e.target.value;
    // 특정 날짜를 고르면 날짜별 보기로 전환하고 전체 날짜 기준 필터는 해제한다
    if (state.date !== 'all') {
      state.tag = null;
      state.bookmarkOnly = false;
    }
    render();
  });

  el.search.addEventListener('input', (e) => {
    state.query = e.target.value.trim().toLowerCase();
    render();
  });

  el.bookmarkToggle.addEventListener('click', () => {
    state.bookmarkOnly = !state.bookmarkOnly;
    if (state.bookmarkOnly) setAllDates(); // 북마크는 전체 날짜 기준
    render();
  });

  el.filter.addEventListener('click', (e) => {
    const btn = e.target.closest('.cat-btn');
    if (!btn) return;
    state.category = btn.dataset.category;
    el.filter.querySelectorAll('.cat-btn').forEach((b) => {
      b.classList.toggle('active', b === btn);
    });
    render();
  });

  // 집계된 태그 칩 클릭 → 전체 날짜에서 해당 태그로 필터 (다시 누르면 해제)
  el.tagCloud.addEventListener('click', (e) => {
    const chip = e.target.closest('.tag-chip');
    if (!chip) return;
    const tag = chip.dataset.tag;
    if (state.tag === tag) {
      state.tag = null;
      render();
    } else {
      selectTag(tag);
    }
  });

  // 카드 내부 클릭 — 북마크 토글 / 태그 필터는 원문 이동보다 우선 처리
  el.grid.addEventListener('click', (e) => {
    const bm = e.target.closest('.bookmark-btn');
    if (bm) {
      e.preventDefault();
      const id = bm.dataset.id;
      toggleBookmark(id);
      if (state.bookmarkOnly) {
        render(); // 북마크 보기 중이면 목록에서 빠질 수 있어 전체 갱신
      } else {
        paintBookmarkBtn(bm, state.bookmarks.has(id)); // 해당 버튼만 갱신
        renderBookmarkToggle();
      }
      return;
    }
    const tagEl = e.target.closest('.card-tag');
    if (tagEl) {
      e.preventDefault();
      selectTag(tagEl.dataset.tag);
    }
  });
}

/* 날짜 선택을 '전체 기간'으로 맞춘다 */
function setAllDates() {
  state.date = 'all';
  el.dateSelect.value = 'all';
}

/* 전체 날짜에서 특정 태그로 필터링한다 */
function selectTag(tag) {
  state.tag = tag;
  setAllDates();
  render();
  el.tagCloud.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function render() {
  // 태그 집계는 항상 전체 날짜 기준 (카테고리 필터만 반영)
  const forTags =
    state.category === 'all'
      ? state.all
      : state.all.filter((a) => a.category === state.category);
  renderTagCloud(forTags);

  // 태그·북마크·전체 기간 중 하나라도 켜져 있으면 전체 날짜 기사를 베이스로 삼는다
  const allDates = state.tag || state.bookmarkOnly || state.date === 'all';
  let list = allDates ? state.all : state.byDate.get(state.date) || [];

  if (state.category !== 'all') {
    list = list.filter((a) => a.category === state.category);
  }
  if (state.tag) {
    list = list.filter((a) => Array.isArray(a.tags) && a.tags.includes(state.tag));
  }
  if (state.bookmarkOnly) {
    list = list.filter((a) => state.bookmarks.has(a.id));
  }
  if (state.query) {
    list = list.filter((a) =>
      `${a.title} ${a.summary}`.toLowerCase().includes(state.query)
    );
  }

  const labels = [];
  if (state.bookmarkOnly) labels.push('북마크');
  if (state.tag) labels.push('#' + state.tag);
  if (!labels.length && state.date === 'all') labels.push('전체 기간');
  el.count.textContent =
    (labels.length ? labels.join(' · ') + ' · ' : '') + `${list.length}개 기사`;

  renderBookmarkToggle();

  el.empty.hidden = list.length > 0;
  if (!list.length) {
    el.empty.textContent = state.bookmarkOnly
      ? '북마크한 기사가 없습니다. 카드의 ☆ 를 눌러 추가하세요.'
      : '표시할 뉴스가 없습니다.';
  }
  el.grid.innerHTML = list.map(cardHTML).join('');
}

/* 전체 날짜 기사의 tags 를 집계해 많은 순으로 칩을 그린다.
 * 칩을 누르면 render() 에서 해당 태그로 기사를 필터링한다. */
function renderTagCloud(articles) {
  const counts = new Map();
  articles.forEach((a) => {
    (Array.isArray(a.tags) ? a.tags : []).forEach((t) => {
      const tag = String(t).trim();
      if (tag) counts.set(tag, (counts.get(tag) || 0) + 1);
    });
  });

  // 현재 화면(카테고리)에 더 이상 없는 태그가 선택돼 있으면 선택 해제
  if (state.tag && !counts.has(state.tag)) state.tag = null;

  if (counts.size === 0) {
    state.tag = null;
    el.tagCloud.hidden = true;
    el.tagCloud.innerHTML = '';
    return;
  }

  // 개수 내림차순, 동률이면 가나다순
  const sorted = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko')
  );

  const chips = sorted
    .map(([tag, n]) => {
      const active = tag === state.tag ? ' active' : '';
      return `<button type="button" class="tag-chip${active}" data-tag="${escapeHTML(tag)}">
        <span class="tag-chip-name">${escapeHTML(tag)}</span>
        <span class="tag-chip-count">${n}</span>
      </button>`;
    })
    .join('');

  el.tagCloud.hidden = false;
  el.tagCloud.innerHTML = `<span class="tag-cloud-label">태그 · 전체 날짜</span>${chips}`;
}

function renderBookmarkToggle() {
  const n = state.bookmarks.size;
  el.bookmarkToggle.classList.toggle('active', state.bookmarkOnly);
  el.bookmarkToggle.textContent = n ? `★ 북마크 ${n}` : '☆ 북마크';
}

/* 북마크 버튼 하나의 표시 상태를 갱신한다 (전체 재렌더 없이) */
function paintBookmarkBtn(btn, marked) {
  btn.classList.toggle('marked', marked);
  btn.textContent = marked ? '★' : '☆';
  btn.setAttribute('aria-pressed', String(marked));
  const label = marked ? '북마크 해제' : '북마크 추가';
  btn.setAttribute('aria-label', label);
  btn.title = label;
}

function cardHTML(a) {
  const cat = escapeHTML(a.category || '');
  const sub = escapeHTML(a.subcategory || '');
  const tags = (Array.isArray(a.tags) ? a.tags : [])
    .map((t) => {
      const tag = String(t).trim();
      if (!tag) return '';
      const active = tag === state.tag ? ' active' : '';
      return `<span class="card-tag${active}" data-tag="${escapeHTML(tag)}">#${escapeHTML(tag)}</span>`;
    })
    .join('');
  const thumb = a.thumbnail
    ? `<img class="thumb" src="${escapeHTML(a.thumbnail)}" alt="" loading="lazy"
         onerror="this.outerHTML='<div class=&quot;thumb thumb-placeholder&quot; data-cat=&quot;${cat}&quot;>${cat}</div>'" />`
    : `<div class="thumb thumb-placeholder" data-cat="${cat}">${cat}</div>`;

  const marked = state.bookmarks.has(a.id);
  const bmLabel = marked ? '북마크 해제' : '북마크 추가';
  const bookmarkBtn = `<button type="button" class="bookmark-btn${marked ? ' marked' : ''}"
      data-id="${escapeHTML(a.id || '')}" aria-label="${bmLabel}" title="${bmLabel}"
      aria-pressed="${marked}">${marked ? '★' : '☆'}</button>`;

  return `
    <article class="card">
      ${bookmarkBtn}
      <a class="card-link" href="${escapeHTML(a.url || '#')}" target="_blank" rel="noopener noreferrer">
        ${thumb}
        <div class="card-body">
          <div class="badge-row">
            <span class="badge" data-cat="${cat}">${cat}</span>
            ${sub ? `<span class="badge badge-sub" data-sub="${sub}">${sub}</span>` : ''}
            ${tags}
          </div>
          <h3 class="card-title">${escapeHTML(a.title || '')}</h3>
          <p class="card-summary">${escapeHTML(a.summary || '')}</p>
          <div class="card-meta">
            <span class="source">${escapeHTML(a.source || '')}</span>
            <span class="date">${escapeHTML(a.published || '')}</span>
          </div>
        </div>
      </a>
    </article>`;
}

function showError(msg) {
  el.grid.innerHTML = '';
  el.empty.hidden = false;
  el.empty.textContent = msg;
}

/* ── 북마크 (localStorage) ── */
function loadBookmarks() {
  try {
    const raw = localStorage.getItem(BOOKMARK_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch (err) {
    console.warn('북마크를 불러오지 못했습니다.', err);
    return new Set();
  }
}

function saveBookmarks() {
  try {
    localStorage.setItem(BOOKMARK_KEY, JSON.stringify([...state.bookmarks]));
  } catch (err) {
    console.warn('북마크를 저장하지 못했습니다.', err);
  }
}

function toggleBookmark(id) {
  if (!id) return;
  if (state.bookmarks.has(id)) state.bookmarks.delete(id);
  else state.bookmarks.add(id);
  saveBookmarks();
}

/* ── 유틸 ── */
async function fetchJSON(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

function formatDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d)) return iso;
  const week = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}. (${week})`;
}

function formatDateTime(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

init();

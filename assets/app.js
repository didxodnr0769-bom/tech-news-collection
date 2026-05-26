/* 테크 뉴스 콜렉션 — 정적 사이트 클라이언트
 * data/index.json 으로 날짜 목록을 읽고, 모든 날짜의 data/<날짜>.json 을 한 번에 불러온다.
 * 태그 집계와 북마크는 특정 날짜가 아닌 "전체 날짜" 기준으로 동작한다.
 * 북마크는 브라우저 localStorage 에 저장된다.
 */

const BOOKMARK_KEY = 'tnc:bookmarks';
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

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
  dateSet: new Set(), // 데이터가 있는 날짜 Set — 캘린더에서 활성/비활성 판정
  cal: { open: false, year: null, month: null }, // 캘린더 팝업 상태
  tagsExpanded: false, // 태그 영역 펼침 여부
};

const el = {
  title: document.getElementById('site-title'),
  desc: document.getElementById('site-desc'),
  dateField: document.querySelector('.date-field'),
  datePrev: document.getElementById('date-prev'),
  dateNext: document.getElementById('date-next'),
  datePickerBtn: document.getElementById('date-picker-btn'),
  datePickerLabel: document.getElementById('date-picker-label'),
  dateAllBtn: document.getElementById('date-all-btn'),
  datePickerPopup: document.getElementById('date-picker-popup'),
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

  // 캘린더 활성 판정을 위한 Set
  state.dateSet = new Set(dates);

  buildCategoryButtons(state.index.categories || []);
  bindEvents();

  // 기본은 가장 최근 날짜, 캘린더 anchor 도 동일
  state.date = dates[0];
  const p = parseISO(state.date);
  state.cal.year = p.year;
  state.cal.month = p.month;

  renderDateControls();
  render();
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
  // ── 날짜 컨트롤 ──────────────────────────────────────────
  el.datePrev.addEventListener('click', () => shiftDataDate(-1));
  el.dateNext.addEventListener('click', () => shiftDataDate(1));

  el.datePickerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (state.cal.open) closeCalendar();
    else openCalendar();
  });

  el.dateAllBtn.addEventListener('click', () => {
    setAllDates();
    state.tag = null;
    state.bookmarkOnly = false;
    closeCalendar();
    render();
  });

  // 캘린더 팝업 내부 이벤트 (위임)
  el.datePickerPopup.addEventListener('click', (e) => {
    e.stopPropagation();
    const action = e.target.closest('[data-cal-action]');
    if (action) {
      if (action.dataset.calAction === 'prev-month') shiftCalMonth(-1);
      else if (action.dataset.calAction === 'next-month') shiftCalMonth(1);
      return;
    }
    const day = e.target.closest('.cal-day.has-data');
    if (day && day.dataset.iso) {
      selectDate(day.dataset.iso);
    }
  });
  el.datePickerPopup.addEventListener('change', (e) => {
    if (e.target.classList.contains('cal-year')) {
      state.cal.year = Number(e.target.value);
      clampCalMonthToRange();
      renderCalendar();
    } else if (e.target.classList.contains('cal-month')) {
      state.cal.month = Number(e.target.value);
      renderCalendar();
    }
  });

  // 외부 클릭 / Escape → 팝업 닫기
  document.addEventListener('click', (e) => {
    if (!state.cal.open) return;
    if (el.datePickerPopup.contains(e.target) || el.datePickerBtn.contains(e.target)) return;
    closeCalendar();
  });
  document.addEventListener('keydown', (e) => {
    if (state.cal.open && e.key === 'Escape') closeCalendar();
  });

  // ── 검색 / 북마크 / 카테고리 ─────────────────────────────
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

  // ── 태그 영역: 칩 클릭 + 더보기/접기 토글 ─────────────────
  el.tagCloud.addEventListener('click', (e) => {
    const toggle = e.target.closest('#tag-cloud-toggle');
    if (toggle) {
      state.tagsExpanded = !state.tagsExpanded;
      applyTagsExpandedUI();
      return;
    }
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

  // ── 카드 내부 클릭 (북마크 / 태그 필터) ───────────────────
  el.grid.addEventListener('click', (e) => {
    const bm = e.target.closest('.bookmark-btn');
    if (bm) {
      e.preventDefault();
      const id = bm.dataset.id;
      toggleBookmark(id);
      if (state.bookmarkOnly) {
        render(); // 북마크 보기 중이면 목록에서 빠질 수 있어 전체 갱신
      } else {
        paintBookmarkBtn(bm, state.bookmarks.has(id));
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

/* ── 날짜 컨트롤 ─────────────────────────────────────────── */

/* 날짜 선택을 '전체 기간'으로 맞춘다 */
function setAllDates() {
  state.date = 'all';
  renderDateControls();
}

/* 전체 날짜에서 특정 태그로 필터링한다 */
function selectTag(tag) {
  state.tag = tag;
  setAllDates();
  render();
  el.tagCloud.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* 데이터가 있는 인접 날짜로 이동 (-1: 과거, +1: 미래) */
function shiftDataDate(step) {
  if (state.date === 'all') return;
  const dates = state.index.dates; // 내림차순
  const idx = dates.indexOf(state.date);
  if (idx === -1) return;
  // 내림차순이므로 과거 = idx+1, 미래 = idx-1
  const target = idx + (step === -1 ? 1 : -1);
  const newDate = dates[target];
  if (!newDate) return;
  selectDate(newDate);
}

function selectDate(iso) {
  state.date = iso;
  state.tag = null;
  state.bookmarkOnly = false;
  const p = parseISO(iso);
  state.cal.year = p.year;
  state.cal.month = p.month;
  closeCalendar();
  renderDateControls();
  render();
}

function renderDateControls() {
  const isAll = state.date === 'all';
  el.datePickerLabel.textContent = isAll ? '전체 기간' : formatDate(state.date);
  el.dateAllBtn.classList.toggle('active', isAll);

  const dates = state.index.dates;
  if (isAll) {
    el.datePrev.disabled = true;
    el.dateNext.disabled = true;
  } else {
    const idx = dates.indexOf(state.date);
    el.datePrev.disabled = idx === dates.length - 1; // 더 과거 없음
    el.dateNext.disabled = idx <= 0; // 더 최신 없음
  }
}

/* ── 캘린더 팝업 ─────────────────────────────────────────── */

function openCalendar() {
  state.cal.open = true;
  // 전체 기간이면 가장 최신 데이터 월을, 아니면 선택된 날짜의 월을 보여준다
  const anchor = state.date === 'all' ? state.index.dates[0] : state.date;
  const p = parseISO(anchor);
  state.cal.year = p.year;
  state.cal.month = p.month;
  el.datePickerBtn.setAttribute('aria-expanded', 'true');
  el.datePickerPopup.hidden = false;
  renderCalendar();
}

function closeCalendar() {
  if (!state.cal.open) return;
  state.cal.open = false;
  el.datePickerBtn.setAttribute('aria-expanded', 'false');
  el.datePickerPopup.hidden = true;
}

function shiftCalMonth(step) {
  let m = state.cal.month + step;
  let y = state.cal.year;
  if (m < 0) { m = 11; y -= 1; }
  if (m > 11) { m = 0; y += 1; }
  state.cal.year = y;
  state.cal.month = m;
  renderCalendar();
}

/* 데이터 범위 밖으로 월이 벗어나면 가장 가까운 유효 월로 보정한다 */
function clampCalMonthToRange() {
  const { oldestP, newestP } = getDateBounds();
  if (state.cal.year === oldestP.year && state.cal.month < oldestP.month) {
    state.cal.month = oldestP.month;
  }
  if (state.cal.year === newestP.year && state.cal.month > newestP.month) {
    state.cal.month = newestP.month;
  }
}

function getDateBounds() {
  const dates = state.index.dates; // 내림차순
  return {
    oldestP: parseISO(dates[dates.length - 1]),
    newestP: parseISO(dates[0]),
  };
}

function renderCalendar() {
  const { oldestP, newestP } = getDateBounds();

  // 년 옵션
  const years = [];
  for (let y = oldestP.year; y <= newestP.year; y++) years.push(y);
  const yearOpts = years
    .map((y) => `<option value="${y}"${y === state.cal.year ? ' selected' : ''}>${y}년</option>`)
    .join('');

  // 월 옵션 — 선택된 년에서 데이터 범위 내 월만
  const monthOpts = [];
  for (let m = 0; m < 12; m++) {
    const beforeRange = state.cal.year === oldestP.year && m < oldestP.month;
    const afterRange = state.cal.year === newestP.year && m > newestP.month;
    if (beforeRange || afterRange) continue;
    monthOpts.push(
      `<option value="${m}"${m === state.cal.month ? ' selected' : ''}>${m + 1}월</option>`
    );
  }

  // 달력 셀
  const firstWeekday = new Date(state.cal.year, state.cal.month, 1).getDay();
  const daysInMonth = new Date(state.cal.year, state.cal.month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) {
    cells.push(`<button type="button" class="cal-day other-month" tabindex="-1" disabled></button>`);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = formatISO(state.cal.year, state.cal.month, d);
    const hasData = state.dateSet.has(iso);
    const selected = iso === state.date;
    const cls = ['cal-day'];
    if (hasData) cls.push('has-data');
    if (selected) cls.push('selected');
    const disabled = hasData ? '' : 'disabled';
    cells.push(
      `<button type="button" class="${cls.join(' ')}" data-iso="${iso}" ${disabled}>${d}</button>`
    );
  }

  const canPrevMonth =
    state.cal.year > oldestP.year ||
    (state.cal.year === oldestP.year && state.cal.month > oldestP.month);
  const canNextMonth =
    state.cal.year < newestP.year ||
    (state.cal.year === newestP.year && state.cal.month < newestP.month);

  el.datePickerPopup.innerHTML = `
    <div class="cal-head">
      <button type="button" class="cal-nav" data-cal-action="prev-month" ${canPrevMonth ? '' : 'disabled'} aria-label="이전 달">‹</button>
      <div class="cal-head-selects">
        <select class="cal-year" aria-label="년도">${yearOpts}</select>
        <select class="cal-month" aria-label="월">${monthOpts}</select>
      </div>
      <button type="button" class="cal-nav" data-cal-action="next-month" ${canNextMonth ? '' : 'disabled'} aria-label="다음 달">›</button>
    </div>
    <div class="cal-weekdays">
      <span class="sun">일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span class="sat">토</span>
    </div>
    <div class="cal-grid">${cells.join('')}</div>
  `;
}

/* ── 렌더 ────────────────────────────────────────────────── */

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

  renderDateControls();
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
 * 기본은 2줄까지만 표출(.collapsed), 넘치면 '더보기' 토글로 펼친다. */
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
  el.tagCloud.innerHTML = `
    <span class="tag-cloud-label">태그 · 전체 날짜</span>
    <div class="tag-cloud-chips${state.tagsExpanded ? '' : ' collapsed'}" id="tag-cloud-chips">${chips}</div>
    <button type="button" class="tag-cloud-toggle${state.tagsExpanded ? ' expanded' : ''}" id="tag-cloud-toggle" hidden>${state.tagsExpanded ? '접기' : '더보기'}</button>
  `;

  // 칩이 두 줄을 넘어가는지 측정해 토글 노출 여부 결정
  requestAnimationFrame(updateTagToggleVisibility);
}

/* collapsed 상태에서 칩이 max-height 를 넘으면 토글을 노출한다 */
function updateTagToggleVisibility() {
  const chipsEl = document.getElementById('tag-cloud-chips');
  const toggleEl = document.getElementById('tag-cloud-toggle');
  if (!chipsEl || !toggleEl) return;

  const isCollapsed = chipsEl.classList.contains('collapsed');
  let overflows;
  if (isCollapsed) {
    overflows = chipsEl.scrollHeight > chipsEl.clientHeight + 1;
  } else {
    // 펼친 상태에서는 임시로 collapsed 적용해 측정
    chipsEl.classList.add('collapsed');
    overflows = chipsEl.scrollHeight > chipsEl.clientHeight + 1;
    chipsEl.classList.remove('collapsed');
  }
  toggleEl.hidden = !overflows;
  // 펼친 상태인데 더 이상 넘치지 않는다면 자동으로 접힘 상태로 동기화
  if (!overflows && state.tagsExpanded) {
    state.tagsExpanded = false;
  }
}

/* 태그 영역 펼침/접힘만 빠르게 토글 (전체 재렌더 없이) */
function applyTagsExpandedUI() {
  const chipsEl = document.getElementById('tag-cloud-chips');
  const toggleEl = document.getElementById('tag-cloud-toggle');
  if (!chipsEl || !toggleEl) return;
  chipsEl.classList.toggle('collapsed', !state.tagsExpanded);
  toggleEl.classList.toggle('expanded', state.tagsExpanded);
  toggleEl.textContent = state.tagsExpanded ? '접기' : '더보기';
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

/* "YYYY-MM-DD" → { year, month (0-11), day } */
function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return { year: y, month: m - 1, day: d };
}

/* (y, m 0-11, d) → "YYYY-MM-DD" */
function formatISO(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function formatDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d)) return iso;
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}. (${WEEKDAYS[d.getDay()]})`;
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

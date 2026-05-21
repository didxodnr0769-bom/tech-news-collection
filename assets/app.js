/* 테크 뉴스 콜렉션 — 정적 사이트 클라이언트
 * data/index.json 으로 날짜·카테고리 목록을 읽고,
 * data/<날짜>.json 을 불러와 카드로 렌더링한다.
 */

const state = {
  index: null,
  date: null,
  articles: [],
  category: 'all',
  query: '',
};

const el = {
  title: document.getElementById('site-title'),
  desc: document.getElementById('site-desc'),
  dateSelect: document.getElementById('date-select'),
  search: document.getElementById('search-input'),
  filter: document.getElementById('category-filter'),
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

  buildDateOptions(state.index.dates || []);
  buildCategoryButtons(state.index.categories || []);
  bindEvents();

  if (state.index.dates && state.index.dates.length) {
    await loadDate(state.index.dates[0]);
  } else {
    showError('아직 수집된 뉴스가 없습니다.');
  }
}

function buildDateOptions(dates) {
  el.dateSelect.innerHTML = dates
    .map((d) => `<option value="${d}">${formatDate(d)}</option>`)
    .join('');
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
  el.dateSelect.addEventListener('change', (e) => loadDate(e.target.value));

  el.search.addEventListener('input', (e) => {
    state.query = e.target.value.trim().toLowerCase();
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
}

async function loadDate(date) {
  try {
    const data = await fetchJSON(`data/${date}.json`);
    state.date = date;
    state.articles = Array.isArray(data.articles) ? data.articles : [];
    render();
  } catch (err) {
    showError(`${date} 뉴스를 불러오지 못했습니다.`);
    console.error(err);
  }
}

function render() {
  let list = state.articles;

  if (state.category !== 'all') {
    list = list.filter((a) => a.category === state.category);
  }
  if (state.query) {
    list = list.filter((a) =>
      `${a.title} ${a.summary}`.toLowerCase().includes(state.query)
    );
  }

  el.count.textContent = `${list.length}개 기사`;
  el.empty.hidden = list.length > 0;
  el.grid.innerHTML = list.map(cardHTML).join('');
}

function cardHTML(a) {
  const cat = escapeHTML(a.category || '');
  const sub = escapeHTML(a.subcategory || '');
  const thumb = a.thumbnail
    ? `<img class="thumb" src="${escapeHTML(a.thumbnail)}" alt="" loading="lazy"
         onerror="this.outerHTML='<div class=&quot;thumb thumb-placeholder&quot; data-cat=&quot;${cat}&quot;>${cat}</div>'" />`
    : `<div class="thumb thumb-placeholder" data-cat="${cat}">${cat}</div>`;

  return `
    <article class="card">
      <a class="card-link" href="${escapeHTML(a.url || '#')}" target="_blank" rel="noopener noreferrer">
        ${thumb}
        <div class="card-body">
          <div class="badge-row">
            <span class="badge" data-cat="${cat}">${cat}</span>
            ${sub ? `<span class="badge badge-sub" data-sub="${sub}">${sub}</span>` : ''}
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

const $ = (s) => document.querySelector(s);
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const state = {
  tab: 'all', q: '', unreadOnly: false,
  school: [], eclass: [], errors: [], eclassIn: false, fetchedAt: 0,
  read: new Set(store.get('read', [])), pinned: new Set(store.get('pinned', [])),
};
const idOf = (it) => it.url;

async function api(path, opts) {
  const r = await fetch(path, opts);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || r.statusText), { status: r.status });
  return j;
}

async function load(refresh = false) {
  $('#status').textContent = '載入中…';
  state.errors = [];
  try {
    const s = await api('/api/school' + (refresh ? '?refresh=1' : ''));
    state.school = s.items.map((i) => ({ ...i, kind: 'school' }));
    state.errors.push(...s.errors.map((e) => `學校 / ${e.page}：${e.error}`));
    state.fetchedAt = s.fetchedAt;
  } catch (e) { state.errors.push('學校官網：' + e.message); }

  state.eclassIn = (await api('/api/eclass/status').catch(() => ({}))).loggedIn;
  if (state.eclassIn) {
    try {
      const e = await api('/api/eclass');
      state.eclass = e.items.map((i) => ({ ...i, kind: 'eclass' }));
      state.errors.push(...e.errors.map((x) => `eClass / ${x.page}：${x.error}`));
    } catch (e) {
      if (e.status === 401) state.eclassIn = false; else state.errors.push('eClass：' + e.message);
    }
  }
  render();
}

function visible() {
  let items = state.tab === 'school' ? state.school
    : state.tab === 'eclass' ? state.eclass
    : state.tab === 'pinned' ? [...state.school, ...state.eclass].filter((i) => state.pinned.has(idOf(i)))
    : [...state.school, ...state.eclass];
  const q = state.q.trim().toLowerCase();
  if (q) items = items.filter((i) => (i.title + ' ' + (i.tag || '') + ' ' + (i.snippet || '')).toLowerCase().includes(q));
  if (state.unreadOnly) items = items.filter((i) => !state.read.has(idOf(i)));
  return items.sort((a, b) => (state.pinned.has(idOf(b)) - state.pinned.has(idOf(a))) || (b.date || '').localeCompare(a.date || ''));
}

function el(tag, props = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids);
  return n;
}

function render() {
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === state.tab));
  $('#eclassLogin').hidden = !(state.tab === 'eclass' && !state.eclassIn);
  const items = visible();
  const unread = items.filter((i) => !state.read.has(idOf(i))).length;
  const t = state.fetchedAt ? new Date(state.fetchedAt).toLocaleTimeString('zh-TW') : '';
  $('#status').replaceChildren(
    `${items.length} 筆（${unread} 未讀）${t ? '・更新於 ' + t : ''}`,
    ...state.errors.map((e) => el('div', { className: 'err', textContent: '⚠ ' + e })),
  );
  const ul = $('#list');
  ul.replaceChildren(...items.map((it) => {
    const id = idOf(it);
    const a = el('a', { className: 'title', href: it.url, target: '_blank', rel: 'noopener noreferrer', textContent: it.title });
    a.addEventListener('click', () => markRead(id));
    const pin = el('button', { className: 'pin' + (state.pinned.has(id) ? ' on' : ''), textContent: state.pinned.has(id) ? '★' : '☆', title: '釘選' });
    pin.addEventListener('click', () => { state.pinned.has(id) ? state.pinned.delete(id) : state.pinned.add(id); store.set('pinned', [...state.pinned]); render(); });
    const meta = el('div', { className: 'meta' }, it.date || '', el('span', {}, it.source));
    if (it.tag) meta.append(el('span', { className: 'tag', textContent: it.tag }));
    return el('li', { className: 'item' + (state.read.has(id) ? '' : ' unread') },
      el('span', { className: 'dot' }), el('div', { className: 'body' }, a, meta), pin);
  }));
}

function markRead(id) {
  state.read.add(id);
  store.set('read', [...state.read].slice(-2000));
  setTimeout(render, 0);
}

// 事件
$('#tabs').addEventListener('click', (e) => { const t = e.target.dataset?.tab; if (t) { state.tab = t; render(); } });
$('#q').addEventListener('input', (e) => { state.q = e.target.value; render(); });
$('#unreadOnly').addEventListener('change', (e) => { state.unreadOnly = e.target.checked; render(); });
$('#refresh').addEventListener('click', () => load(true));
$('#theme').addEventListener('click', () => {
  const cur = document.documentElement.dataset.theme
    || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next; store.set('theme', next);
});
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); $('#q').focus(); }
});

async function doLogin(body) {
  $('#loginErr').textContent = '';
  try {
    await api('/api/eclass/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    await load();
  } catch (e) { $('#loginErr').textContent = e.message; }
}
$('#loginForm').addEventListener('submit', (e) => {
  e.preventDefault(); const f = new FormData(e.target);
  doLogin({ username: f.get('username'), password: f.get('password') });
  e.target.reset(); // 不在頁面上留著密碼
});
$('#cookieForm').addEventListener('submit', (e) => {
  e.preventDefault(); doLogin({ cookie: new FormData(e.target).get('cookie') }); e.target.reset();
});

const th = store.get('theme', null); if (th) document.documentElement.dataset.theme = th;
load();

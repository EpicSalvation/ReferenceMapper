import { createVerses } from './verses.js';
import { parseReference, decodeHash } from './parse.js';
import { renderDiagram } from './render.js';
import { directionInfo } from './layout.js';
import { downloadPng, downloadSvg, exportFilename } from './export.js';

const $ = (id) => document.getElementById(id);
const DEFAULT_REF = 'John.3.16';
const NARROW_PX = 700;
const GROUPS = ['Law', 'History', 'Wisdom', 'Prophets', 'Gospels', 'Acts', 'Epistles', 'Revelation'];

const state = {
  verses: null,
  verseId: null,
  data: { out: [], in: [] },
  showOut: true,
  showIn: true,
  minVotes: 0,
  selectedKey: null,
  sort: 'votes',
};
let pendingId = null;
let loadSeq = 0;

const keyOf = (c) => `${c.dir}:${c.start}-${c.end}`;

function connections() {
  const v = state.verses;
  const list = [];
  if (state.showOut) {
    for (const [start, end, votes] of state.data.out) {
      if (votes >= state.minVotes) list.push({ dir: 'out', start, end, votes, label: v.labelRange(start, end) });
    }
  }
  if (state.showIn) {
    for (const [from, votes] of state.data.in) {
      if (votes >= state.minVotes) list.push({ dir: 'in', start: from, end: from, votes, label: v.label(from) });
    }
  }
  return list;
}

// ---- rendering -------------------------------------------------------------

function render() {
  if (state.verseId === null) return;
  const conns = connections();
  const wrap = $('diagram-wrap');
  const width = Math.max(320, Math.floor(wrap.clientWidth || 800));
  let selectedIndex = conns.findIndex((c) => keyOf(c) === state.selectedKey);
  if (selectedIndex < 0) { selectedIndex = null; state.selectedKey = null; }

  renderDiagram($('diagram'), {
    verses: state.verses, verseId: state.verseId, connections: conns, width,
    narrow: width < NARROW_PX, selectedIndex, showOut: state.showOut, showIn: state.showIn,
  });

  const total = state.data.out.length + state.data.in.length;
  if (total === 0) setStatus('No cross references found for this verse.');
  else if (conns.length === 0) setStatus('No references match the current filters.');
  else setStatus('');

  renderList(conns);
  renderDetail(conns[selectedIndex ?? -1] ?? null);
}

function setStatus(text) { $('status').textContent = text; }

function renderList(conns) {
  const sorted = conns.slice().sort(state.sort === 'position'
    ? (a, b) => a.start - b.start || a.end - b.end
    : (a, b) => b.votes - a.votes || a.start - b.start);
  const ul = $('connections');
  const hadFocus = ul.contains(document.activeElement);
  ul.replaceChildren();
  for (const c of sorted) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.key = keyOf(c);
    if (keyOf(c) === state.selectedKey) b.setAttribute('aria-current', 'true');
    const left = document.createElement('span');
    const info = directionInfo(c.dir);
    const badge = document.createElement('span');
    badge.className = `badge badge-${c.dir}`;
    badge.setAttribute('aria-hidden', 'true');
    badge.textContent = info.badge;
    const sr = document.createElement('span');
    sr.className = 'sr-only';
    sr.textContent = `${info.sr}: `;
    left.append(badge, sr, c.label);
    const votes = document.createElement('span');
    votes.className = 'votes';
    votes.textContent = `${c.votes} votes`;
    b.append(left, votes);
    li.append(b);
    ul.append(li);
  }
  $('count').textContent = `(${conns.length})`;
  if (hadFocus) ul.querySelector('button[aria-current]')?.focus();
}

function renderDetail(c) {
  $('detail-empty').hidden = c !== null;
  $('detail-body').hidden = c === null;
  if (!c) return;
  $('detail-ref').textContent = c.label;
  const here = state.verses.label(state.verseId);
  $('detail-meta').textContent = c.dir === 'out'
    ? `${here} points to this passage · ${c.votes} votes`
    : `This verse points to ${here} · ${c.votes} votes`;
  $('detail-link').href = `https://www.biblegateway.com/passage/?search=${encodeURIComponent(c.label.replace('–', '-'))}`;
  $('goto').dataset.target = String(c.start);
}

function selectKey(key) {
  state.selectedKey = key;
  render();
}

// ---- verse selection / data loading ---------------------------------------

function fillOptions(select, count, labelFn) {
  select.replaceChildren();
  for (let i = 1; i <= count; i++) {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = labelFn(i);
    select.append(o);
  }
}

function syncPickers(id) {
  const loc = state.verses.locate(id);
  $('book').value = String(loc.bi);
  fillOptions($('chapter'), state.verses.chapterCount(loc.bi), String);
  $('chapter').value = String(loc.chapter);
  fillOptions($('verse'), state.verses.verseCount(loc.bi, loc.chapter), String);
  $('verse').value = String(loc.verse);
}

async function selectVerse(id, { log = false, updateHash = true } = {}) {
  const v = state.verses;
  pendingId = id;
  const seq = ++loadSeq;
  setStatus('Loading…');
  const ref = v.refFromId(id);
  let json;
  try {
    const res = await fetch(`api/refs.php?v=${encodeURIComponent(ref)}${log ? '&log=1' : ''}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    json = await res.json();
  } catch (err) {
    if (seq !== loadSeq) return;
    pendingId = state.verseId;
    setStatus('Could not load cross references. ');
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'secondary';
    retry.textContent = 'Retry';
    retry.addEventListener('click', () => selectVerse(id, { log, updateHash }));
    $('status').append(retry);
    return;
  }
  if (seq !== loadSeq) return;

  state.verseId = id;
  state.data = { out: json.out ?? [], in: json.in ?? [] };
  state.selectedKey = null;

  const maxVotes = Math.max(10, ...state.data.out.map((r) => r[2]), ...state.data.in.map((r) => r[1]));
  $('minvotes').max = String(maxVotes);
  if (state.minVotes > maxVotes) state.minVotes = 0;
  $('minvotes').value = String(state.minVotes);
  $('minvotes-out').textContent = String(state.minVotes);

  $('current').textContent = v.label(id);
  document.title = `${v.label(id)} · Bible Cross References`;
  syncPickers(id);
  if (updateHash && location.hash.slice(1) !== ref) location.hash = ref;
  render();
}

function showRefError(msg, suggestions) {
  const p = $('ref-error');
  p.hidden = !msg;
  p.textContent = msg ? msg + (suggestions && suggestions.length ? ` Did you mean: ${suggestions.join(', ')}?` : '') : '';
}

function idFromHash() {
  const raw = decodeHash(location.hash);
  if (!raw) return null;
  const direct = state.verses.idFromRef(raw);
  if (direct !== null) return direct;
  const parsed = parseReference(raw, state.verses);
  return parsed.id ?? null;
}

// ---- init ------------------------------------------------------------------

async function init() {
  const res = await fetch('books.json');
  state.verses = createVerses(await res.json());
  const v = state.verses;

  const bookSel = $('book');
  v.books.forEach((b, i) => {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = b.name;
    bookSel.append(o);
    const d = document.createElement('option');
    d.value = b.name;
    $('book-names').append(d);
  });
  for (const g of GROUPS) {
    const li = document.createElement('li');
    li.textContent = g;
    li.style.setProperty('--swatch', `var(--c-${g})`);
    $('legend').append(li);
  }

  bookSel.addEventListener('change', () => {
    const bi = +bookSel.value;
    fillOptions($('chapter'), v.chapterCount(bi), String);
    fillOptions($('verse'), v.verseCount(bi, 1), String);
  });
  $('chapter').addEventListener('change', () => {
    fillOptions($('verse'), v.verseCount(+bookSel.value, +$('chapter').value), String);
  });
  $('pick-go').addEventListener('click', () => {
    selectVerse(v.idFromParts(+bookSel.value, +$('chapter').value, +$('verse').value), { log: true });
  });

  $('lookup').addEventListener('submit', (e) => {
    e.preventDefault();
    const r = parseReference($('ref').value, v);
    if (r.error) { showRefError(r.error, r.suggestions); return; }
    showRefError('');
    $('ref').value = '';
    selectVerse(r.id, { log: true });
  });
  $('ref').addEventListener('input', () => showRefError(''));

  $('show-out').addEventListener('change', (e) => { state.showOut = e.target.checked; render(); });
  $('show-in').addEventListener('change', (e) => { state.showIn = e.target.checked; render(); });
  $('minvotes').addEventListener('input', (e) => {
    state.minVotes = +e.target.value;
    $('minvotes-out').textContent = String(state.minVotes);
    render();
  });
  $('sort').addEventListener('change', (e) => { state.sort = e.target.value; render(); });

  $('diagram').addEventListener('click', (e) => {
    const arc = e.target.closest('[data-arc]');
    if (!arc) return;
    const c = connections()[+arc.dataset.arc];
    if (c) selectKey(keyOf(c));
  });
  $('connections').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-key]');
    if (b) selectKey(b.dataset.key);
  });
  $('goto').addEventListener('click', () => {
    const target = +$('goto').dataset.target;
    if (target) selectVerse(target, { log: true });
  });

  const exportOpts = () => ({ title: state.verses.label(state.verseId) + ' — cross references' });
  $('dl-png').addEventListener('click', async () => {
    try {
      await downloadPng($('diagram'), exportOpts(), exportFilename(state.verses.refFromId(state.verseId), 'png'));
    } catch (err) {
      console.error(err);
      setStatus('Could not create the PNG. Try the SVG download instead.');
    }
  });
  $('dl-svg').addEventListener('click', () => {
    downloadSvg($('diagram'), exportOpts(), exportFilename(state.verses.refFromId(state.verseId), 'svg'));
  });

  let resizeTimer = null;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(render, 100);
  }).observe($('diagram-wrap'));

  window.addEventListener('hashchange', () => {
    const id = idFromHash();
    if (id !== null && id !== pendingId) selectVerse(id, { updateHash: false });
  });

  const initial = idFromHash() ?? v.idFromRef(DEFAULT_REF);
  await selectVerse(initial, { updateHash: false });
}

init().catch((err) => {
  console.error(err);
  setStatus('Could not start the app. Please reload.');
});

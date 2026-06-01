/* ============================================================
   UVM Lab — learning platform engine
   - hash router (#/<track>/<part>/<chapter>)
   - sidebar tree from content/manifest.json
   - markdown render (marked) + callouts + checkpoints + mermaid + hljs
   - progress + read-gated spaced repetition (SM-2)
   ============================================================ */
'use strict';

const PROGRESS_KEY = 'uvm-lab-progress'; // { chapterId: { done, visited, checkpoints: {idx: true} } }
const SR_KEY       = 'uvm-lab-sr';       // { cpId: { ease, interval, nextReview, reps } }
const THEME_KEY    = 'uvm-lab-theme';
const COLLAPSE_KEY = 'uvm-lab-collapsed'; // [partId,...]

let manifest = null;
let flatChapters = [];          // [{trackId, partId, chapter, href}] in order
let chapterById = {};
let progress = {};
let srData = {};
let collapsed = new Set();
let mdCache = {};

/* ===================== Storage ===================== */
function load(key, def) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch { return def; } }
function save(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
function saveProgress() { save(PROGRESS_KEY, progress); }
function saveSR() { save(SR_KEY, srData); }

/* ===================== Theme ===================== */
function applyTheme(light) {
  document.body.classList.toggle('light', light);
  const icon = light ? '&#9728;' : '&#9790;';
  ['theme-btn', 'theme-btn-desktop'].forEach(id => { const b = document.getElementById(id); if (b) b.innerHTML = icon; });
  const themeLink = document.getElementById('hljs-theme');
  themeLink.href = light
    ? 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css'
    : 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/tokyo-night-dark.min.css';
  if (window.mermaid) {
    mermaid.initialize({ startOnLoad: false, theme: light ? 'default' : 'dark', securityLevel: 'loose' });
  }
}
function toggleTheme() {
  const light = !document.body.classList.contains('light');
  save(THEME_KEY, light ? 'light' : 'dark');
  applyTheme(light);
  // re-render mermaid diagrams in current view
  if (location.hash.startsWith('#/a/') || location.hash.startsWith('#/b/') || location.hash.startsWith('#/ref/')) router();
}

/* ===================== Init ===================== */
async function init() {
  applyTheme(load(THEME_KEY, 'dark') === 'light');
  progress = load(PROGRESS_KEY, {});
  srData = load(SR_KEY, {});
  collapsed = new Set(load(COLLAPSE_KEY, []));

  marked.setOptions({ gfm: true, breaks: false });

  try {
    manifest = await fetch('content/manifest.json').then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
  } catch (e) {
    document.getElementById('content').innerHTML =
      `<div class="content-inner"><div class="callout gotcha"><div class="callout-title">로드 실패</div>
      <p><code>content/manifest.json</code>을 불러오지 못했습니다 (${e.message}).</p>
      <p>이 앱은 정적 서버에서 열어야 합니다 (<code>file://</code> 직접 열기는 fetch가 막힙니다).
      예: <code>python3 -m http.server</code> 후 <code>localhost:8000</code>.</p></div></div>`;
    return;
  }

  buildFlatIndex();
  wireChrome();
  renderSidebar();
  window.addEventListener('hashchange', router);
  router();
}

function buildFlatIndex() {
  flatChapters = [];
  chapterById = {};
  for (const track of manifest.tracks) {
    for (const part of (track.parts || [])) {
      for (const ch of part.chapters) {
        const href = `#/${track.id}/${part.id}/${ch.id}`;
        const entry = { trackId: track.id, trackTitle: track.title, partId: part.id, partTitle: part.title, chapter: ch, href };
        flatChapters.push(entry);
        chapterById[ch.id] = entry;
      }
    }
  }
}

function wireChrome() {
  document.getElementById('theme-btn').onclick = toggleTheme;
  document.getElementById('theme-btn-desktop').onclick = toggleTheme;
  const sidebar = document.getElementById('sidebar');
  const scrim = document.getElementById('scrim');
  const openSidebar = (open) => { sidebar.classList.toggle('open', open); scrim.classList.toggle('show', open); };
  document.getElementById('menu-btn').onclick = () => openSidebar(!sidebar.classList.contains('open'));
  scrim.onclick = () => openSidebar(false);
  document.getElementById('reset-link').onclick = resetProgress;
  document.getElementById('sidebar-search').addEventListener('input', e => filterSidebar(e.target.value.trim().toLowerCase()));
}

function resetProgress() {
  if (!confirm('모든 학습 진도와 복습 일정이 초기화됩니다. 계속할까요?')) return;
  progress = {}; srData = {};
  saveProgress(); saveSR();
  renderSidebar(); router();
}

/* ===================== Progress helpers ===================== */
function chapProg(id) { return progress[id] || { done: false, visited: false, checkpoints: {} }; }
function isDone(id) { return !!(progress[id] && progress[id].done); }
function markVisited(id) {
  const p = chapProg(id); p.visited = true; progress[id] = p; saveProgress();
}
function toggleDone(id) {
  const p = chapProg(id); p.done = !p.done; progress[id] = p; saveProgress();
  renderSidebar();
}

function partProgress(part) {
  let done = 0;
  for (const ch of part.chapters) if (isDone(ch.id)) done++;
  return { done, total: part.chapters.length };
}
function trackProgress(track) {
  let done = 0, total = 0;
  for (const part of (track.parts || [])) { const p = partProgress(part); done += p.done; total += p.total; }
  return { done, total };
}
function overallProgress() {
  let done = 0, total = 0;
  for (const t of manifest.tracks) { const p = trackProgress(t); done += p.done; total += p.total; }
  return { done, total };
}

/* ===================== Spaced repetition (SM-2), read-gated ===================== */
function gradeCheckpoint(cpId, good) {
  if (!srData[cpId]) srData[cpId] = { ease: 2.5, interval: 0, nextReview: 0, reps: 0 };
  const d = srData[cpId];
  const q = good ? 5 : 2;
  if (q >= 3) {
    if (d.reps === 0) d.interval = 1;
    else if (d.reps === 1) d.interval = 3;
    else d.interval = Math.round(d.interval * d.ease);
    d.reps++;
  } else {
    d.reps = 0;
    d.interval = 0; // lapse → due again immediately (gate is nextReview, not reps)
  }
  d.ease = Math.max(1.3, d.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  d.nextReview = Date.now() + d.interval * 86400000;
  saveSR();
  renderSidebar();
}
function dueCheckpoints() {
  const now = Date.now();
  return Object.keys(srData).filter(id => srData[id].nextReview <= now);
}

/* ===================== Markdown rendering ===================== */
// Run hljs + mermaid + wire checkpoint buttons inside a container
function enhance(container, chapterId) {
  // mermaid blocks were emitted by marked as <pre><code class="language-mermaid">
  container.querySelectorAll('code.language-mermaid').forEach(code => {
    const pre = code.closest('pre');
    const div = document.createElement('div');
    div.className = 'mermaid';
    div.textContent = code.textContent;
    pre.replaceWith(div);
  });
  // syntax highlight remaining code blocks
  container.querySelectorAll('pre code').forEach(block => {
    try { hljs.highlightElement(block); } catch {}
  });
  if (window.mermaid) { try { mermaid.run({ nodes: container.querySelectorAll('.mermaid') }); } catch {} }

  // checkpoints
  container.querySelectorAll('.checkpoint').forEach(cp => {
    const cId = cp.dataset.chapter;
    const idx = +cp.dataset.cp;
    cp.addEventListener('click', e => {
      const btn = e.target.closest('button'); if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'hint') {
        cp.querySelector('.cp-hint-box').innerHTML = `<div class="cp-hint">${cp._hint || ''}</div>`;
      } else if (act === 'reveal') {
        cp.querySelector('.cp-answer-box').classList.remove('hidden');
        btn.classList.add('hidden');
      } else if (act === 'grade') {
        const good = btn.dataset.good === '1';
        const p = chapProg(cId); p.checkpoints[idx] = true; p.visited = true; progress[cId] = p; saveProgress();
        gradeCheckpoint(`${cId}#${idx}`, good);
        cp.querySelector('.cp-grade').innerHTML = `<div class="cp-done-msg">${good ? '✓ 복습 일정 +' : '곧 다시 복습합니다'}</div>`;
      }
    });
  });
  // stash hints (avoid HTML-escaping issues by reading from data)
  // hint text was put as data attribute? We rendered button only; store hint via closure not available.
}

/* ===================== Sidebar ===================== */
function renderSidebar() {
  const ov = overallProgress();
  const pct = ov.total ? Math.round(ov.done / ov.total * 100) : 0;
  document.getElementById('overall').innerHTML = `
    <div class="ov-top"><span>전체 진도</span><b>${pct}%</b></div>
    <div class="bar"><i style="width:${pct}%"></i></div>
    <div class="ov-top" style="margin-top:4px;"><span>${ov.done} / ${ov.total} chapters</span></div>`;

  const due = dueCheckpoints().length;
  const rl = document.getElementById('review-link');
  rl.innerHTML = `Review${due ? `<span class="due">${due}</span>` : ''}`;
  rl.href = '#/review';

  const tree = document.getElementById('nav-tree');
  let html = '';
  for (const track of manifest.tracks) {
    html += `<div class="track-title">${track.title}</div>`;
    for (const part of (track.parts || [])) {
      const pp = partProgress(part);
      const isCol = collapsed.has(part.id);
      html += `<div class="part ${isCol ? 'collapsed' : ''}" data-part="${part.id}">
        <div class="part-head" data-toggle="${part.id}">
          <span class="caret">&#9660;</span>
          <span>${part.title}</span>
          <span class="ptag">${pp.done}/${pp.total}</span>
        </div>
        <div class="chapters">`;
      for (const ch of part.chapters) {
        const p = chapProg(ch.id);
        const cls = isDone(ch.id) ? 'done' : (p.visited ? 'partial' : '');
        html += `<a class="chap ${cls}" href="#/${track.id}/${part.id}/${ch.id}" data-chap="${ch.id}">
          <span class="dot"></span><span class="chap-name">${ch.title}</span></a>`;
      }
      html += `</div></div>`;
    }
  }
  tree.innerHTML = html;

  tree.querySelectorAll('[data-toggle]').forEach(el => {
    el.onclick = () => {
      const id = el.dataset.toggle;
      if (collapsed.has(id)) collapsed.delete(id); else collapsed.add(id);
      save(COLLAPSE_KEY, [...collapsed]);
      el.closest('.part').classList.toggle('collapsed');
    };
  });
  highlightActive();
}

function highlightActive() {
  const id = currentChapterId();
  document.querySelectorAll('.chap').forEach(c => c.classList.toggle('active', c.dataset.chap === id));
}
function currentChapterId() {
  const m = location.hash.match(/^#\/[^/]+\/[^/]+\/([^/]+)$/);
  return m ? m[1] : null;
}

function filterSidebar(q) {
  document.querySelectorAll('.part').forEach(part => {
    let any = false;
    part.querySelectorAll('.chap').forEach(ch => {
      const match = !q || ch.querySelector('.chap-name').textContent.toLowerCase().includes(q);
      ch.style.display = match ? '' : 'none';
      if (match) any = true;
    });
    part.style.display = any ? '' : 'none';
    if (q) part.classList.remove('collapsed');
  });
}

/* ===================== Router ===================== */
function router() {
  const hash = location.hash || '#/';
  const content = document.getElementById('content');
  // close mobile sidebar on navigation
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('scrim').classList.remove('show');

  if (hash === '#/' || hash === '') return renderHome(content);
  if (hash === '#/review') return renderReview(content);

  const m = hash.match(/^#\/([^/]+)\/([^/]+)\/([^/]+)$/);
  if (!m) return renderHome(content);
  return renderChapter(content, m[3]);
}

/* ===================== Views ===================== */
function renderHome(content) {
  highlightActive();
  let cards = '';
  for (const track of manifest.tracks) {
    const tp = trackProgress(track);
    const pct = tp.total ? Math.round(tp.done / tp.total * 100) : 0;
    const first = (track.parts && track.parts[0] && track.parts[0].chapters[0])
      ? `#/${track.id}/${track.parts[0].id}/${track.parts[0].chapters[0].id}` : '#/';
    cards += `<a class="track-card" href="${first}">
      <h3>${track.title}</h3>
      <p>${track.subtitle || ''}</p>
      <div class="meta">${tp.done}/${tp.total} chapters · ${pct}%</div>
      <div class="bar"><i style="width:${pct}%"></i></div>
    </a>`;
  }
  content.innerHTML = `<div class="content-inner">
    <div class="hero">
      <h1>UVM Lab</h1>
      <p>읽고 · 이해하고 · 그 자리에서 확인하는 UVM 학습 플랫폼</p>
    </div>
    <div class="track-cards">${cards}</div>
    <div class="callout note"><div class="callout-title">학습 방식</div>
      <p>각 챕터는 <b>TL;DR → 본문 → 코드 → 함정(Gotcha) → 다이어그램 → 체크포인트</b> 순서입니다.
      체크포인트를 풀면 그 항목만 <a href="#/review">복습(Review)</a> 큐에 들어갑니다 — 안 읽은 내용은 퀴즈로 나오지 않습니다.</p></div>
  </div>`;
}

async function renderChapter(content, chapterId) {
  const entry = chapterById[chapterId];
  if (!entry) return renderHome(content);
  content.innerHTML = `<div class="content-inner"><div class="loading">Loading…</div></div>`;

  let md = mdCache[chapterId];
  if (md == null) {
    try {
      md = await fetch('content/' + entry.chapter.file).then(r => { if (!r.ok) throw new Error(r.status); return r.text(); });
      mdCache[chapterId] = md;
    } catch (e) {
      content.innerHTML = `<div class="content-inner"><div class="callout gotcha"><div class="callout-title">로드 실패</div>
        <p>${entry.chapter.file} (${e.message})</p></div></div>`;
      return;
    }
  }

  markVisited(chapterId);
  renderSidebar();

  const idx = flatChapters.findIndex(f => f.chapter.id === chapterId);
  const prev = flatChapters[idx - 1];
  const next = flatChapters[idx + 1];
  const done = isDone(chapterId);

  // pull hints into closure: render markdown but keep checkpoint hint text
  const { html, hints } = renderChapterBody(md, chapterId);

  content.innerHTML = `<div class="content-inner">
    <div class="crumb"><a href="#/">Home</a> › ${entry.trackTitle} › ${entry.partTitle}</div>
    <div class="md">${html}</div>
    <button class="mark-done ${done ? 'is-done' : ''}" id="mark-done">${done ? '✓ 완료됨 — 되돌리기' : '이 챕터 완료 표시'}</button>
    <div class="chap-foot">
      ${prev ? `<a class="prev" href="${prev.href}"><span class="dir">← Prev</span>${prev.chapter.title}</a>` : `<a class="prev disabled"></a>`}
      ${next ? `<a class="next" href="${next.href}"><span class="dir">Next →</span>${next.chapter.title}</a>` : `<a class="next disabled"></a>`}
    </div>
  </div>`;

  const md_el = content.querySelector('.md');
  // attach hints to checkpoints before enhancing
  md_el.querySelectorAll('.checkpoint').forEach(cp => { cp._hint = hints[cp.dataset.cp] || ''; });
  enhance(md_el, chapterId);

  document.getElementById('mark-done').onclick = () => {
    toggleDone(chapterId);
    const b = document.getElementById('mark-done');
    const d = isDone(chapterId);
    b.className = `mark-done ${d ? 'is-done' : ''}`;
    b.textContent = d ? '✓ 완료됨 — 되돌리기' : '이 챕터 완료 표시';
  };
  window.scrollTo(0, 0);
  highlightActive();
}

// Parse a checkpoint body into {q,a,h}. Fields begin with Q:/A:/H: at line start
// and continue (multi-line) until the next marker.
function parseCheck(body) {
  const fields = { Q: [], A: [], H: [] };
  let cur = null;
  for (const line of body.split('\n')) {
    const m = line.match(/^([QAH]):\s?(.*)$/);
    if (m) { cur = m[1]; fields[cur].push(m[2]); }
    else if (cur) fields[cur].push(line);
  }
  return { q: fields.Q.join('\n').trim(), a: fields.A.join('\n').trim(), h: fields.H.join('\n').trim() };
}

// returns {html, hints:{idx:hintHtml}}
function renderChapterBody(src, chapterId) {
  const hints = {};
  src = src.replace(/```check\n([\s\S]*?)```/g, (_, body) => {
    const { q, a, h } = parseCheck(body);
    const idx = Object.keys(hints).length;
    hints[idx] = h ? marked.parseInline(h) : '';
    return `\n<div class="checkpoint" data-cp="${idx}" data-chapter="${chapterId}">
      <div class="cp-head">✓ Checkpoint</div>
      <div class="cp-body">
        <div class="cp-q">${marked.parseInline(q)}</div>
        ${h ? `<button class="cp-hint-btn" data-act="hint">Hint</button>` : ''}
        <button class="cp-reveal" data-act="reveal">정답 보기</button>
        <div class="cp-hint-box"></div>
        <div class="cp-answer-box hidden">
          <div class="cp-answer">${marked.parse(a)}</div>
          <div class="cp-grade">
            <button class="cp-again" data-act="grade" data-good="0">다시</button>
            <button class="cp-good" data-act="grade" data-good="1">알았음</button>
          </div>
        </div>
      </div>
    </div>\n`;
  });
  src = src.replace(/:::(\w+)(?:[ \t]+([^\n]*))?\n([\s\S]*?)\n:::/g, (_, type, title, body) => {
    const labels = { tldr: 'TL;DR', gotcha: '⚠ Gotcha', tip: '✓ Tip', note: 'Note', analogy: '≈ 비유' };
    const label = (title && title.trim()) || labels[type] || type;
    return `\n<div class="callout ${type}"><div class="callout-title">${label}</div>\n\n${body.trim()}\n\n</div>\n`;
  });
  const html = marked.parse(src);
  return { html, hints };
}

function renderReview(content) {
  highlightActive();
  const due = dueCheckpoints();
  if (!due.length) {
    content.innerHTML = `<div class="content-inner"><div class="hero"><h1>Review</h1></div>
      <div class="review-empty">복습할 항목이 없습니다. 챕터의 체크포인트를 풀면 여기 쌓입니다.</div></div>`;
    return;
  }
  // group by chapter
  const byChap = {};
  for (const id of due) { const cId = id.split('#')[0]; (byChap[cId] = byChap[cId] || []).push(id); }
  let list = '';
  for (const cId in byChap) {
    const entry = chapterById[cId];
    if (!entry) continue;
    list += `<a class="track-card" href="${entry.href}"><h3>${entry.chapter.title}</h3>
      <p>${entry.partTitle}</p><div class="meta">복습 대기 ${byChap[cId].length}개 체크포인트</div></a>`;
  }
  content.innerHTML = `<div class="content-inner"><div class="hero"><h1>Review</h1>
    <p>${due.length}개 체크포인트가 복습 대기 중입니다. 챕터로 이동해 다시 풀어보세요.</p></div>
    <div class="track-cards">${list}</div></div>`;
}

init();

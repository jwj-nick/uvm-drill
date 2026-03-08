// UVM Drill App
const STORAGE_KEY = 'uvm-drill-progress';
const SR_KEY = 'uvm-drill-sr';
const DAILY_KEY = 'uvm-drill-daily';

const DATA_FILES = [
  'data/uvm/P1_basics.json',
  'data/uvm/P2_components.json',
  'data/uvm/P3_tb_patterns.json',
  'data/uvm/P4_interview.json',
];

let allPhases = [];
let progress = {};   // { cardId: { correct, wrong, streak, lastSeen } }
let srData = {};     // { cardId: { ease, interval, nextReview, reps } }
let currentPhase = null;
let currentSection = null; // null = all sections
let currentCards = [];
let currentIndex = 0;
let filter = 'all';
let viewMode = 'home';

// ===================== Data Loading =====================
async function loadData() {
  const results = await Promise.all(
    DATA_FILES.map(f => fetch(f).then(r => r.json()))
  );
  allPhases = results;
  loadProgress();
  loadSR();
  renderHome();
}

// ===================== LocalStorage =====================
function loadProgress() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) progress = JSON.parse(saved);
}
function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}
function loadSR() {
  const saved = localStorage.getItem(SR_KEY);
  if (saved) srData = JSON.parse(saved);
}
function saveSR() {
  localStorage.setItem(SR_KEY, JSON.stringify(srData));
}

// ===================== Spaced Repetition (SM-2) =====================
function updateSR(cardId, quality) {
  if (!srData[cardId]) {
    srData[cardId] = { ease: 2.5, interval: 0, nextReview: 0, reps: 0 };
  }
  const d = srData[cardId];
  if (quality >= 3) {
    if (d.reps === 0) d.interval = 1;
    else if (d.reps === 1) d.interval = 3;
    else d.interval = Math.round(d.interval * d.ease);
    d.reps++;
  } else {
    d.reps = 0;
    d.interval = 0;
  }
  d.ease = Math.max(1.3, d.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  d.nextReview = Date.now() + d.interval * 24 * 60 * 60 * 1000;
  saveSR();
}

// ===================== Progress Helpers =====================
function getCardStatus(cardId) {
  const p = progress[cardId];
  if (!p || (p.correct === 0 && p.wrong === 0)) return 'new';
  if (p.streak >= 3) return 'mastered';
  if (p.correct > p.wrong) return 'learning';
  return 'weak';
}

function getPhaseStats(phase) {
  let total = 0, mastered = 0, weak = 0, newCount = 0;
  for (const s of phase.sections) {
    for (const c of s.cards) {
      total++;
      const st = getCardStatus(c.id);
      if (st === 'mastered') mastered++;
      else if (st === 'weak') weak++;
      else if (st === 'new') newCount++;
    }
  }
  return { total, mastered, weak, newCount, learning: total - mastered - weak - newCount };
}

function getAllCards(phase, sectionIdx) {
  let cards = [];
  if (sectionIdx !== null && sectionIdx !== undefined) {
    cards = [...phase.sections[sectionIdx].cards];
  } else {
    for (const s of phase.sections) cards.push(...s.cards);
  }
  if (filter === 'weak') return cards.filter(c => getCardStatus(c.id) === 'weak');
  if (filter === 'new') return cards.filter(c => getCardStatus(c.id) === 'new');
  if (filter === 'review') return cards.filter(c => getCardStatus(c.id) !== 'mastered');
  return cards;
}

function getTotalStats() {
  let total = 0, mastered = 0;
  for (const phase of allPhases) {
    const s = getPhaseStats(phase);
    total += s.total;
    mastered += s.mastered;
  }
  return { total, mastered };
}

function getDueCount() {
  const now = Date.now();
  let count = 0;
  for (const phase of allPhases) {
    for (const s of phase.sections) {
      for (const c of s.cards) {
        const sr = srData[c.id];
        if (sr && sr.nextReview <= now && sr.reps > 0) count++;
      }
    }
  }
  return count;
}

function getDueCards() {
  const now = Date.now();
  const cards = [];
  for (const phase of allPhases) {
    for (const s of phase.sections) {
      for (const c of s.cards) {
        const sr = srData[c.id];
        if (sr && sr.nextReview <= now && sr.reps > 0) cards.push(c);
      }
    }
  }
  return cards;
}

// ===================== Markdown-lite =====================
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderMarkdown(text) {
  if (!text) return '';
  let html = escapeHtml(text);
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\n/g, '<br>');
  return html;
}

// ===================== Render: Home =====================
function renderHome() {
  viewMode = 'home';
  currentPhase = null;
  const app = document.getElementById('app');
  const stats = getTotalStats();
  const pct = stats.total ? Math.round((stats.mastered / stats.total) * 100) : 0;
  const dueCount = getDueCount();

  let html = `
    <header>
      <h1>UVM Drill</h1>
      <p>UVM Verification Mastery</p>
    </header>

    <div class="overall-stats">
      <h3>Mastery</h3>
      <div class="big-number">${pct}%</div>
      <div class="sub">${stats.mastered} mastered / ${stats.total} total</div>
      <div style="margin-top:8px;">
        <span class="reset-link" onclick="resetAll()">reset all</span>
      </div>
    </div>

    <div class="quick-actions">
      <button class="btn-primary" onclick="startDaily()" style="background:var(--green);color:var(--bg);">Daily 5</button>
      <button class="btn-primary" onclick="startRandom()">Random 10</button>
      <button class="btn-primary" onclick="startWeakOnly()" style="background:var(--red);">Weak Only</button>
      ${dueCount > 0 ? `<button class="btn-primary" onclick="startReviewDue()" style="background:var(--yellow);color:var(--bg);">Review (${dueCount})</button>` : ''}
    </div>

    <div class="phase-grid">
  `;

  for (let i = 0; i < allPhases.length; i++) {
    const phase = allPhases[i];
    const s = getPhaseStats(phase);
    const pct = s.total ? Math.round((s.mastered / s.total) * 100) : 0;
    html += `
      <div class="phase-card" onclick="showPhase(${i})">
        <div class="phase-header">
          <span class="phase-badge">${phase.phase}</span>
          <span class="phase-title">${phase.title}</span>
        </div>
        <div class="progress-bar"><div class="fill" style="width:${pct}%"></div></div>
        <div class="phase-stats">
          <span class="new">${s.newCount} new</span>
          <span class="weak">${s.weak} weak</span>
          <span class="learning">${s.learning} learning</span>
          <span class="mastered">${s.mastered} mastered</span>
        </div>
      </div>
    `;
  }

  html += `</div>`;
  app.innerHTML = html;
}

// ===================== Render: Phase Sections =====================
function showPhase(phaseIdx) {
  viewMode = 'sections';
  currentPhase = allPhases[phaseIdx];
  const app = document.getElementById('app');
  const phase = currentPhase;

  let html = `
    <div class="top-bar">
      <button class="btn-back" onclick="renderHome()">&#8592; Home</button>
      <span class="quiz-title">${phase.title}</span>
    </div>

    <button class="btn-start-all" onclick="startDrill(${phaseIdx}, null)">
      Start All &#8594;
    </button>

    <div class="section-list">
  `;

  for (let i = 0; i < phase.sections.length; i++) {
    const sec = phase.sections[i];
    const mastered = sec.cards.filter(c => getCardStatus(c.id) === 'mastered').length;
    const weak = sec.cards.filter(c => getCardStatus(c.id) === 'weak').length;
    html += `
      <div class="section-card" onclick="startDrill(${phaseIdx}, ${i})">
        <div class="section-name">${sec.name}</div>
        <div class="section-meta">
          ${sec.cards.length} cards &middot; ${mastered} mastered
          ${weak > 0 ? ` &middot; <span style="color:var(--red)">${weak} weak</span>` : ''}
        </div>
      </div>
    `;
  }

  html += `</div>`;
  app.innerHTML = html;
}

// ===================== Start Drill =====================
function startDrill(phaseIdx, sectionIdx) {
  currentPhase = allPhases[phaseIdx];
  currentSection = sectionIdx;
  filter = 'all';
  currentCards = getAllCards(currentPhase, sectionIdx);
  currentIndex = 0;
  renderDrill();
}

function startSpecialDrill(title, cards) {
  if (cards.length === 0) { alert('No cards available!'); return; }
  currentPhase = { phase: 'SP', title: title, sections: [{ name: title, cards: cards }] };
  currentSection = 0;
  filter = 'all';
  currentCards = [...cards];
  currentIndex = 0;
  renderDrill();
}

function startDaily() {
  const today = new Date().toISOString().slice(0, 10);
  const saved = JSON.parse(localStorage.getItem(DAILY_KEY) || '{}');

  let ids;
  if (saved.date === today && saved.ids) {
    ids = saved.ids;
  } else {
    const allCards = allPhases.flatMap(p => p.sections.flatMap(s => s.cards));
    const due = getDueCards();
    const weak = allCards.filter(c => getCardStatus(c.id) === 'weak');
    const newCards = allCards.filter(c => getCardStatus(c.id) === 'new');

    const pool = [];
    pool.push(...due.slice(0, 2));
    pool.push(...weak.filter(c => !pool.find(p => p.id === c.id)).slice(0, 2));
    pool.push(...newCards.filter(c => !pool.find(p => p.id === c.id)).slice(0, 3));
    const rest = allCards.filter(c => !pool.find(p => p.id === c.id));
    pool.push(...rest.sort(() => Math.random() - 0.5).slice(0, Math.max(0, 5 - pool.length)));

    const picked = pool.slice(0, 5).sort(() => Math.random() - 0.5);
    ids = picked.map(c => c.id);
    localStorage.setItem(DAILY_KEY, JSON.stringify({ date: today, ids: ids }));
  }

  const allCards = allPhases.flatMap(p => p.sections.flatMap(s => s.cards));
  const cards = ids.map(id => allCards.find(c => c.id === id)).filter(Boolean);
  startSpecialDrill(`Daily (${new Date().toLocaleDateString('ko-KR')})`, cards);
}

function startRandom() {
  const allCards = allPhases.flatMap(p => p.sections.flatMap(s => s.cards));
  const shuffled = [...allCards].sort(() => Math.random() - 0.5).slice(0, 10);
  startSpecialDrill('Random 10', shuffled);
}

function startWeakOnly() {
  const allCards = allPhases.flatMap(p => p.sections.flatMap(s => s.cards));
  const weak = allCards.filter(c => getCardStatus(c.id) === 'weak');
  startSpecialDrill(`Weak Only (${weak.length})`, weak);
}

function startReviewDue() {
  const due = getDueCards();
  startSpecialDrill(`Review Due (${due.length})`, due);
}

// ===================== Render: Drill =====================
function renderDrill() {
  viewMode = 'drill';
  const app = document.getElementById('app');

  if (currentCards.length === 0) {
    app.innerHTML = `
      <div class="empty-state">
        <p>No cards match this filter.</p>
        <button class="btn-primary" onclick="setFilter('all')" style="margin-top:16px;">Show All</button>
        <button class="btn-secondary" onclick="renderHome()" style="margin-top:8px;">Home</button>
      </div>`;
    return;
  }

  const card = currentCards[currentIndex];
  const status = getCardStatus(card.id);
  const statusColors = { new: 'var(--text-dim)', weak: 'var(--red)', learning: 'var(--yellow)', mastered: 'var(--green)' };

  let html = `
    <div class="top-bar">
      <button class="btn-back" onclick="goBack()">&#8592;</button>
      <span class="quiz-counter">${currentIndex + 1} / ${currentCards.length}</span>
      <span class="status-badge" style="background:${statusColors[status]}">${status}</span>
    </div>

    <div class="filter-row">
      ${['all', 'new', 'weak', 'review'].map(f =>
        `<button class="filter-btn ${filter === f ? 'active' : ''}" onclick="setFilter('${f}')">${
          f === 'all' ? 'All' : f === 'new' ? 'New' : f === 'weak' ? 'Weak' : 'Review'
        }</button>`
      ).join('')}
    </div>

    <div class="quiz-card">
      <div class="question-text">${renderMarkdown(card.question)}</div>

      <div id="hint-area"></div>
      <div id="answer-area"></div>
    </div>
  `;

  // Tags
  if (card.tags && card.tags.length) {
    html += `<div class="tag-row">`;
    if (card.difficulty) html += `<span class="tag ${card.difficulty}">${card.difficulty}</span>`;
    for (const t of card.tags) html += `<span class="tag">#${t}</span>`;
    html += `</div>`;
  }

  app.innerHTML = html;

  // Render hint/answer area after DOM is ready
  renderInteraction(card);
}

function renderInteraction(card) {
  const hintArea = document.getElementById('hint-area');
  const answerArea = document.getElementById('answer-area');

  // Hint button
  if (card.hint) {
    hintArea.innerHTML = `<button class="hint-btn" id="hint-btn" onclick="showHint()">Hint</button>`;
  }

  // Show Answer button
  answerArea.innerHTML = `
    <button class="btn-reveal" id="btn-reveal" onclick="revealAnswer()">Show Answer (Space)</button>
  `;
}

function showHint() {
  const card = currentCards[currentIndex];
  document.getElementById('hint-area').innerHTML = `
    <div class="hint-box">${escapeHtml(card.hint)}</div>
  `;
}

function revealAnswer() {
  const card = currentCards[currentIndex];
  const hintBtn = document.getElementById('hint-btn');
  if (hintBtn) hintBtn.classList.add('hidden');

  document.getElementById('hint-area').innerHTML = card.hint
    ? `<div class="hint-box">${escapeHtml(card.hint)}</div>`
    : '';

  document.getElementById('answer-area').innerHTML = `
    <div class="answer-box">
      <p>${renderMarkdown(card.answer)}</p>
    </div>
    <div class="grade-row">
      <button class="btn-wrong" onclick="gradeCard('wrong')">Didn't know (1)</button>
      <button class="btn-partial" onclick="gradeCard('partial')">Partial (2)</button>
      <button class="btn-correct" onclick="gradeCard('correct')">Knew it (3)</button>
    </div>
  `;
}

function gradeCard(result) {
  const card = currentCards[currentIndex];
  const prev = progress[card.id] || { correct: 0, wrong: 0, streak: 0, lastSeen: 0 };

  let srQuality;
  if (result === 'correct') {
    progress[card.id] = {
      correct: prev.correct + 1,
      wrong: prev.wrong,
      streak: prev.streak + 1,
      lastSeen: Date.now()
    };
    srQuality = 5;
  } else if (result === 'partial') {
    progress[card.id] = {
      correct: prev.correct,
      wrong: prev.wrong,
      streak: 0,
      lastSeen: Date.now()
    };
    srQuality = 3;
  } else {
    progress[card.id] = {
      correct: prev.correct,
      wrong: prev.wrong + 1,
      streak: 0,
      lastSeen: Date.now()
    };
    srQuality = 1;
  }
  saveProgress();
  updateSR(card.id, srQuality);

  // Next card or complete
  setTimeout(() => {
    if (currentIndex < currentCards.length - 1) {
      currentIndex++;
      renderDrill();
    } else {
      renderComplete();
    }
  }, 200);
}

function setFilter(f) {
  filter = f;
  currentCards = getAllCards(currentPhase, currentSection);
  currentIndex = 0;
  renderDrill();
}

function goBack() {
  if (currentPhase && currentPhase.phase !== 'SP') {
    const idx = allPhases.indexOf(currentPhase);
    if (idx >= 0) { showPhase(idx); return; }
  }
  renderHome();
}

// ===================== Render: Complete =====================
function renderComplete() {
  viewMode = 'complete';
  const app = document.getElementById('app');
  const stats = currentPhase ? getPhaseStats(currentPhase) : { total: 0, mastered: 0, weak: 0 };

  app.innerHTML = `
    <div class="complete-box">
      <div class="complete-icon">&#127919;</div>
      <h2 class="complete-title">Drill Complete!</h2>
      <div class="complete-stats">
        Mastered: ${stats.mastered} / ${stats.total}<br>
        Weak: ${stats.weak}
      </div>
      <button class="btn-primary" onclick="restartDrill()" style="width:100%;margin-bottom:8px;">Again</button>
      <button class="btn-secondary" onclick="renderHome()" style="width:100%;">Home</button>
    </div>
  `;
}

function restartDrill() {
  currentCards = getAllCards(currentPhase, currentSection);
  currentIndex = 0;
  filter = 'all';
  renderDrill();
}

// ===================== Reset =====================
function resetAll() {
  if (confirm('All progress will be reset. Continue?')) {
    progress = {};
    srData = {};
    saveProgress();
    saveSR();
    localStorage.removeItem(DAILY_KEY);
    renderHome();
  }
}

// ===================== Keyboard =====================
document.addEventListener('keydown', (e) => {
  if (viewMode === 'home' || viewMode === 'sections') {
    if (e.key === 'Escape') renderHome();
    return;
  }

  if (viewMode === 'complete') {
    if (e.key === 'Escape' || e.key === 'Enter') renderHome();
    return;
  }

  if (viewMode !== 'drill' || !currentCards.length) return;

  // Reveal answer
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    const revealBtn = document.getElementById('btn-reveal');
    if (revealBtn) { revealAnswer(); return; }
  }

  // Hint
  if (e.key === 'h' || e.key === 'H') {
    const hintBtn = document.getElementById('hint-btn');
    if (hintBtn) { showHint(); return; }
  }

  // Grade: 1=didn't know, 2=partial, 3=knew it
  if (e.key === '1') { const btn = document.querySelector('.btn-wrong'); if (btn) gradeCard('wrong'); }
  if (e.key === '2') { const btn = document.querySelector('.btn-partial'); if (btn) gradeCard('partial'); }
  if (e.key === '3') { const btn = document.querySelector('.btn-correct'); if (btn) gradeCard('correct'); }

  // Navigation
  if (e.key === 'ArrowLeft' && currentIndex > 0) {
    currentIndex--;
    renderDrill();
  }
  if (e.key === 'ArrowRight' && currentIndex < currentCards.length - 1) {
    currentIndex++;
    renderDrill();
  }

  if (e.key === 'Escape') goBack();
});

// ===================== Init =====================
loadData();

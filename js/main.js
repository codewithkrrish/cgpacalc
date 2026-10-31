/* CGPACalc UI — renders semesters/subjects from state, keeps the grade
   selector and the grade-point input in sync, persists to localStorage,
   and draws the printable result card on canvas. All math lives in
   grades.js so it stays testable without a DOM. */
import {
  GRADE_ORDER, DEFAULT_SCALE, DEFAULT_FACTOR,
  pointsForLetter, letterForPoints, semesterResult, cgpaResult,
  toPercentage, requiredAverage, gradeDistribution, formatNum,
  validScale, clampPoints,
} from './grades.js';

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'cgpacalc-state-v1';

let uid = 1;
const nextId = () => `id-${Date.now()}-${uid++}`;

function blankSubject() {
  return { id: nextId(), name: '', credits: '', grade: 'A', points: 8 };
}
function blankSemester(name) {
  return { id: nextId(), name, subjects: [blankSubject(), blankSubject(), blankSubject()] };
}

let state = loadState();

function defaultState() {
  return {
    semesters: [blankSemester('Semester 1')],
    scale: { ...DEFAULT_SCALE },
    factor: DEFAULT_FACTOR,
  };
}

function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.semesters) || parsed.semesters.length === 0) {
      return defaultState();
    }
    if (!validScale(parsed.scale)) parsed.scale = { ...DEFAULT_SCALE };
    if (typeof parsed.factor !== 'number' || !Number.isFinite(parsed.factor) || parsed.factor <= 0) {
      parsed.factor = DEFAULT_FACTOR;
    }
    for (const sem of parsed.semesters) {
      if (!sem.id) sem.id = nextId();
      if (!sem.name) sem.name = 'Semester';
      if (!Array.isArray(sem.subjects)) sem.subjects = [];
      for (const sub of sem.subjects) {
        if (!sub.id) sub.id = nextId();
        if (sub.grade === undefined || sub.grade === null) sub.grade = 'Custom';
        if (sub.points === undefined || sub.points === null) {
          sub.points = pointsForLetter(sub.grade, parsed.scale) ?? 0;
        }
      }
    }
    return parsed;
  } catch {
    return defaultState();
  }
}

function saveState() {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* private mode */ }
}

/* ---------- rendering ---------- */

function gradeOptions(selected) {
  let html = GRADE_ORDER.map((g) => {
    const p = state.scale[g];
    return `<option value="${g}"${g === selected ? ' selected' : ''}>${g} (${p})</option>`;
  }).join('');
  html += `<option value="Custom"${selected === 'Custom' ? ' selected' : ''}>Custom</option>`;
  return html;
}

function subjectRowHtml(sub) {
  return `<div class="subject-row" data-subject="${sub.id}">
    <input class="sub-name" type="text" placeholder="Subject name (optional)" value="${escapeHtml(sub.name || '')}" aria-label="Subject name">
    <input class="sub-credits" type="number" min="0" step="0.5" placeholder="Credits" value="${sub.credits}" aria-label="Credits">
    <select class="sub-grade" aria-label="Letter grade">${gradeOptions(sub.grade)}</select>
    <input class="sub-points" type="number" min="0" max="10" step="0.1" placeholder="Points" value="${sub.points}" aria-label="Grade points">
    <button type="button" class="icon-btn remove-sub" aria-label="Remove subject">Remove</button>
  </div>`;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function renderSemesters() {
  const list = $('semesterList');
  list.innerHTML = state.semesters.map((sem, i) => {
    const res = semesterResult(sem.subjects, state.scale);
    return `<section class="semester-card" data-semester="${sem.id}">
      <div class="semester-head">
        <input class="sem-name" type="text" value="${escapeHtml(sem.name)}" aria-label="Semester name">
        <span class="sem-sgpa">SGPA: <strong>${res.sgpa === null ? '—' : formatNum(res.sgpa)}</strong></span>
        <span class="sem-credits">${formatNum(res.totalCredits, 1)} credits</span>
        <button type="button" class="icon-btn remove-sem" ${state.semesters.length === 1 ? 'disabled' : ''} aria-label="Remove semester">Remove semester</button>
      </div>
      <div class="subject-head"><span>Subject</span><span>Credits</span><span>Grade</span><span>Points</span><span></span></div>
      <div class="subject-list">${sem.subjects.map(subjectRowHtml).join('')}</div>
      <p class="sem-note">${res.sgpa === null ? 'Add credits to see this semester SGPA.' : ''}${res.excluded > 0 ? ` ${res.excluded} row(s) with 0 credits are ignored.` : ''}</p>
      <button type="button" class="btn btn-small add-sub">Add subject</button>
    </section>`;
  }).join('');
  $('semesterCountValue').textContent = String(state.semesters.length);
  updateSummary();
}

function currentResult() {
  return cgpaResult(state.semesters, state.scale);
}

function updateSummary() {
  const res = currentResult();
  const factor = state.factor;
  $('cgpaValue').textContent = res.cgpa === null ? '—' : formatNum(res.cgpa);
  $('totalCreditsValue').textContent = formatNum(res.totalCredits, 1);
  const pct = res.cgpa === null ? null : toPercentage(res.cgpa, factor);
  $('percentageValue').textContent = pct === null ? '—' : `${formatNum(pct)}%`;
  $('cgpaNote').textContent = res.cgpa === null
    ? 'Enter credits and grades to see your CGPA. Rows with 0 credits are ignored, never counted as NaN.'
    : `Across ${res.semesters.length} semester(s) and ${formatNum(res.totalCredits, 1)} counted credits.`;
  $('factorNote').textContent = `Percentage = CGPA x ${factor}. Conversion formulas vary by university — treat this as an estimate.`;

  const dist = gradeDistribution(state.semesters.flatMap((s) => s.subjects), state.scale);
  $('distributionList').innerHTML = dist.length === 0
    ? '<li class="muted">No counted subjects yet.</li>'
    : dist.map((d) => `<li><strong>${d.grade}</strong> — ${formatNum(d.credits, 1)} credits across ${d.count} subject(s)</li>`).join('');

  updateTarget(res);
  renderCard(res);
}

function updateTarget(res) {
  const target = Number($('targetCgpaInput').value);
  const remaining = Number($('remainingCreditsInput').value);
  const out = $('targetResult');
  if ($('targetCgpaInput').value === '' || $('remainingCreditsInput').value === '') {
    out.textContent = 'Enter a target CGPA and your remaining credits to see the required average.';
    return;
  }
  const r = requiredAverage({
    currentPoints: res.totalPoints, currentCredits: res.totalCredits,
    targetCgpa: target, remainingCredits: remaining,
  });
  if (r.status === 'invalid') {
    out.textContent = 'Check your inputs: target CGPA must be 0–10 and remaining credits must be above 0.';
  } else if (r.status === 'already') {
    out.textContent = `Target already safe: even with 0-point grades in your remaining ${remaining} credits, your CGPA stays at or above ${formatNum(target)}.`;
  } else if (r.status === 'impossible') {
    out.textContent = `Not reachable: you would need an average of ${formatNum(r.required)} grade points, above the 10-point maximum. Lower the target or add more remaining credits.`;
  } else {
    out.textContent = `You need an average of ${formatNum(r.required)} grade points across your remaining ${remaining} credits to finish at ${formatNum(target)} CGPA.`;
  }
}

/* ---------- result card (canvas) ---------- */

function renderCard(res) {
  const canvas = $('resultCanvas');
  const per = res.semesters;
  const height = 420 + Math.max(0, per.length - 1) * 34;
  canvas.width = 1080;
  canvas.height = height;
  let ctx = null;
  try { ctx = canvas.getContext('2d'); } catch { ctx = null; }
  if (!ctx) { $('cardStatus').textContent = 'Result card preview is unavailable in this browser.'; return; }
  ctx.fillStyle = '#0B0B0F';
  ctx.fillRect(0, 0, 1080, height);
  ctx.fillStyle = '#E5484D';
  ctx.fillRect(0, 0, 1080, 10);
  ctx.fillStyle = '#F5F5F7';
  ctx.font = '700 54px Inter, Arial, sans-serif';
  ctx.fillText('CGPACalc — Result Card', 64, 100);
  ctx.fillStyle = '#9A9AA5';
  ctx.font = '400 28px Inter, Arial, sans-serif';
  ctx.fillText('SGPA / CGPA, calculated locally in your browser', 64, 148);
  ctx.fillStyle = '#F5F5F7';
  ctx.font = '700 96px Inter, Arial, sans-serif';
  ctx.fillText(res.cgpa === null ? '—' : formatNum(res.cgpa), 64, 280);
  ctx.fillStyle = '#9A9AA5';
  ctx.font = '400 30px Inter, Arial, sans-serif';
  ctx.fillText('Overall CGPA', 64, 324);
  const pct = res.cgpa === null ? null : toPercentage(res.cgpa, state.factor);
  ctx.fillStyle = '#F5F5F7';
  ctx.font = '700 44px Inter, Arial, sans-serif';
  ctx.fillText(pct === null ? '—' : `${formatNum(pct)}%`, 560, 278);
  ctx.fillStyle = '#9A9AA5';
  ctx.font = '400 28px Inter, Arial, sans-serif';
  ctx.fillText(`Approx. percentage (x ${state.factor})`, 560, 322);
  ctx.fillText(`${formatNum(res.totalCredits, 1)} total credits`, 560, 364);
  let y = 430;
  ctx.font = '400 30px Inter, Arial, sans-serif';
  for (const s of per) {
    ctx.fillStyle = '#F5F5F7';
    ctx.fillText(s.name, 64, y);
    ctx.fillStyle = '#9A9AA5';
    ctx.fillText(`SGPA ${s.sgpa === null ? '—' : formatNum(s.sgpa)}  ·  ${formatNum(s.totalCredits, 1)} credits`, 560, y);
    y += 34;
  }
  ctx.fillStyle = '#9A9AA5';
  ctx.font = '400 24px Inter, Arial, sans-serif';
  ctx.fillText('Built by krrish · cgpacalc-tool.vercel.app · Grade scales and conversions vary by university.', 64, height - 36);
  $('cardStatus').textContent = 'Result card ready. Download it as a PNG or print this page.';
}

/* ---------- scale editor ---------- */

function renderScaleEditor() {
  $('scaleEditor').innerHTML = GRADE_ORDER.map((g) => `
    <label class="scale-field">${g}
      <input type="number" min="0" max="10" step="0.5" data-grade="${g}" value="${state.scale[g]}" aria-label="Points for grade ${g}">
    </label>`).join('');
}

/* ---------- events ---------- */

function findSemester(el) {
  const card = el.closest('[data-semester]');
  return state.semesters.find((s) => s.id === card.dataset.semester);
}
function findSubject(el) {
  const row = el.closest('[data-subject]');
  const sem = findSemester(el);
  return sem.subjects.find((s) => s.id === row.dataset.subject);
}

/* Mouse-wheel over a focused number input changes its value in Chromium
   (step 0.5 per notch on credits fields), silently corrupting a grade the
   user already typed the moment they scroll to another control — e.g. up
   to "Add semester". Blurring on wheel is the standard fix: the first
   wheel notch drops focus instead of changing the value, and the page
   still scrolls normally. Applies to every number input on the page. */
document.addEventListener('wheel', (e) => {
  const t = e.target;
  if (t && t.tagName === 'INPUT' && t.type === 'number') {
    t.blur();
  }
}, { passive: true });

$('semesterList').addEventListener('input', (e) => {
  const t = e.target;
  if (t.classList.contains('sem-name')) {
    findSemester(t).name = t.value;
  } else if (t.classList.contains('sub-name')) {
    findSubject(t).name = t.value;
  } else if (t.classList.contains('sub-credits')) {
    findSubject(t).credits = t.value;
  } else if (t.classList.contains('sub-points')) {
    const sub = findSubject(t);
    sub.points = t.value;
    const letter = letterForPoints(clampPoints(Number(t.value)), state.scale);
    sub.grade = letter || 'Custom';
    const row = t.closest('[data-subject]');
    const sel = row.querySelector('.sub-grade');
    if (sel) sel.value = sub.grade;
  }
  saveState();
  renderSemestersKeepFocus(t);
});

$('semesterList').addEventListener('change', (e) => {
  const t = e.target;
  if (t.classList.contains('sub-grade')) {
    const sub = findSubject(t);
    sub.grade = t.value;
    if (t.value !== 'Custom') {
      sub.points = pointsForLetter(t.value, state.scale);
      const row = t.closest('[data-subject]');
      const pts = row.querySelector('.sub-points');
      if (pts) pts.value = sub.points;
    }
    saveState();
    renderSemestersKeepFocus(t);
  }
});

$('semesterList').addEventListener('click', (e) => {
  const t = e.target;
  if (t.classList.contains('add-sub')) {
    findSemester(t).subjects.push(blankSubject());
    saveState(); renderSemesters();
  } else if (t.classList.contains('remove-sub')) {
    const sem = findSemester(t);
    sem.subjects = sem.subjects.filter((s) => s.id !== findSubject(t).id);
    if (sem.subjects.length === 0) sem.subjects.push(blankSubject());
    saveState(); renderSemesters();
  } else if (t.classList.contains('remove-sem')) {
    state.semesters = state.semesters.filter((s) => s.id !== findSemester(t).id);
    saveState(); renderSemesters();
  }
});

$('semesterList').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.target.classList.contains('sub-name')
    || e.target.classList.contains('sub-credits')
    || e.target.classList.contains('sub-points'))) {
    e.preventDefault();
    findSemester(e.target).subjects.push(blankSubject());
    saveState(); renderSemesters();
  }
});

/* Re-render summaries without rebuilding the row the user is typing in:
   we re-render the list but restore focus to the matching input. */
function renderSemestersKeepFocus(activeEl) {
  const row = activeEl.closest('[data-subject]');
  const semCard = activeEl.closest('[data-semester]');
  const cls = [...activeEl.classList].find((c) => c.startsWith('sub-') || c === 'sem-name');
  renderSemesters();
  if (!row || !semCard || !cls) return;
  const newCard = document.querySelector(`[data-semester="${semCard.dataset.semester}"]`);
  if (!newCard) return;
  let target = null;
  if (cls === 'sem-name') target = newCard.querySelector('.sem-name');
  else {
    const newRow = newCard.querySelector(`[data-subject="${row.dataset.subject}"]`);
    target = newRow ? newRow.querySelector(`.${cls}`) : null;
  }
  if (target) {
    target.focus();
    if (typeof target.setSelectionRange === 'function' && target.type === 'text') {
      const len = target.value.length;
      try { target.setSelectionRange(len, len); } catch { /* ignore */ }
    }
  }
}

$('addSemesterBtn').addEventListener('click', () => {
  state.semesters.push(blankSemester(`Semester ${state.semesters.length + 1}`));
  saveState(); renderSemesters();
});

$('factorInput').addEventListener('input', (e) => {
  const v = Number(e.target.value);
  if (Number.isFinite(v) && v > 0) state.factor = v;
  saveState(); updateSummary();
});

$('targetCgpaInput').addEventListener('input', updateSummary);
$('remainingCreditsInput').addEventListener('input', updateSummary);

$('scaleEditor').addEventListener('input', (e) => {
  const grade = e.target.dataset.grade;
  if (!grade) return;
  const v = Number(e.target.value);
  if (Number.isFinite(v) && v >= 0 && v <= 10) {
    state.scale[grade] = v;
    saveState(); renderSemesters();
  }
});
$('resetScaleBtn').addEventListener('click', () => {
  state.scale = { ...DEFAULT_SCALE };
  saveState(); renderScaleEditor(); renderSemesters();
});

$('sampleBtn').addEventListener('click', () => {
  state.semesters = [
    { id: nextId(), name: 'Semester 1', subjects: [
      { id: nextId(), name: 'Data Structures', credits: 4, grade: 'A', points: 8 },
      { id: nextId(), name: 'Digital Logic', credits: 4, grade: 'O', points: 10 },
      { id: nextId(), name: 'Mathematics I', credits: 4, grade: 'B+', points: 7 },
      { id: nextId(), name: 'C Programming Lab', credits: 2, grade: 'A+', points: 9 },
    ] },
    { id: nextId(), name: 'Semester 2', subjects: [
      { id: nextId(), name: 'Operating Systems', credits: 4, grade: 'A', points: 8 },
      { id: nextId(), name: 'Database Systems', credits: 4, grade: 'B', points: 6 },
      { id: nextId(), name: 'Computer Networks', credits: 3, grade: 'A+', points: 9 },
    ] },
  ];
  saveState(); renderSemesters();
});

$('clearAllBtn').addEventListener('click', () => {
  if (!window.confirm('Clear all semesters and subjects? Your saved data will be replaced with one empty semester.')) return;
  state.semesters = [blankSemester('Semester 1')];
  saveState(); renderSemesters();
});

$('clearSavedBtn').addEventListener('click', () => {
  try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  state = defaultState();
  renderScaleEditor(); renderSemesters();
  $('cardStatus').textContent = 'Saved data cleared.';
});

$('exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'cgpacalc-data.json';
  a.click();
  URL.revokeObjectURL(a.href);
  $('ioStatus').textContent = 'Exported cgpacalc-data.json.';
});

$('importBtn').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!parsed || !Array.isArray(parsed.semesters) || parsed.semesters.length === 0) {
      throw new Error('bad shape');
    }
    if (!validScale(parsed.scale)) parsed.scale = { ...DEFAULT_SCALE };
    state = parsed;
    saveState(); renderScaleEditor(); renderSemesters();
    $('ioStatus').textContent = `Imported ${parsed.semesters.length} semester(s).`;
  } catch {
    $('ioStatus').textContent = 'Import failed: that file is not CGPACalc JSON data.';
  }
  e.target.value = '';
});

$('downloadCardBtn').addEventListener('click', () => {
  const canvas = $('resultCanvas');
  try {
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'cgpacalc-result.png';
    a.click();
    $('cardStatus').textContent = 'Result card downloaded as cgpacalc-result.png.';
  } catch {
    $('cardStatus').textContent = 'PNG download is unavailable in this browser. Use Print instead.';
  }
});

$('printBtn').addEventListener('click', () => {
  try { window.print(); } catch { /* print unavailable */ }
});

/* ---------- init ---------- */
renderScaleEditor();
$('factorInput').value = state.factor;
renderSemesters();

/* CGPACalc pure grade math — no DOM, no I/O, so the Node harness can
   import this file directly and assert on the real logic.
   Conventions (documented honestly in the UI limitations panel):
   - 10-point scale by default: O=10, A+=9, A=8, B+=7, B=6, C=5, P=4, F=0.
   - A failed subject (F, 0 points) still counts its credits in the
     denominator: SGPA is over attempted credits, the standard rule most
     Indian universities follow. Some institutions exclude failed credits;
     the UI says so and the custom scale lets a user model that by
     removing the subject row instead.
   - Percentage = SGPA x factor (default 9.5, editable). Formulas vary by
     university; the UI labels this as an approximation. */

export const GRADE_ORDER = ['O', 'A+', 'A', 'B+', 'B', 'C', 'P', 'F'];

export const DEFAULT_SCALE = Object.freeze({
  O: 10, 'A+': 9, A: 8, 'B+': 7, B: 6, C: 5, P: 4, F: 0,
});

export const DEFAULT_FACTOR = 9.5;

export function clampPoints(p) {
  if (typeof p !== 'number' || !Number.isFinite(p)) return 0;
  return Math.min(10, Math.max(0, p));
}

export function clampCredits(c) {
  if (typeof c !== 'number' || !Number.isFinite(c) || c < 0) return 0;
  return c;
}

/** Grade points for a letter under a scale, or null when unknown. */
export function pointsForLetter(letter, scale = DEFAULT_SCALE) {
  if (!letter || !Object.prototype.hasOwnProperty.call(scale, letter)) return null;
  const p = Number(scale[letter]);
  return Number.isFinite(p) ? clampPoints(p) : null;
}

/** Exact letter for a point value under a scale, or null (custom value). */
export function letterForPoints(points, scale = DEFAULT_SCALE) {
  if (typeof points !== 'number' || !Number.isFinite(points)) return null;
  for (const grade of GRADE_ORDER) {
    if (Object.prototype.hasOwnProperty.call(scale, grade) && Number(scale[grade]) === points) {
      return grade;
    }
  }
  return null;
}

/** Nearest letter for a point value (ties break toward the higher grade). */
export function nearestLetter(points, scale = DEFAULT_SCALE) {
  if (typeof points !== 'number' || !Number.isFinite(points)) return null;
  let best = null; let bestDiff = Infinity;
  for (const grade of GRADE_ORDER) {
    if (!Object.prototype.hasOwnProperty.call(scale, grade)) continue;
    const diff = Math.abs(Number(scale[grade]) - points);
    if (diff < bestDiff - 1e-9) { best = grade; bestDiff = diff; }
  }
  return best;
}

/**
 * Normalise one subject row. Invalid credits become 0 and are flagged;
 * rows with 0 credits are excluded from SGPA totals but reported.
 * Returns { name, credits, points, grade, excluded, errors }.
 */
export function normaliseSubject(raw, scale = DEFAULT_SCALE) {
  const errors = [];
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  let credits = Number(raw.credits);
  if (!Number.isFinite(credits) || credits < 0) {
    errors.push('Credits must be a number 0 or above.');
    credits = 0;
  }
  let points;
  if (raw.grade && raw.grade !== 'Custom' && pointsForLetter(raw.grade, scale) !== null) {
    points = pointsForLetter(raw.grade, scale);
  } else {
    points = clampPoints(Number(raw.points));
    if (typeof raw.points !== 'number' && Number.isNaN(Number(raw.points))) {
      errors.push('Grade points must be a number between 0 and 10.');
      points = 0;
    }
  }
  const grade = letterForPoints(points, scale);
  return {
    name,
    credits,
    points,
    grade: grade || 'Custom',
    excluded: credits === 0,
    errors,
  };
}

/**
 * SGPA for one semester's subjects.
 * Returns { sgpa (null when no counted credits), totalCredits,
 *           totalPoints, counted, excluded, subjects }.
 */
export function semesterResult(subjects, scale = DEFAULT_SCALE) {
  const norm = subjects.map((s) => normaliseSubject(s, scale));
  let totalCredits = 0; let totalPoints = 0; let counted = 0; let excluded = 0;
  for (const s of norm) {
    if (s.excluded) { excluded += 1; continue; }
    counted += 1;
    totalCredits += s.credits;
    totalPoints += s.credits * s.points;
  }
  return {
    sgpa: totalCredits > 0 ? totalPoints / totalCredits : null,
    totalCredits,
    totalPoints,
    counted,
    excluded,
    subjects: norm,
  };
}

/**
 * CGPA across semesters (weighted by each semester's counted credits).
 * Each entry: { name, subjects }. Returns { cgpa (null when no credits),
 * totalCredits, totalPoints, semesters: [semesterResult + name] }.
 */
export function cgpaResult(semesters, scale = DEFAULT_SCALE) {
  const per = semesters.map((sem) => ({
    name: sem.name || 'Semester',
    ...semesterResult(sem.subjects || [], scale),
  }));
  let totalCredits = 0; let totalPoints = 0;
  for (const s of per) { totalCredits += s.totalCredits; totalPoints += s.totalPoints; }
  return {
    cgpa: totalCredits > 0 ? totalPoints / totalCredits : null,
    totalCredits,
    totalPoints,
    semesters: per,
  };
}

/** Percentage from an SGPA/CGPA value and a conversion factor. */
export function toPercentage(value, factor = DEFAULT_FACTOR) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (typeof factor !== 'number' || !Number.isFinite(factor) || factor <= 0) return null;
  return value * factor;
}

/**
 * What-if helper: average grade points needed over remaining credits to
 * reach a target CGPA.
 * Returns { required (null when inputs invalid), status } where status is
 * 'possible' | 'already' | 'impossible' | 'invalid'.
 * 'already': required <= 0, the target holds even with 0-point grades.
 * 'impossible': required > 10, no grade scale reaches it.
 */
export function requiredAverage({ currentPoints, currentCredits, targetCgpa, remainingCredits }) {
  const cp = Number(currentPoints); const cc = Number(currentCredits);
  const tg = Number(targetCgpa); const rc = Number(remainingCredits);
  if (![cp, cc, tg, rc].every(Number.isFinite) || cc < 0 || rc <= 0 || tg < 0 || tg > 10) {
    return { required: null, status: 'invalid' };
  }
  const required = (tg * (cc + rc) - cp) / rc;
  if (required <= 0) return { required, status: 'already' };
  if (required > 10) return { required, status: 'impossible' };
  return { required, status: 'possible' };
}

/** Credits grouped by grade letter across normalised subjects. */
export function gradeDistribution(subjects, scale = DEFAULT_SCALE) {
  const byGrade = new Map();
  for (const s of subjects.map((x) => normaliseSubject(x, scale))) {
    if (s.excluded) continue;
    const key = s.grade;
    const entry = byGrade.get(key) || { grade: key, credits: 0, count: 0 };
    entry.credits += s.credits;
    entry.count += 1;
    byGrade.set(key, entry);
  }
  return GRADE_ORDER.concat(['Custom'])
    .filter((g) => byGrade.has(g))
    .map((g) => byGrade.get(g));
}

export function formatNum(value, digits = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return value.toFixed(digits);
}

export function validScale(scale) {
  if (!scale || typeof scale !== 'object') return false;
  return GRADE_ORDER.every((g) => {
    const p = Number(scale[g]);
    return Number.isFinite(p) && p >= 0 && p <= 10;
  });
}

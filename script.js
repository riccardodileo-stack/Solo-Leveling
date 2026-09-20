'use strict';

// ============================================================
// CONFIGURAZIONE GENERALE
// ============================================================

const STORAGE_KEY = 'solo_leveling_state_v1';
const RESET_PASSWORD = 'LewisHamilton_44';
const BMI_TARGET = 22;
const MAX_STAT = 99;
const BODY_MAX = 90;
const GOAL_RUN = { km: 21.0975, pace: 5 };
const DAYS = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
const AUTO_DAYS = [1, 3, 5, 2, 4, 6, 0];
const TASKS = {
  italian: {
    title: 'Lettura in italiano',
    short: 'Italiano',
    icon: '📖',
    group: 'languages',
    stat: 'Italiano'
  },
  english: {
    title: 'Studio d’inglese',
    short: 'Inglese',
    icon: '🌐',
    group: 'languages',
    stat: 'Inglese'
  },
  japanese: {
    title: 'Studio di giapponese',
    short: 'Giapponese',
    icon: '⛩️',
    group: 'languages',
    stat: 'Giapponese'
  },
  run: {
    title: 'Sessione di corsa',
    short: 'Corsa',
    icon: '🏃',
    group: 'fitness',
    stat: 'Endurance'
  },
  tennis: {
    title: 'Allenamento di tennis',
    short: 'Tennis',
    icon: '🎾',
    group: 'fitness',
    stat: 'Strength'
  },
  gym1: {
    title: 'Palestra — Tipo 1',
    short: 'Palestra 1',
    icon: '🏋️',
    group: 'fitness',
    stat: 'Strength'
  },
  gym2: {
    title: 'Palestra — Tipo 2',
    short: 'Palestra 2',
    icon: '🏋️',
    group: 'fitness',
    stat: 'Strength'
  },
  gym3: {
    title: 'Palestra — Tipo 3',
    short: 'Palestra 3',
    icon: '🏋️',
    group: 'fitness',
    stat: 'Strength'
  }
};

// ============================================================
// STATO DELL'APP E STATO UI
// ============================================================

let state = loadState();
let ui = {
  section: state.started ? 'home' : 'settings',
  langTab: 'italian',
  fitnessTab: 'run',

  gymSheet: 'gym1',
  gymSheetsOpen: false,

  statPeriod: 'month',
  selectedDate: todayISO(),
  calendarMonth: monthISO(todayISO()),
  chartPeriod: 'month'
};
let workoutRuntime = null;
let toastTimer = null;

// ============================================================
// STORAGE, STATO INIZIALE E FUNZIONI DI BASE
// ============================================================

function defaultState() {
  return {
    version: 1,
    started: false,
    startDate: null,
    settings: null,
    records: {},
    weights: [],
    currentHeight: null,
    runLogs: [],
    tennisLogs: [],
    gymTemplates: { gym1: [], gym2: [], gym3: [] },
    books: { italian: [], english: [] },
    milestones: [],
    bonuses: { englishC1: false, japaneseExam: false }
  };
}

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return parsed && parsed.version === 1 ? { ...defaultState(), ...parsed } : defaultState();
  }
  catch (_) {
    return defaultState();
  }
}

function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

function clamp(n, min = 0, max = MAX_STAT) { return Math.min(max, Math.max(min, Number(n) || 0)); }

function round1(n) { return Math.round(n * 10) / 10; }

function dateObj(iso) { return new Date(`${iso}T12:00:00`); }

function todayISO() { const d = new Date(); return localISO(d); }

function localISO(d) { const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0'); return `${y}-${m}-${day}`; }

function monthISO(iso) { return iso.slice(0, 7); }

function addDays(iso, n) { const d = dateObj(iso); d.setDate(d.getDate() + n); return localISO(d); }

function dayDiff(a, b) { return Math.round((dateObj(b) - dateObj(a)) / 86400000); }

function formatDate(iso) { return dateObj(iso).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }); }

function formatMonth(m) { return dateObj(`${m}-01`).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }); }

function esc(v) { return String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }

function recordKey(date, task) { return `${date}|${task}`; }

function getRecord(date, task) { return state.records[recordKey(date, task)] || { done: false }; }

function isPast(iso) { return iso < todayISO(); }

function weeksForMonths(months) { return months * 52 / 12; }

function targetWeight(heightCm) { const m = heightCm / 100; return BMI_TARGET * m * m; }

function bmi(weight, heightCm) { const m = heightCm / 100; return weight / (m * m); }

function bodyShapeScore(weight, heightCm) { return round1(clamp(BODY_MAX * (1 - Math.abs(weight - targetWeight(heightCm)) / 30), 0, BODY_MAX)); }

function weekFrequency(schedule) { return schedule.mode === 'days' ? schedule.days.length : Number(schedule.perWeek || 0); }

function autoDays(perWeek) { return AUTO_DAYS.slice(0, clamp(perWeek, 0, 7)); }

function taskDays(schedule) { return schedule.mode === 'days' ? schedule.days.map(Number) : autoDays(Number(schedule.perWeek)); }

function isScheduled(task, iso) {
  if (!state.settings)
    return false;
  const schedule = state.settings.schedules[task];
  if (!schedule)
    return false;
  return taskDays(schedule).includes(dateObj(iso).getDay());
}

function scheduledTasks(iso, group = null) {
  return Object.keys(TASKS).filter(key => (!group || TASKS[key].group === group) && isScheduled(key, iso));
}

function completedCount(tasks, iso) { return tasks.filter(task => getRecord(iso, task).done).length; }

function periodDates(period, end = todayISO()) {
  const days = period === 'week' ? 7 : period === 'year' ? 365 : 30;
  return Array.from({ length: days }, (_, i) => addDays(end, -(days - 1 - i)));
}

function allActiveDates() {
  if (!state.started)
    return [];
  const start = state.startDate;
  const end = todayISO();
  const total = Math.max(0, dayDiff(start, end));
  return Array.from({ length: total + 1 }, (_, i) => addDays(start, i));
}

// ============================================================
// CALCOLO PROGRESSIONE E STATISTICHE
// ============================================================

function sessionIncrement(task) {
  const s = state.settings;
  const initMap = { italian: s.initial.italian, english: s.initial.english, japanese: s.initial.japanese };
  const sessions = Math.max(1, weekFrequency(s.schedules[task]) * weeksForMonths(s.levelMonths));
  return Math.max(0, (90 - initMap[task]) / sessions);
}

function countDone(task) {
  return Object.entries(state.records).filter(([key, val]) => key.endsWith(`|${task}`) && val.done).length;
}

function countMissed(task) {
  return allActiveDates().filter(d => d < todayISO() && isScheduled(task, d) && !getRecord(d, task).done).length;
}

function computeStats() {
  if (!state.settings)
    return null;
  const s = state.settings;
  const italian = clamp(s.initial.italian + countDone('italian') * sessionIncrement('italian') + state.books.italian.filter(b => b.done).length);
  const english = clamp(s.initial.english + countDone('english') * sessionIncrement('english') + (state.bonuses.englishC1 ? 9 : 0));
  const japanese = clamp(s.initial.japanese + countDone('japanese') * sessionIncrement('japanese') + (state.bonuses.japaneseExam ? 9 : 0));
  const knowledge = clamp(italian * .25 + english * .50 + japanese * .25);
  const gymKeys = ['gym1', 'gym2', 'gym3'];
  const plannedGym = gymKeys.reduce((n, k) => n + weekFrequency(s.schedules[k]), 0) * weeksForMonths(s.levelMonths);
  const gymIncrement = Math.max(0, (90 - s.initial.strength) / Math.max(1, plannedGym));
  const gymDone = gymKeys.reduce((n, k) => n + countDone(k), 0);
  const gymMissed = gymKeys.reduce((n, k) => n + countMissed(k), 0);
  const tennisTotal = weekFrequency(s.schedules.tennis) * weeksForMonths(s.levelMonths);
  const tennisIncrement = 5 / Math.max(1, tennisTotal);
  const strength = clamp(s.initial.strength + (gymDone - gymMissed) * gymIncrement + countDone('tennis') * tennisIncrement);
  let endurance = s.initial.endurance;
  if (state.runLogs.length) {
    const baseline = state.runLogs.slice().sort((a, b) => a.date.localeCompare(b.date))[0];
    const basePerformance = baseline.km / baseline.pace;
    const targetPerformance = GOAL_RUN.km / GOAL_RUN.pace;
    const recentRuns = state.runLogs.filter(r => dayDiff(r.date, todayISO()) <= 42);
    const source = recentRuns.length ? recentRuns : [baseline];
    const bestPerformance = Math.max(...source.map(r => r.km / r.pace));
    const ratio = clamp((bestPerformance - basePerformance) / Math.max(.001, targetPerformance - basePerformance), 0, 1);
    endurance = clamp(s.initial.endurance + ratio * (99 - s.initial.endurance));
  }
  const latestWeight = state.weights.length
    ? state.weights[state.weights.length - 1].weight
    : s.initial.weight;
  const currentHeight = state.currentHeight || s.initial.height;
  /* Body Shape base: 0-90 in funzione della distanza dal peso forma */
  const bodyShapeBase = bodyShapeScore(latestWeight, currentHeight);
  /*
      Bonus Strength:
      ogni 10 punti di Strength = +1 Body Shape.
      Esempi:
      Strength 9  -> +0
      Strength 10 -> +1
      Strength 57 -> +5
      Strength 87 -> +8
      Strength 99 -> +9
  */
  const strengthBodyBonus = Math.floor(strength / 10);
  /* Body Shape totale, massimo 99 */
  const bodyShape = clamp(bodyShapeBase + strengthBodyBonus, 0, 99);
  const dates30 = periodDates('month').filter(d => !state.startDate || d >= state.startDate);
  const datesAll = allActiveDates();
  const adherence = dates => {
    let total = 0, done = 0;
    dates.filter(d => d < todayISO()).forEach(d => { const tasks = scheduledTasks(d); total += tasks.length; done += completedCount(tasks, d); });
    return total ? done / total : .6;
  };
  const rolling = adherence(dates30);
  const lifetime = adherence(datesAll);
  const ratio = rolling * .7 + lifetime * .3;
  let perfectStreak = 0;
  for (let d = todayISO(); state.startDate && d >= state.startDate; d = addDays(d, -1)) {
    const ts = scheduledTasks(d);
    if (ts.length && completedCount(ts, d) === ts.length)
      perfectStreak++;
    else if (ts.length)
      break;
  }
  const consistency = clamp(60 + (ratio - .6) * 75 + Math.min(9, perfectStreak / 10));
  const overall = clamp((knowledge + consistency + endurance + strength + bodyShape) / 5);
  return { knowledge, italian, english, japanese, consistency, endurance, strength, bodyShape, overall, latestWeight, gymIncrement, tennisIncrement, rolling, lifetime };
}

// ============================================================
// UI GENERALE, NOTIFICHE, NAVIGAZIONE E RANK
// ============================================================

function medalForDate(date) {
  const tasks = scheduledTasks(date);
  if (!tasks.length)
    return '';
  const done = completedCount(tasks, date);
  if (done === tasks.length)
    return 'gold';
  if (done >= Math.ceil(tasks.length / 2))
    return 'silver';
  return done > 0 ? 'bronze' : '';
}

function notify(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2300);
}

function iconSvg(type) {
  const paths = {
    home: '<path d="M3.5 10.5 12 3l8.5 7.5"/><path d="M5.5 9v10.5h13V9"/><path d="M10 19.5v-5h4v5"/>',
    languages: '<path d="M4 5.5c2.8-.8 5.4-.6 8 1v13c-2.6-1.6-5.2-1.8-8-1z"/><path d="M20 5.5c-2.8-.8-5.4-.6-8 1v13c2.6-1.6 5.2-1.8 8-1z"/>',
    fitness: '<path d="M4 10v4M7 8v8M17 8v8M20 10v4M7 12h10"/>',
    stats: '<path d="M4 19V9h4v10zM10 19V4h4v15zM16 19v-8h4v8z"/>',
    settings: '<path d="M12 8.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 0 0 12 8.5Z"/><path d="M19 12a7 7 0 0 0-.08-1.04l2-1.48-2-3.46-2.34 1A7 7 0 0 0 14.8 6L14.5 3h-4l-.3 3a7 7 0 0 0-1.78 1.02l-2.34-1-2 3.46 2 1.48A7 7 0 0 0 6 12c0 .35.03.7.08 1.04l-2 1.48 2 3.46 2.34-1A7 7 0 0 0 10.2 18l.3 3h4l.3-3a7 7 0 0 0 1.78-1.02l2.34 1 2-3.46-2-1.48c.05-.34.08-.69.08-1.04Z"/>'
  };
  return `<svg viewBox="0 0 24 24">${paths[type]}</svg>`;
}

function nav() {
  const items = [['home', 'Home'], ['languages', 'Lingue'], ['fitness', 'Sport'], ['stats', 'Stats'], ['settings', 'Impostazioni']];
  return `<nav class="navbar"><div class="nav-inner">${items.map(([key, label]) => `<button class="nav-btn ${ui.section === key ? 'active' : ''}" data-nav="${key}">${iconSvg(key)}<span>${label}</span></button>`).join('')}</div></nav>`;
}

function rankFromOverall(overall) {
  const value = Number(overall) || 0;
  if (value >= 91)
    return 'S++';
  if (value >= 81)
    return 'S+';
  if (value >= 71)
    return 'S';
  if (value >= 61)
    return 'A';
  if (value >= 51)
    return 'B';
  if (value >= 41)
    return 'C';
  if (value >= 31)
    return 'D';
  if (value >= 21)
    return 'E';
  return 'F';
}

function isGoldRank(rank) {
  return ['S', 'S+', 'S++'].includes(rank);
}

function appHeader(title, eyebrow) {
  const stats = computeStats();
  const rank = rankFromOverall(stats ? stats.overall : 0);
  return `
  <header class="topbar">
      <div>
    <div class="eyebrow">${eyebrow}</div>
    <h1>${title}</h1>
      </div>

      <div class="avatar-rank ${isGoldRank(rank) ? 'gold-rank' : ''}">
    <span>RANK</span>
    <strong>${rank}</strong>
      </div>
  </header>
  `;
}

function render() {
  const app = document.getElementById('app');
  if (!state.started) {
    app.innerHTML = renderSetup();
    bindSetup();
    return;
  }
  const pages = {
    home: renderHome,
    languages: renderLanguages,
    fitness: renderFitness,
    stats: renderStats,
    settings: renderSettings
  };
  app.innerHTML = `<main class="app-shell"><section class="page">${pages[ui.section]()}</section>${nav()}</main>`;
  bindCommon();
  if (ui.section === 'home')
    bindHome();
  if (ui.section === 'languages')
    bindLanguages();
  if (ui.section === 'fitness')
    bindFitness();
  if (ui.section === 'stats')
    bindStats();
  if (ui.section === 'settings')
    bindSettings();
}

// ============================================================
// SETUP INIZIALE
// ============================================================

function defaultSchedules() {
  return {
    italian: { mode: 'days', days: [1, 4], perWeek: 2, duration: 30 },
    english: { mode: 'days', days: [2, 5], perWeek: 2, duration: 30 },
    japanese: { mode: 'days', days: [3, 6], perWeek: 2, duration: 30 },
    run: { mode: 'days', days: [2, 6], perWeek: 2 },
    tennis: { mode: 'days', days: [4], perWeek: 1 },
    gym1: { mode: 'days', days: [1], perWeek: 1 },
    gym2: { mode: 'days', days: [3], perWeek: 1 },
    gym3: { mode: 'days', days: [5], perWeek: 1 }
  };
}

function scheduleFields(key, data) {
  const duration = ['italian', 'english', 'japanese'].includes(key) ? `<div class="field"><label>Durata sessione (min)</label><input class="input" type="number" name="duration_${key}" min="5" value="${data.duration || 30}" required></div>` : '';
  return `<div class="schedule-block" data-schedule="${key}">
  <div class="schedule-head"><strong>${TASKS[key].icon} ${TASKS[key].title}</strong><select class="select mode-select" name="mode_${key}"><option value="days" ${data.mode === 'days' ? 'selected' : ''}>Giorni fissi</option><option value="count" ${data.mode === 'count' ? 'selected' : ''}>Volte/settimana</option></select></div>
  <div class="days-mode ${data.mode === 'count' ? 'hidden' : ''}"><div class="day-checks">${DAYS.map((d, i) => `<span class="day-chip"><input id="${key}_${i}" type="checkbox" name="days_${key}" value="${i}" ${data.days.includes(i) ? 'checked' : ''}><label for="${key}_${i}">${d}</label></span>`).join('')}</div></div>
  <div class="count-mode ${data.mode === 'days' ? 'hidden' : ''}"><div class="mode-row"><input class="input" type="number" name="perWeek_${key}" min="0" max="7" value="${data.perWeek}" required><span class="helper">sessioni distribuite automaticamente nella settimana</span></div></div>
  ${duration}
  </div>`;
}

function renderSetup() {
  const schedules = defaultSchedules();
  return `<main class="setup-shell">
  <div class="setup-intro"><div class="eyebrow">Awakening setup</div><h1>Solo Leveling</h1></div>
  <div class="lock-banner">🔒 Dopo lo Start i valori iniziali non saranno modificabili. Potrai azzerare tutto solo dal comando Restart protetto da password.</div>
  <form id="setupForm">
      <div class="card emphasis"><fieldset class="fieldset"><legend>Statistiche iniziali</legend><div class="form-grid">
    <div class="field"><label>Italiano / 99</label><input class="input" type="number" name="italian" min="0" max="99" value="20" required></div>
    <div class="field"><label>Inglese / 99</label><input class="input" type="number" name="english" min="0" max="99" value="60" required></div>
    <div class="field"><label>Giapponese / 99</label><input class="input" type="number" name="japanese" min="0" max="99" value="0" required></div>
    <div class="field"><label>Endurance / 99</label><input class="input" type="number" name="endurance" min="0" max="99" value="20" required></div>
    <div class="field"><label>Strength / 99</label><input class="input" type="number" name="strength" min="0" max="99" value="20" required></div>
    <div class="field"><label>Consistency</label><input class="input" value="60 (automatico)" disabled></div>
    <div class="field"><label>Altezza (cm)</label><input class="input" type="number" name="height" min="100" max="240" step="0.1" required></div>
    <div class="field"><label>Peso iniziale (kg)</label><input class="input" type="number" name="weight" min="25" max="300" step="0.1" required></div>
      </div><p class="helper">Knowledge = 25% Italiano + 50% Inglese + 25% Giapponese. Body Shape è calcolata automaticamente sul peso forma (BMI target 22).</p></fieldset></div>
      <div class="card"><fieldset class="fieldset"><legend>Tempo di level-up</legend><div class="field"><label>Orizzonte dell'obiettivo</label><select class="select" name="levelMonths"><option value="6">6 mesi</option><option value="12" selected>1 anno</option><option value="18">1 anno e mezzo</option><option value="24">2 anni</option></select></div></fieldset></div>
      <div class="card"><fieldset class="fieldset"><legend>Programmazione task</legend>${Object.keys(TASKS).map(k => scheduleFields(k, schedules[k])).join('')}</fieldset></div>
      <button class="btn" style="width:100%" type="submit">START — Avvia percorso</button>
  </form>
  </main>`;
}

function bindSetup() {
  document.querySelectorAll('.mode-select').forEach(select => select.addEventListener('change', e => {
    const block = e.target.closest('.schedule-block');
    block.querySelector('.days-mode').classList.toggle('hidden', e.target.value !== 'days');
    block.querySelector('.count-mode').classList.toggle('hidden', e.target.value !== 'count');
  }));
  document.getElementById('setupForm').addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const schedules = {};
    Object.keys(TASKS).forEach(key => {
      const mode = fd.get(`mode_${key}`);
      const days = fd.getAll(`days_${key}`).map(Number);
      const perWeek = clamp(fd.get(`perWeek_${key}`), 0, 7);
      schedules[key] = { mode, days, perWeek, duration: ['italian', 'english', 'japanese'].includes(key) ? Number(fd.get(`duration_${key}`)) : undefined };
    });
    try {
      const height = Number(fd.get('height'));
      const weight = Number(fd.get('weight'));
      state = defaultState();
      state.started = true;
      state.startDate = todayISO();
      state.settings = { initial: { italian: Number(fd.get('italian')), english: Number(fd.get('english')), japanese: Number(fd.get('japanese')), endurance: Number(fd.get('endurance')), strength: Number(fd.get('strength')), weight, height }, levelMonths: Number(fd.get('levelMonths')), schedules };
      state.currentHeight = height;
      state.weights.push({ date: todayISO(), weight });
      saveState();
      ui.section = 'home';
      ui.selectedDate = todayISO();
      ui.calendarMonth = monthISO(todayISO());
      render();
      notify('Percorso iniziato. Benvenuto, Player.');
    }
    catch (err) {
      alert(err.message);
    }
  });
}

// ============================================================
// HOME E CALENDARIO
// ============================================================

function renderHome() {
  const stats = computeStats();
  const tasks = scheduledTasks(ui.selectedDate);
  const complete = completedCount(tasks, ui.selectedDate);
  return `${appHeader('Dashboard', 'System online')}
  <div class="hero"><div class="overall-label">Overall progression</div><div class="overall-row"><div class="overall-number">${round1(stats.overall)}</div><div class="overall-max">/ 99</div></div>
      <div class="hero-grid"><div class="hero-mini"><span>Oggi</span><strong>${completedCount(scheduledTasks(todayISO()), todayISO())}/${scheduledTasks(todayISO()).length}</strong></div><div class="hero-mini"><span>Consistency</span><strong>${round1(stats.consistency)}</strong></div><div class="hero-mini"><span>Streak</span><strong>${currentStreak()}d</strong></div></div>
  </div>
  <div class="date-strip"><button class="date-control" data-day-shift="-1">‹</button><button class="date-button" id="todayJump">${formatDate(ui.selectedDate)}</button><button class="date-control" data-day-shift="1">›</button></div>
  <div class="card emphasis"><div class="card-header"><div><h2>Task giornalieri</h2><p>${complete} completati su ${tasks.length}</p></div><span class="badge ${complete === tasks.length && tasks.length ? 'done' : ''}">${tasks.length ? Math.round(complete / tasks.length * 100) : 0}%</span></div>${tasks.length ? tasks.map(t => taskRow(t, ui.selectedDate)).join('') : '<div class="empty">Nessun task programmato per questa giornata.</div>'}</div>
  <div class="card"><div class="card-header"><h2>Calendario</h2><button class="btn small secondary" data-month-reset>Oggi</button></div>${monthCalendar(ui.calendarMonth)}</div>`;
}

function currentStreak() {
  if (!state.startDate)
    return 0;
  let streak = 0;
  for (let d = todayISO(); d >= state.startDate; d = addDays(d, -1)) {
    const t = scheduledTasks(d);
    if (!t.length)
      continue;
    if (completedCount(t, d) === t.length)
      streak++;
    else
      break;
  }
  return streak;
}

function taskRow(task, date) {
  const def = TASKS[task], rec = getRecord(date, task);
  const schedule = state.settings.schedules[task];
  const meta = schedule.duration ? `${schedule.duration} min · ${def.stat}` : def.stat;
  return `<label class="task-row ${rec.done ? 'task-complete' : ''}"><input class="check task-check" type="checkbox" data-task="${task}" data-date="${date}" ${rec.done ? 'checked' : ''}><span class="task-icon">${def.icon}</span><span class="task-main"><span class="task-title">${def.title}</span><span class="task-meta">${meta}${rec.details ? ` · ${esc(rec.details)}` : ''}</span></span></label>`;
}

function monthCalendar(month) {
  const first = dateObj(`${month}-01`);
  const year = first.getFullYear(), m = first.getMonth();
  const total = new Date(year, m + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7;
  const labels = ['L', 'M', 'M', 'G', 'V', 'S', 'D'].map(d => `<div class="weekday">${d}</div>`).join('');
  let cells = Array(offset).fill('<span></span>').join('');
  for (let i = 1; i <= total; i++) {
    const iso = localISO(new Date(year, m, i));
    cells += `<button class="day ${iso === ui.selectedDate ? 'selected' : ''} ${iso === todayISO() ? 'today' : ''} ${medalForDate(iso)}" data-select-date="${iso}">${i}</button>`;
  }
  return `<div class="card-header"><button class="date-control" data-month-shift="-1">‹</button><strong>${formatMonth(month)}</strong><button class="date-control" data-month-shift="1">›</button></div><div class="month-grid">${labels}${cells}</div>`;
}

function bindCommon() {
  document.querySelectorAll('[data-nav]').forEach(btn => btn.addEventListener('click', () => { ui.section = btn.dataset.nav; render(); }));
}

function bindHome() {
  bindTaskChecks();
  document.querySelectorAll('[data-day-shift]').forEach(b => b.onclick = () => { ui.selectedDate = addDays(ui.selectedDate, Number(b.dataset.dayShift)); ui.calendarMonth = monthISO(ui.selectedDate); render(); });
  document.getElementById('todayJump').onclick = () => { ui.selectedDate = todayISO(); ui.calendarMonth = monthISO(todayISO()); render(); };
  document.querySelectorAll('[data-select-date]').forEach(b => b.onclick = () => { ui.selectedDate = b.dataset.selectDate; render(); });
  document.querySelectorAll('[data-month-shift]').forEach(b => b.onclick = () => { const d = dateObj(`${ui.calendarMonth}-01`); d.setMonth(d.getMonth() + Number(b.dataset.monthShift)); ui.calendarMonth = monthISO(localISO(d)); render(); });
  document.querySelector('[data-month-reset]').onclick = () => { ui.selectedDate = todayISO(); ui.calendarMonth = monthISO(todayISO()); render(); };
}

function bindTaskChecks(root = document) {
  root.querySelectorAll('.task-check').forEach(box => box.addEventListener('change', e => toggleTask(e.target.dataset.task, e.target.dataset.date, e.target.checked)));
}

function toggleTask(task, date, checked) {
  if (date > todayISO()) {
    notify('Non puoi completare un task futuro.');
    render();
    return;
  }
  if (checked && task === 'run') {
    openRunModal(date, task);
    return;
  }
  if (checked && task === 'tennis') {
    openTennisModal(date, task);
    return;
  }
  if (!checked && task === 'run')
    state.runLogs = state.runLogs.filter(l => l.date !== date);
  if (!checked && task === 'tennis')
    state.tennisLogs = state.tennisLogs.filter(l => l.date !== date);
  state.records[recordKey(date, task)] = { ...getRecord(date, task), done: checked, details: checked ? getRecord(date, task).details : '' };
  saveState();
  render();
  notify(checked ? 'Task completato.' : 'Task riaperto.');
}

// ============================================================
// LETTERATURA E LINGUE
// ============================================================

function renderLanguages() {
  const key = ui.langTab;
  const labels = { italian: 'Italiano', english: 'Inglese', japanese: 'Giapponese' };
  const stats = computeStats();
  return `${appHeader('Letteratura & lingue', 'Knowledge path')}<div class="subtabs">${Object.keys(labels).map(k => `<button class="pill ${key === k ? 'active' : ''}" data-lang-tab="${k}">${labels[k]}</button>`).join('')}</div>${languagePanel(key, stats)}`;
}

function languagePanel(key, stats) {
  const value = stats[key], tasks = upcomingGroupTasks(key);
  const schedule = state.settings.schedules[key];
  let extras = '';
  if (key === 'italian' || key === 'english') {
    const books = state.books[key];
    extras = `<div class="card"><div class="card-header"><h2>Lista letture</h2><span class="badge">+1 al completamento</span></div>${books.length ? books.map((b, i) => `<div class="list-item ${b.done ? 'done' : ''}"><div class="item-copy"><strong>${esc(b.title)}</strong><span>${esc(b.author)}</span></div><button class="btn small ${b.done ? 'secondary' : ''}" data-book-toggle="${key}|${i}">${b.done ? 'Riapri' : 'Completato'}</button></div>`).join('') : '<div class="empty">Aggiungi il primo libro da leggere.</div>'}<form class="inline-form add-book" data-language="${key}"><input class="input" name="title" placeholder="Titolo" required><input class="input" name="author" placeholder="Autore" required><button class="btn small">+</button></form></div>`;
    if (key === 'english')
      extras += `<div class="card"><div class="card-header"><h2>Obiettivo C1</h2><button class="btn small ${state.bonuses.englishC1 ? 'secondary' : ''}" data-bonus="englishC1">${state.bonuses.englishC1 ? 'Bonus attivo ✓' : 'Conferma esame superato +9'}</button></div><p>Sessioni suggerite: lettura di un libro, studio vocaboli, studio grammatica.</p></div>`;
  }
  else {
    extras = `<div class="card"><div class="card-header"><h2>Setpoint apprendimento</h2><span class="badge">Milestones</span></div>${state.milestones.length ? state.milestones.map((m, i) => `<div class="list-item ${m.done ? 'done' : ''}"><div class="item-copy"><strong>${esc(m.name)}</strong></div><button class="btn small ${m.done ? 'secondary' : ''}" data-milestone-toggle="${i}">${m.done ? 'Riapri' : 'Completato'}</button></div>`).join('') : '<div class="empty">Esempi: hiragana, katakana, 10 kanji, 100 kanji…</div>'}<form id="addMilestone" class="inline-form"><input class="input" name="name" placeholder="Nuovo setpoint" required><button class="btn small">+</button></form></div><div class="card"><div class="card-header"><h2>Obiettivo esame base</h2><button class="btn small ${state.bonuses.japaneseExam ? 'secondary' : ''}" data-bonus="japaneseExam">${state.bonuses.japaneseExam ? 'Bonus attivo ✓' : 'Conferma esame superato +9'}</button></div><p>Sessioni suggerite: Duolingo, studio vocaboli, studio grammatica.</p></div>`;
  }
  return `<div class="card emphasis"><div class="card-header"><div><h2>${TASKS[key].title}</h2><p>${schedule.duration} min · incremento task +${round1(sessionIncrement(key))}</p></div><strong>${round1(value)} / 99</strong></div><div class="progress"><span style="width:${value}%"></span></div><div style="margin-top:12px">${tasks}</div></div>${extras}`;
}

function upcomingGroupTasks(task) {
  const dates = Array.from({ length: 14 }, (_, i) => addDays(todayISO(), i - 6)).filter(d => isScheduled(task, d));
  return dates.map(d => taskRow(task, d)).join('') || '<div class="empty">Nessuna sessione nel periodo.</div>';
}

function bindLanguages() {
  document.querySelectorAll('[data-lang-tab]').forEach(b => b.onclick = () => { ui.langTab = b.dataset.langTab; render(); });
  bindTaskChecks();
  document.querySelectorAll('.add-book').forEach(form => form.onsubmit = e => { e.preventDefault(); const fd = new FormData(form); state.books[form.dataset.language].push({ title: fd.get('title'), author: fd.get('author'), done: false }); saveState(); render(); });
  document.querySelectorAll('[data-book-toggle]').forEach(b => b.onclick = () => { const [key, i] = b.dataset.bookToggle.split('|'); state.books[key][Number(i)].done = !state.books[key][Number(i)].done; saveState(); render(); });
  const ms = document.getElementById('addMilestone');
  if (ms)
    ms.onsubmit = e => { e.preventDefault(); const fd = new FormData(ms); state.milestones.push({ name: fd.get('name'), done: false }); saveState(); render(); };
  document.querySelectorAll('[data-milestone-toggle]').forEach(b => b.onclick = () => { const m = state.milestones[Number(b.dataset.milestoneToggle)]; m.done = !m.done; saveState(); render(); });
  document.querySelectorAll('[data-bonus]').forEach(b => b.onclick = () => { if (!state.bonuses[b.dataset.bonus] && !confirm('Attivare definitivamente questo bonus di +9?'))
    return; state.bonuses[b.dataset.bonus] = true; saveState(); render(); });
}

// ============================================================
// SPORT & FITNESS
// ============================================================

function renderFitness() {
  const tabs = { run: 'Corsa', tennis: 'Tennis', gym: 'Palestra', body: 'Forma fisica' };
  return `${appHeader('Sport & Fitness', 'Physical growth')}<div class="subtabs">${Object.entries(tabs).map(([k, v]) => `<button class="pill ${ui.fitnessTab === k ? 'active' : ''}" data-fitness-tab="${k}">${v}</button>`).join('')}</div>${fitnessPanel(ui.fitnessTab)}`;
}

function fitnessPanel(tab) {
  const stats = computeStats();
  if (tab === 'run')
    return `<div class="card emphasis"><div class="card-header"><div><h2>Endurance</h2><p>Obiettivo: 21,1 km a 5:00 min/km</p></div><strong>${round1(stats.endurance)} / 99</strong></div><div class="progress"><span style="width:${stats.endurance}%"></span></div>${upcomingGroupTasks('run')}</div>${runCharts()}`;
  if (tab === 'tennis')
    return `<div class="card emphasis"><div class="card-header"><div><h2>Allenamenti tennis</h2><p>Contributo massimo Strength: +5</p></div><span class="badge">+${round1(stats.tennisIncrement)} / sessione</span></div>${upcomingGroupTasks('tennis')}</div><div class="card"><h2>Partite registrate</h2>${state.tennisLogs.length ? state.tennisLogs.slice().reverse().map(l => `<div class="list-item"><div class="item-copy"><strong>${esc(l.result)}</strong><span>${formatDate(l.date)} · ${esc(l.surface)}</span></div></div>`).join('') : '<div class="empty">Nessun allenamento completato.</div>'}</div>`;
  if (tab === 'gym')
    return renderGym(stats);
  return renderBody(stats);
}

function runCharts() {
  return `<div class="card"><div class="card-header"><h2>Resoconto corse</h2><div class="chart-controls">${['week', 'month', 'year'].map(p => `<button class="pill ${ui.chartPeriod === p ? 'active' : ''}" data-chart-period="${p}">${p === 'week' ? '7g' : p === 'month' ? '30g' : 'Anno'}</button>`).join('')}</div></div><div class="chart-card"><p class="helper">Km percorsi</p><canvas id="kmChart" class="chart-canvas"></canvas></div><div class="chart-card"><p class="helper">BPM medi</p><canvas id="bpmChart" class="chart-canvas"></canvas><div class="legend-row"><span><i class="dot zone1"></i>Z1</span><span><i class="dot zone2"></i>Z2</span><span><i class="dot zone3"></i>Z3</span><span><i class="dot zone4"></i>Z4</span><span><i class="dot zone5"></i>Z5</span></div></div><div class="chart-card"><p class="helper">Passo min/km</p><canvas id="paceChart" class="chart-canvas"></canvas></div></div>`;
}

function renderGym(stats) {
  const keys = ['gym1', 'gym2', 'gym3'];

  return `
    <div class="card emphasis">
      <div class="card-header">
        <div>
          <h2>Strength</h2>
          <p>Ogni allenamento saltato sottrae lo stesso incremento</p>
        </div>

        <strong>${round1(stats.strength)} / 99</strong>
      </div>

      <div class="progress">
        <span style="width:${stats.strength}%"></span>
      </div>

      <p class="helper">
        Incremento palestra: +${round1(stats.gymIncrement)} per allenamento
        · tennis: +${round1(stats.tennisIncrement)}
      </p>
    </div>

    <!-- SCHEDE PALESTRA -->
    <div class="card gym-library">
      <button
        class="gym-library-header"
        type="button"
        data-toggle-gym-sheets
      >
        <div class="gym-library-title">
          <div class="gym-library-icon">
            ${gymSheetIcon()}
          </div>

          <div>
            <h2>Schede palestra</h2>
            <p>Gestisci esercizi e allenamenti guidati</p>
          </div>
        </div>

        <span class="gym-chevron ${ui.gymSheetsOpen ? 'open' : ''}">
          ›
        </span>
      </button>

      ${
        ui.gymSheetsOpen
          ? `
            <div class="gym-library-content">

              <div class="gym-sheet-tabs">
                ${keys.map((key, index) => `
                  <button
                    type="button"
                    class="gym-sheet-tab ${ui.gymSheet === key ? 'active' : ''}"
                    data-gym-sheet="${key}"
                  >
                    Scheda ${index + 1}
                  </button>
                `).join('')}
              </div>

              ${renderGymSheetPreview(ui.gymSheet)}

            </div>
          `
          : ''
      }
    </div>

    <!-- TASK PALESTRA -->
    <div class="gym-task-section">
      <div class="gym-section-heading">
        <div>
          <div class="eyebrow">Programmazione</div>
          <h2>Task palestra</h2>
        </div>
      </div>

      ${keys.map((key, index) => `
        <div class="card gym-task-card">
          <div class="card-header">
            <div>
              <h2>Palestra — Tipo ${index + 1}</h2>
              <p>Sessioni programmate</p>
            </div>

            <span class="badge">
              ${state.gymTemplates[key].length} esercizi
            </span>
          </div>

          ${upcomingGroupTasks(key)}
        </div>
      `).join('')}
    </div>
  `;
}

function renderGymSheetPreview(key) {
  const exercises = state.gymTemplates[key];
  const number = key.replace('gym', '');

  return `
    <div class="gym-sheet-detail">

      <div class="gym-sheet-detail-header">
        <div>
          <span class="gym-sheet-number">SCHEDA ${number}</span>
          <h3>
            ${
              exercises.length
                ? `${exercises.length} esercizi configurati`
                : 'Scheda ancora vuota'
            }
          </h3>
        </div>
      </div>

      ${
        exercises.length
          ? `
            <div class="gym-exercise-list">
              ${exercises.map((exercise, index) => `
                <div class="gym-exercise-preview">

                  <div class="gym-exercise-index">
                    ${index + 1}
                  </div>

                  <div class="gym-exercise-copy">
                    <strong>${esc(exercise.name)}</strong>

                    <span>
                      ${exercise.sets} serie
                      ·
                      ${
                        exercise.mode === 'duration'
                          ? `${exercise.value} sec`
                          : `${exercise.value} reps`
                      }
                      ${
                        exercise.weight
                          ? ` · ${exercise.weight} kg`
                          : ''
                      }
                    </span>
                  </div>

                  <div class="gym-exercise-rest">
                    ${exercise.rest}s
                  </div>

                </div>
              `).join('')}
            </div>
          `
          : `
            <div class="gym-empty-sheet">
              <div class="gym-empty-icon">
                ${gymSheetIcon()}
              </div>

              <p>
                Nessun esercizio configurato.
              </p>

              <span>
                Crea la tua scheda aggiungendo esercizi, serie,
                ripetizioni, pesi e recuperi.
              </span>
            </div>
          `
      }

      <div class="gym-sheet-actions">

        <button
          class="btn secondary grow"
          type="button"
          data-edit-gym="${key}"
        >
          Modifica scheda
        </button>

        <button
          class="btn grow"
          type="button"
          data-start-workout="${key}"
        >
          Avvia allenamento
        </button>

      </div>

    </div>
  `;
}


function gymSheetIcon() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 4.5h8" />
      <path d="M9 3h6v3H9z" />
      <rect x="5" y="5.5" width="14" height="15" rx="3" />
      <path d="M8 10h8" />
      <path d="M8 14h5" />
      <path d="M8 17h7" />
    </svg>
  `;
}

function renderBody(stats) {
  const s = state.settings.initial;
  const height = state.currentHeight || s.height;
  const current = stats.latestWeight;
  const ideal = targetWeight(height);
  const diff = current - ideal;
  const latest = state.weights[state.weights.length - 1];
  const weeks = Math.abs(diff) > .05 ? Math.ceil(Math.abs(diff) / .3) : 0;
  const targetDate = weeks ? addDays(latest.date, weeks * 7) : null;
  return `<div class="card emphasis"><div class="card-header"><div><h2>Body Shape</h2><p>Calcolo su BMI target ${BMI_TARGET}</p></div><strong>${round1(stats.bodyShape)} / 99</strong></div><div class="progress"><span style="width:${stats.bodyShape / 99 * 100}%"></span></div><div class="metric-grid" style="margin-top:15px"><div class="metric"><span>Peso attuale</span><strong>${round1(current)} kg</strong></div><div class="metric"><span>Peso forma</span><strong>${round1(ideal)} kg</strong></div><div class="metric"><span>BMI attuale</span><strong>${round1(bmi(current, height))}</strong></div><div class="metric"><span>BMI forma</span><strong>${BMI_TARGET}</strong></div></div></div><div class="card"><h2>Aggiorna peso</h2><form id="weightForm"><div class="form-grid"><div class="field"><label>Peso attuale (kg)</label><input class="input" type="number" min="25" max="300" step="0.1" name="weight" value="${round1(current)}" required></div><div class="field"><label>Altezza attuale (cm)</label><input class="input" type="number" min="100" max="240" step="0.1" name="height" value="${height}" required></div></div><button class="btn small">Salva rilevazione</button></form>${targetDate ? `<p>Con una variazione costante di <strong>0,3 kg/settimana</strong>, raggiungeresti il peso forma circa il <strong>${formatDate(targetDate)}</strong>.</p>` : '<p>Sei sul peso forma target.</p>'}</div><div class="card"><h2>Andamento peso</h2><canvas id="weightChart" class="chart-canvas"></canvas></div>`;
}

function bindFitness() {
  document
    .querySelectorAll('[data-fitness-tab]')
    .forEach(button => {
      button.onclick = () => {
        ui.fitnessTab = button.dataset.fitnessTab;
        render();
      };
    });

  bindTaskChecks();

  document
    .querySelectorAll('[data-chart-period]')
    .forEach(button => {
      button.onclick = () => {
        ui.chartPeriod = button.dataset.chartPeriod;
        render();
      };
    });

  /* Apri / chiudi sezione Schede palestra */
  const gymToggle = document.querySelector('[data-toggle-gym-sheets]');

  if (gymToggle) {
    gymToggle.onclick = () => {
      ui.gymSheetsOpen = !ui.gymSheetsOpen;
      render();
    };
  }

  /* Selezione Scheda 1 / 2 / 3 */
  document
    .querySelectorAll('[data-gym-sheet]')
    .forEach(button => {
      button.onclick = () => {
        ui.gymSheet = button.dataset.gymSheet;
        render();
      };
    });

  /* Editor scheda */
  document
    .querySelectorAll('[data-edit-gym]')
    .forEach(button => {
      button.onclick = () => {
        openGymEditor(button.dataset.editGym);
      };
    });

  /* Workout guidato */
  document
    .querySelectorAll('[data-start-workout]')
    .forEach(button => {
      button.onclick = () => {
        startWorkout(button.dataset.startWorkout);
      };
    });

  const weightForm = document.getElementById('weightForm');

  if (weightForm) {
    weightForm.onsubmit = event => {
      event.preventDefault();

      const fd = new FormData(weightForm);
      const weight = Number(fd.get('weight'));

      state.currentHeight = Number(fd.get('height'));

      state.weights.push({
        date: todayISO(),
        weight
      });

      state.weights.sort((a, b) =>
        a.date.localeCompare(b.date)
      );

      saveState();
      render();
      notify('Peso aggiornato.');
    };
  }

  if (ui.fitnessTab === 'run') {
    drawRunCharts();
  }

  if (ui.fitnessTab === 'body') {
    drawWeightChart();
  }
}

// ============================================================
// REGISTRAZIONE CORSA, TENNIS E PALESTRA
// ============================================================

function openRunModal(date, task) {
  openModal(`<h2>Registra corsa</h2><p>${formatDate(date)}</p><form id="runForm"><div class="form-grid"><div class="field"><label>Km percorsi</label><input class="input" name="km" type="number" min="0.1" step="0.01" required></div><div class="field"><label>BPM medi</label><input class="input" name="bpm" type="number" min="40" max="230" required></div><div class="field"><label>Passo medio (min/km, es. 5.30)</label><input class="input" name="pace" type="number" min="2" max="20" step="0.01" required></div><div class="field"><label>Zona cardio</label><select class="select" name="zone"><option value="1">Zona 1</option><option value="2">Zona 2</option><option value="3" selected>Zona 3</option><option value="4">Zona 4</option><option value="5">Zona 5</option></select></div></div><button class="btn" style="width:100%">Completa sessione</button></form>`);
  document.getElementById('runForm').onsubmit = e => { e.preventDefault(); const fd = new FormData(e.target); const log = { date, km: Number(fd.get('km')), bpm: Number(fd.get('bpm')), pace: Number(fd.get('pace')), zone: Number(fd.get('zone')) }; state.runLogs = state.runLogs.filter(l => l.date !== date); state.runLogs.push(log); state.runLogs.sort((a, b) => a.date.localeCompare(b.date)); state.records[recordKey(date, task)] = { done: true, details: `${log.km} km · ${log.pace} min/km` }; saveState(); closeModal(); render(); notify('Corsa registrata.'); };
}

function openTennisModal(date, task) {
  openModal(`<h2>Registra tennis</h2><form id="tennisForm"><div class="field"><label>Tipo di campo</label><select class="select" name="surface"><option>Terra rossa</option><option>Cemento</option><option>Sintetico</option></select></div><div class="field"><label>Risultato / note</label><input class="input" name="result" placeholder="es. Vittoria 6-4, 6-3" required></div><button class="btn" style="width:100%">Completa allenamento</button></form>`);
  document.getElementById('tennisForm').onsubmit = e => { e.preventDefault(); const fd = new FormData(e.target); const log = { date, surface: fd.get('surface'), result: fd.get('result') }; state.tennisLogs = state.tennisLogs.filter(l => l.date !== date); state.tennisLogs.push(log); state.records[recordKey(date, task)] = { done: true, details: log.surface }; saveState(); closeModal(); render(); notify('Tennis registrato.'); };
}

function openGymEditor(key) {
  const sheetNumber = key.replace('gym', '');

  const rows = state.gymTemplates[key]
    .map((exercise, index) =>
      exerciseEditorRow(exercise, index)
    )
    .join('');

  openModal(`
    <div class="gym-editor">

      <div class="gym-editor-header">
        <div class="gym-editor-header-icon">
          ${gymSheetIcon()}
        </div>

        <div>
          <div class="eyebrow">Workout editor</div>
          <h2>Scheda ${sheetNumber}</h2>
          <p>
            Configura esercizi, serie, ripetizioni, pesi e tempi di recupero.
          </p>
        </div>
      </div>

      <div id="exerciseRows" class="gym-editor-list">
        ${
          rows ||
          `
            <div class="gym-editor-empty">
              <div class="gym-empty-icon">
                ${gymSheetIcon()}
              </div>

              <strong>Nessun esercizio</strong>

              <p>
                Aggiungi il primo esercizio per iniziare a costruire la scheda.
              </p>
            </div>
          `
        }
      </div>

      <button
        class="gym-add-exercise"
        id="addExercise"
        type="button"
      >
        <span class="gym-add-plus">+</span>

        <span>
          <strong>Aggiungi esercizio</strong>
          <small>Inserisci un nuovo blocco nella scheda</small>
        </span>
      </button>

      <button
        class="btn gym-save-sheet"
        id="saveGym"
        type="button"
      >
        Salva scheda
      </button>

    </div>
  `);

  bindExerciseEditor();

  document.getElementById('addExercise').onclick = () => {
    const container = document.getElementById('exerciseRows');

    /* Se c'è il messaggio "nessun esercizio", lo togliamo */
    const empty = container.querySelector('.gym-editor-empty');

    if (empty) {
      empty.remove();
    }

    const index = container.querySelectorAll('.exercise-row').length;

    container.insertAdjacentHTML(
      'beforeend',
      exerciseEditorRow(
        {
          name: '',
          sets: 3,
          mode: 'reps',
          value: 10,
          weight: 0,
          rest: 60
        },
        index
      )
    );

    bindExerciseEditor();

    /*
      Scroll morbido verso il nuovo esercizio.
    */
    const cards = container.querySelectorAll('.exercise-row');
    const lastCard = cards[cards.length - 1];

    if (lastCard) {
      lastCard.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  };

  document.getElementById('saveGym').onclick = () => {
    const exercises = [
      ...document.querySelectorAll('.exercise-row')
    ]
      .map(row => ({
        name: row
          .querySelector('[name=name]')
          .value
          .trim(),

        sets: Number(
          row.querySelector('[name=sets]').value
        ),

        mode: row
          .querySelector('[name=mode]')
          .value,

        value: Number(
          row.querySelector('[name=value]').value
        ),

        weight: Number(
          row.querySelector('[name=weight]').value || 0
        ),

        rest: Number(
          row.querySelector('[name=rest]').value
        )
      }))
      .filter(exercise => exercise.name);

    state.gymTemplates[key] = exercises;

    saveState();
    closeModal();
    render();

    notify('Scheda salvata.');
  };
}

function exerciseEditorRow(ex, i) {
  const exerciseNumber = Number(i) + 1;

  return `
    <div class="gym-exercise-editor exercise-row">

      <div class="gym-exercise-editor-header">

        <div class="gym-exercise-editor-title">
          <div class="gym-exercise-number">
            ${exerciseNumber}
          </div>

          <div>
            <span>ESERCIZIO</span>
            <strong>
              ${ex.name ? esc(ex.name) : `Nuovo esercizio`}
            </strong>
          </div>
        </div>

        <button
          class="gym-remove-exercise"
          type="button"
          data-remove-exercise
          aria-label="Elimina esercizio"
        >
          ×
        </button>

      </div>


      <div class="gym-main-field">
        <label>Nome esercizio</label>

        <input
          class="input gym-name-input"
          name="name"
          value="${esc(ex.name)}"
          placeholder="Es. Chest press"
        >
      </div>


      <div class="gym-editor-grid">

        <div class="gym-editor-field">
          <label>Serie</label>

          <input
            class="input"
            name="sets"
            type="number"
            min="1"
            value="${ex.sets || 3}"
          >
        </div>


        <div class="gym-editor-field">
          <label>Modalità</label>

          <select
            class="select exercise-mode"
            name="mode"
          >
            <option
              value="reps"
              ${ex.mode === 'reps' ? 'selected' : ''}
            >
              Ripetizioni
            </option>

            <option
              value="duration"
              ${ex.mode === 'duration' ? 'selected' : ''}
            >
              Durata
            </option>
          </select>
        </div>


        <div class="gym-editor-field">
          <label class="value-label">
            ${
              ex.mode === 'duration'
                ? 'Durata (sec)'
                : 'Ripetizioni'
            }
          </label>

          <input
            class="input"
            name="value"
            type="number"
            min="1"
            value="${ex.value || 10}"
          >
        </div>


        <div class="gym-editor-field">
          <label>Peso</label>

          <div class="gym-input-unit">
            <input
              class="input"
              name="weight"
              type="number"
              min="0"
              step="0.5"
              value="${ex.weight || 0}"
            >

            <span>kg</span>
          </div>
        </div>

      </div>


      <div class="gym-rest-field">
        <div>
          <label>Recupero</label>
          <span>Tempo tra una serie e la successiva</span>
        </div>

        <div class="gym-input-unit gym-rest-input">
          <input
            class="input"
            name="rest"
            type="number"
            min="0"
            value="${ex.rest || 60}"
          >

          <span>sec</span>
        </div>
      </div>

    </div>
  `;
}

function bindExerciseEditor() {

  /*
    Cambio modalità:
    Ripetizioni ↔ Durata
  */
  document
    .querySelectorAll('.exercise-mode')
    .forEach(select => {

      select.onchange = () => {
        const row = select.closest('.exercise-row');

        const label =
          row.querySelector('.value-label');

        label.textContent =
          select.value === 'duration'
            ? 'Durata (sec)'
            : 'Ripetizioni';
      };
    });


  /*
    Aggiorna in tempo reale il titolo
    della card mentre si scrive il nome.
  */
  document
    .querySelectorAll('.gym-name-input')
    .forEach(input => {

      input.oninput = () => {
        const row = input.closest('.exercise-row');

        const title =
          row.querySelector(
            '.gym-exercise-editor-title strong'
          );

        title.textContent =
          input.value.trim() || 'Nuovo esercizio';
      };
    });


  /*
    Eliminazione esercizio
  */
  document
    .querySelectorAll('[data-remove-exercise]')
    .forEach(button => {

      button.onclick = () => {
        const row = button.closest('.exercise-row');

        row.remove();

        renumberGymExercises();
      };
    });
}


function renumberGymExercises() {
  document
    .querySelectorAll('.exercise-row')
    .forEach((row, index) => {

      const number =
        row.querySelector('.gym-exercise-number');

      if (number) {
        number.textContent = index + 1;
      }
    });
}

function startWorkout(key) {
  const ex = state.gymTemplates[key];
  if (!ex.length) {
    openGymEditor(key);
    notify('Prima configura gli esercizi.');
    return;
  }
  workoutRuntime = { key, expanded: ex.flatMap(item => Array.from({ length: item.sets }, (_, i) => ({ ...item, set: i + 1 }))), index: 0, phase: 'exercise', interval: null };
  openModal(`<div id="workoutStage" class="workout-stage"></div>`);
  renderWorkoutStage();
}

function renderWorkoutStage() {
  const w = workoutRuntime;
  const stage = document.getElementById('workoutStage');
  if (!w || !stage)
    return;
  if (w.index >= w.expanded.length) {
    stage.innerHTML = `<div class="exercise-title">Workout completato</div><p>Ottimo lavoro. Registra l'allenamento per aggiornare Strength.</p><button class="btn" id="finishWorkout">Completa allenamento</button>`;
    document.getElementById('finishWorkout').onclick = () => { state.records[recordKey(todayISO(), w.key)] = { done: true, details: 'Workout guidato' }; saveState(); workoutRuntime = null; closeModal(); render(); notify('Strength aggiornato.'); };
    return;
  }
  const ex = w.expanded[w.index];
  if (w.phase === 'exercise') {
    if (ex.mode === 'duration') {
      countdownThenTimer(ex.value, `${ex.name} · Serie ${ex.set}/${ex.sets}`, () => { w.phase = 'rest'; renderWorkoutStage(); });
    }
    else {
      stage.innerHTML = `<div class="exercise-title">${esc(ex.name)}</div><div class="exercise-detail">Serie ${ex.set} / ${ex.sets} · ${ex.value} ripetizioni${ex.weight ? ` · ${ex.weight} kg` : ''}</div><button class="btn" id="completeSet">Completato</button>`;
      document.getElementById('completeSet').onclick = () => { w.phase = 'rest'; renderWorkoutStage(); };
    }
  }
  else {
    countdownTimer(ex.rest, 'Recupero', () => { w.index++; w.phase = 'exercise'; renderWorkoutStage(); });
  }
}

function countdownThenTimer(seconds, title, done) {
  const stage = document.getElementById('workoutStage');
  let pre = 3;
  stage.innerHTML = `<div class="exercise-title">${esc(title)}</div><div class="counter">${pre}</div><p>Preparati</p>`;
  const starter = setInterval(() => { pre--; if (pre > 0) {
    stage.querySelector('.counter').textContent = pre;
  }
  else {
    clearInterval(starter);
    countdownTimer(seconds, title, done);
  } }, 1000);
}

function countdownTimer(seconds, title, done) {
  const stage = document.getElementById('workoutStage');
  let remaining = seconds;
  stage.innerHTML = `<div class="exercise-title">${esc(title)}</div><div class="counter">${remaining}</div><p>secondi</p><button class="btn secondary small" id="skipTimer">Salta</button>`;
  const interval = setInterval(() => { remaining--; if (stage.querySelector('.counter'))
    stage.querySelector('.counter').textContent = Math.max(0, remaining); if (remaining <= 0) {
    clearInterval(interval);
    done();
  } }, 1000);
  document.getElementById('skipTimer').onclick = () => { clearInterval(interval); done(); };
}

function openModal(html) { document.getElementById('modal-root').innerHTML = `<div class="modal-backdrop"><div class="modal"><button class="modal-close" onclick="closeModal()">✕</button>${html}</div></div>`; }

function closeModal() { document.getElementById('modal-root').innerHTML = ''; workoutRuntime = null; }
window.closeModal = closeModal;

// ============================================================
// PAGINA STATISTICHE
// ============================================================

function renderStats() {
  const st = computeStats();
  const active = allActiveDates();
  let total = 0, done = 0;
  active.forEach(d => { const t = scheduledTasks(d); total += t.length; done += completedCount(t, d); });
  return `${appHeader('Statistiche', 'Player profile')}<div class="hero"><div class="overall-label">Overall</div><div class="overall-row"><div class="overall-number">${round1(st.overall)}</div><div class="overall-max">/ 99</div></div><div class="hero-grid"><div class="hero-mini"><span>Task totali</span><strong>${done}/${total}</strong></div><div class="hero-mini"><span>30 giorni</span><strong>${Math.round(st.rolling * 100)}%</strong></div><div class="hero-mini"><span>Totale</span><strong>${Math.round(st.lifetime * 100)}%</strong></div></div></div><div class="card"><h2>Skill chart</h2><div class="radar-wrap"><canvas id="radarChart" width="330" height="300"></canvas></div></div><div class="card"><h2>Dettaglio statistiche</h2>${statBar('Knowledge', st.knowledge)}<div class="substat">${statBar('Italiano', st.italian)}${statBar('Inglese', st.english)}${statBar('Giapponese', st.japanese)}</div>${statBar('Consistency', st.consistency)}${statBar('Endurance', st.endurance)}${statBar('Strength', st.strength)}${statBar('Body Shape', st.bodyShape)}</div><div class="card"><div class="card-header"><h2>Activity map</h2><div class="chart-controls">${['week', 'month', 'year'].map(p => `<button class="pill ${ui.statPeriod === p ? 'active' : ''}" data-stat-period="${p}">${p === 'week' ? '7g' : p === 'month' ? '30g' : 'Anno'}</button>`).join('')}</div></div>${heatMap(ui.statPeriod)}</div>`;
}

function statBar(label, value) { return `<div class="stat-row"><div class="stat-label"><span>${label}</span><strong>${round1(value)}</strong></div><div class="progress"><span style="width:${value}%"></span></div></div>`; }

function heatMap(period) { const dates = periodDates(period); return `<div class="heatmap">${dates.map(d => `<span class="heat-cell ${medalForDate(d)}" title="${d}"></span>`).join('')}</div><div class="heat-label"><span>Vuoto</span><span>Bronzo · Argento · Oro</span></div>`; }

function bindStats() { document.querySelectorAll('[data-stat-period]').forEach(b => b.onclick = () => { ui.statPeriod = b.dataset.statPeriod; render(); }); drawRadar(); }

// ============================================================
// IMPOSTAZIONI E RESET
// ============================================================

function renderSettings() {
  const s = state.settings;
  const stats = computeStats();
  return `${appHeader('Impostazioni', 'Configuration')}<div class="notice">I valori iniziali e la pianificazione sono bloccati dopo lo Start. Il Restart cancella progressi, task, grafici e liste.</div><div class="card"><h2>Profilo iniziale</h2><div class="kpi-split"><span>Knowledge iniziale</span><strong>${round1(s.initial.italian * .25 + s.initial.english * .5 + s.initial.japanese * .25)}</strong></div><div class="kpi-split"><span>Endurance iniziale</span><strong>${s.initial.endurance}</strong></div><div class="kpi-split"><span>Strength iniziale</span><strong>${s.initial.strength}</strong></div><div class="kpi-split"><span>Consistency iniziale</span><strong>60</strong></div><div class="kpi-split"><span>Peso forma target</span><strong>${round1(targetWeight(s.initial.height))} kg</strong></div><div class="kpi-split"><span>Orizzonte level-up</span><strong>${s.levelMonths} mesi</strong></div></div><div class="card"><h2>Programmazione attiva</h2>${Object.keys(TASKS).map(k => { const sc = s.schedules[k]; const freq = weekFrequency(sc); return `<div class="kpi-split"><span>${TASKS[k].title}</span><strong>${freq} / settimana${sc.duration ? ` · ${sc.duration} min` : ''}</strong></div>`; }).join('')}</div><div class="card"><div class="card-header"><div><h2>Restart</h2><p>Elimina tutti i dati locali dell'app.</p></div></div><button class="btn danger" id="restartBtn">Reset completo</button></div>`;
}

function bindSettings() { document.getElementById('restartBtn').onclick = () => { const pwd = prompt('Inserisci la password di sicurezza per resettare l’app:'); if (pwd !== RESET_PASSWORD) {
  notify('Password errata. Reset annullato.');
  return;
} if (!confirm('Confermi? Tutti i progressi saranno eliminati.'))
  return; localStorage.removeItem(STORAGE_KEY); state = defaultState(); ui.section = 'settings'; closeModal(); render(); notify('App resettata.'); }; }

// ============================================================
// GRAFICI CANVAS
// ============================================================

function canvasSetup(id) { const c = document.getElementById(id); if (!c)
  return null; const ratio = window.devicePixelRatio || 1; const rect = c.getBoundingClientRect(); c.width = rect.width * ratio; c.height = rect.height * ratio; const ctx = c.getContext('2d'); ctx.scale(ratio, ratio); return { ctx, w: rect.width, h: rect.height }; }

function drawLineChart(id, values, opts = {}) {
  const setup = canvasSetup(id);
  if (!setup)
    return;
  const { ctx, w, h } = setup;
  const pad = { l: 34, r: 9, t: 12, b: 22 };
  const clean = values.filter(v => v.value != null);
  const max = opts.max || Math.max(...clean.map(v => v.value), 1);
  const min = opts.min ?? Math.min(0, ...clean.map(v => v.value));
  ctx.strokeStyle = 'rgba(133,209,255,.14)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    let y = pad.t + (h - pad.t - pad.b) * i / 3;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(w - pad.r, y);
    ctx.stroke();
  }
  ctx.font = '10px -apple-system';
  ctx.fillStyle = '#8fa3bb';
  ctx.fillText(round1(max), 2, pad.t + 3);
  ctx.fillText(round1(min), 2, h - pad.b + 3);
  if (!clean.length) {
    ctx.fillText('Nessun dato registrato', pad.l + 20, h / 2);
    return;
  }
  const xAt = i => pad.l + (w - pad.l - pad.r) * (values.length === 1 ? .5 : i / (values.length - 1));
  const yAt = v => pad.t + (h - pad.t - pad.b) * (1 - (v - min) / Math.max(.001, max - min));
  ctx.strokeStyle = '#54cdff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  let begun = false;
  values.forEach((v, i) => { if (v.value == null)
    return; const x = xAt(i), y = yAt(v.value); begun ? ctx.lineTo(x, y) : ctx.moveTo(x, y); begun = true; });
  ctx.stroke();
  values.forEach((v, i) => { if (v.value == null)
    return; ctx.fillStyle = '#35f0ff'; ctx.beginPath(); ctx.arc(xAt(i), yAt(v.value), 2.5, 0, Math.PI * 2); ctx.fill(); });
  ctx.fillStyle = '#8fa3bb';
  ctx.fillText(values[0].label, pad.l, h - 4);
  ctx.fillText(values[values.length - 1].label, w - pad.r - 30, h - 4);
}

function chartDates(period) { return periodDates(period); }

function drawRunCharts() {
  const dates = chartDates(ui.chartPeriod);
  const byDate = Object.fromEntries(state.runLogs.map(l => [l.date, l]));
  const series = field => dates.map(d => ({ label: d.slice(5), value: byDate[d]?.[field] ?? null }));
  drawLineChart('kmChart', series('km'));
  drawBpmChart(dates, byDate);
  drawLineChart('paceChart', series('pace'), { min: 3, max: Math.max(10, ...state.runLogs.map(l => l.pace)) });
}

function drawBpmChart(dates, byDate) {
  const setup = canvasSetup('bpmChart');
  if (!setup)
    return;
  const { ctx, w, h } = setup;
  const pad = { l: 34, r: 9, t: 12, b: 22 };
  const min = 80, max = 200;
  const zones = ['rgba(104,197,255,.10)', 'rgba(60,229,162,.10)', 'rgba(255,211,106,.10)', 'rgba(255,152,95,.10)', 'rgba(255,104,132,.10)'];
  zones.forEach((color, i) => { ctx.fillStyle = color; const y = pad.t + (h - pad.t - pad.b) * (4 - i) / 5; ctx.fillRect(pad.l, y, w - pad.l - pad.r, (h - pad.t - pad.b) / 5); });
  ctx.strokeStyle = 'rgba(133,209,255,.14)';
  for (let i = 0; i < 4; i++) {
    let y = pad.t + (h - pad.t - pad.b) * i / 3;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(w - pad.r, y);
    ctx.stroke();
  }
  const values = dates.map(d => ({ label: d.slice(5), value: byDate[d]?.bpm ?? null, zone: byDate[d]?.zone || 3 }));
  const xAt = i => pad.l + (w - pad.l - pad.r) * (values.length === 1 ? .5 : i / (values.length - 1));
  const yAt = v => pad.t + (h - pad.t - pad.b) * (1 - (v - min) / (max - min));
  let begun = false;
  ctx.strokeStyle = '#54cdff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  values.forEach((v, i) => { if (v.value == null)
    return; begun ? ctx.lineTo(xAt(i), yAt(v.value)) : ctx.moveTo(xAt(i), yAt(v.value)); begun = true; });
  ctx.stroke();
  const colors = ['#68c5ff', '#3ce5a2', '#ffd36a', '#ff985f', '#ff6884'];
  values.forEach((v, i) => { if (v.value == null)
    return; ctx.fillStyle = colors[v.zone - 1]; ctx.beginPath(); ctx.arc(xAt(i), yAt(v.value), 3.2, 0, Math.PI * 2); ctx.fill(); });
  ctx.font = '10px -apple-system';
  ctx.fillStyle = '#8fa3bb';
  ctx.fillText('200', 2, pad.t + 3);
  ctx.fillText('80', 8, h - pad.b + 3);
  ctx.fillText(values[0].label, pad.l, h - 4);
  ctx.fillText(values[values.length - 1].label, w - pad.r - 30, h - 4);
  if (!values.some(v => v.value != null))
    ctx.fillText('Nessun dato registrato', pad.l + 20, h / 2);
}

function drawWeightChart() {
  const setup = canvasSetup('weightChart');
  if (!setup)
    return;
  const target = targetWeight(state.currentHeight || state.settings.initial.height);
  const vals = state.weights.map(w => ({ label: w.date.slice(5), value: w.weight }));
  drawLineChart('weightChart', vals, { min: Math.min(target, ...state.weights.map(w => w.weight)) - 2, max: Math.max(target, ...state.weights.map(w => w.weight)) + 2 });
  const fresh = canvasSetup('weightChart');
  if (!fresh)
    return; // redraw with target overlay after chart clears only when enough room
  drawLineChart('weightChart', vals, { min: Math.min(target, ...state.weights.map(w => w.weight)) - 2, max: Math.max(target, ...state.weights.map(w => w.weight)) + 2 });
  const c = document.getElementById('weightChart'), ctx = c.getContext('2d'), ratio = window.devicePixelRatio || 1;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  const rect = c.getBoundingClientRect(), min = Math.min(target, ...state.weights.map(w => w.weight)) - 2, max = Math.max(target, ...state.weights.map(w => w.weight)) + 2;
  const y = 12 + (rect.height - 34) * (1 - (target - min) / (max - min));
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = 'rgba(255,197,92,.75)';
  ctx.beginPath();
  ctx.moveTo(34, y);
  ctx.lineTo(rect.width - 9, y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#ffc55c';
  ctx.font = '10px -apple-system';
  ctx.fillText('peso forma', rect.width - 70, y - 5);
}

function drawRadar() {
  const c = document.getElementById('radarChart');
  if (!c)
    return;
  const ctx = c.getContext('2d'), st = computeStats();
  const vals = [st.knowledge, st.consistency, st.endurance, st.strength, st.bodyShape];
  const labels = ['Knowledge', 'Consistency', 'Endurance', 'Strength', 'Body Shape'];
  const cx = 165, cy = 142, r = 104;
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.strokeStyle = 'rgba(133,209,255,.17)';
  ctx.lineWidth = 1;
  for (let ring = 1; ring <= 4; ring++) {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * 2 * Math.PI / 5, rr = r * ring / 4, x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + i * 2 * Math.PI / 5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.stroke();
    const lx = cx + Math.cos(a) * (r + 22), ly = cy + Math.sin(a) * (r + 22);
    ctx.fillStyle = '#8fa3bb';
    ctx.font = '11px -apple-system';
    ctx.textAlign = 'center';
    ctx.fillText(labels[i], lx, ly);
  }
  ctx.beginPath();
  vals.forEach((v, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / 5, rr = r * v / 99, x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.closePath();
  ctx.fillStyle = 'rgba(53,240,255,.18)';
  ctx.fill();
  ctx.strokeStyle = '#35f0ff';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.textAlign = 'left';
}

// ============================================================
// AVVIO APP E SERVICE WORKER
// ============================================================

if ('serviceWorker' in navigator)
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => { }));
render();

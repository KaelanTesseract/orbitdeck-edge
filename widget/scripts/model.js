// Orbitdeck data model: tasks, focus sessions with breaks, history and the countdown timer.
// Pure logic on a plain object (saved as JSON per widget); every time-dependent function takes `now` (ms).
var OrbitModel = (function () {
  'use strict';

  var MAX_SESSIONS = 300;
  var KEEP_DONE_DAYS = 90;
  var MAX_TITLE = 80;

  function pad(n) { return String(n).padStart(2, '0'); }
  /** Local calendar day as 'YYYY-MM-DD'. */
  function dayKey(date) {
    var d = new Date(date);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function addDays(key, n) {
    var p = key.split('-').map(Number);
    return dayKey(new Date(p[0], p[1] - 1, p[2] + n));
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function cleanTitle(t) { return String(t || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE); }

  /** Brings stored data (any older or broken shape) into the current shape. */
  function normalize(d) {
    d = d && typeof d === 'object' ? d : {};
    if (!Array.isArray(d.tasks)) d.tasks = [];
    if (!Array.isArray(d.sessions)) d.sessions = [];
    d.tasks = d.tasks.filter(function (t) { return t && typeof t.id === 'string' && typeof t.title === 'string'; });
    d.sessions = d.sessions.filter(function (s) { return s && typeof s.secs === 'number'; });
    if (!d.focus || typeof d.focus !== 'object' || !d.focus.state) d.focus = null;
    if (!d.timer || typeof d.timer !== 'object' || !d.timer.state) d.timer = null;
    return d;
  }

  /** Drops old finished tasks and caps the history. */
  function prune(d, now) {
    var limit = addDays(dayKey(now), -KEEP_DONE_DAYS);
    d.tasks = d.tasks.filter(function (t) { return !t.done || !t.doneAt || dayKey(t.doneAt) >= limit; });
    if (d.sessions.length > MAX_SESSIONS) d.sessions = d.sessions.slice(d.sessions.length - MAX_SESSIONS);
  }

  // ---------- tasks ----------

  function addTask(d, o, now) {
    var title = cleanTitle(o.title);
    if (!title) return null;
    var t = { id: uid(), title: title, date: o.date || dayKey(now), minutes: Math.max(5, Math.min(600, Number(o.minutes) || 25)),
              prio: [0, 1, 2].indexOf(o.prio) >= 0 ? o.prio : 1, done: false, doneAt: 0, worked: 0, created: now };
    d.tasks.push(t);
    return t;
  }
  function findTask(d, id) {
    for (var i = 0; i < d.tasks.length; i++) if (d.tasks[i].id === id) return d.tasks[i];
    return null;
  }
  function setDone(d, id, done, now) {
    var t = findTask(d, id);
    if (!t) return;
    t.done = !!done;
    t.doneAt = done ? now : 0;
  }
  function deleteTask(d, id) {
    d.tasks = d.tasks.filter(function (t) { return t.id !== id; });
    if (d.focus && d.focus.taskId === id) d.focus.taskId = '';
  }
  function sortTasks(list) {
    return list.sort(function (a, b) {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      if (a.prio !== b.prio) return b.prio - a.prio;
      return a.created - b.created;
    });
  }
  /** 'today': due today or overdue and still open, plus what was finished today. 'upcoming': later days. */
  function tasksFor(d, scope, now) {
    var today = dayKey(now);
    return sortTasks(d.tasks.filter(function (t) {
      if (scope === 'upcoming') return !t.done && t.date > today;
      return t.done ? dayKey(t.doneAt) === today : t.date <= today;
    }));
  }
  function tasksOn(d, key) {
    return sortTasks(d.tasks.filter(function (t) { return t.date === key; }));
  }
  /** Days of a month that have open (1) or only finished (2) tasks: { 'YYYY-MM-DD': 1|2 }. */
  function monthMarks(d, year, month) {
    var prefix = year + '-' + pad(month + 1) + '-', marks = {};
    d.tasks.forEach(function (t) {
      if (t.date.indexOf(prefix) !== 0) return;
      marks[t.date] = (!t.done || marks[t.date] === 1) ? 1 : 2;
    });
    return marks;
  }
  /** Earlier task titles that contain the typed text, most recent first. */
  function suggestions(d, text, max) {
    var q = cleanTitle(text).toLowerCase(), seen = {}, out = [];
    var titles = d.sessions.slice().reverse().map(function (s) { return s.title; })
      .concat(d.tasks.slice().sort(function (a, b) { return b.created - a.created; }).map(function (t) { return t.title; }));
    for (var i = 0; i < titles.length && out.length < (max || 4); i++) {
      var tt = titles[i], k = tt.toLowerCase();
      if (!tt || seen[k] || (q && k.indexOf(q) < 0) || k === q) continue;
      seen[k] = true;
      out.push(tt);
    }
    return out;
  }
  function isOverdue(t, now) { return !t.done && t.date < dayKey(now); }

  // ---------- focus sessions ----------
  // focus: { taskId, title, planned (s), started (ms, session start), segStart (ms, current run),
  //          acc (s worked before segStart), state: 'run' | 'paused' | 'break', breakUntil (ms),
  //          lastBreakAt (s of work when the last break ended), snoozeUntil (ms) }

  function startFocus(d, task, now) {
    if (d.focus) stopFocus(d, now, false);
    d.focus = { taskId: task.id, title: task.title, planned: task.minutes * 60, started: now, segStart: now,
                acc: 0, state: 'run', breakUntil: 0, lastBreakAt: 0, snoozeUntil: 0 };
    if (task.done) { task.done = false; task.doneAt = 0; }
    return d.focus;
  }
  function elapsed(f, now) {
    return f.acc + (f.state === 'run' ? Math.max(0, (now - f.segStart) / 1000) : 0);
  }
  function holdRun(f, now) {
    if (f.state === 'run') f.acc = elapsed(f, now);
  }
  function pauseFocus(d, now) {
    var f = d.focus; if (!f || f.state !== 'run') return;
    holdRun(f, now); f.state = 'paused';
  }
  function resumeFocus(d, now) {
    var f = d.focus; if (!f || f.state === 'run') return;
    if (f.state === 'break') f.lastBreakAt = f.acc;
    f.state = 'run'; f.segStart = now; f.breakUntil = 0;
  }
  function startBreak(d, now, minutes) {
    var f = d.focus; if (!f) return;
    holdRun(f, now); f.state = 'break'; f.breakUntil = now + minutes * 60000;
  }
  function snoozeBreak(d, now, minutes) {
    if (d.focus) d.focus.snoozeUntil = now + minutes * 60000;
  }
  /** Ends the session, books the time on the task and the history. Returns the session or null. */
  function stopFocus(d, now, done) {
    var f = d.focus; if (!f) return null;
    var secs = Math.round(elapsed(f, now));
    d.focus = null;
    var task = findTask(d, f.taskId);
    if (task) { task.worked = (task.worked || 0) + secs; if (done) { task.done = true; task.doneAt = now; } }
    if (secs < 10) return null;    // a mis-tap is not history
    var s = { id: uid(), taskId: f.taskId, title: f.title, start: f.started, end: now, secs: secs, done: !!done };
    d.sessions.push(s);
    prune(d, now);
    return s;
  }
  /** What the focus card shows: state, elapsed, planned, break left and whether to suggest a break. */
  function focusStatus(d, now, breakEveryMin) {
    var f = d.focus; if (!f) return null;
    var e = elapsed(f, now);
    return {
      state: f.state, title: f.title, elapsed: e, planned: f.planned,
      breakLeft: f.state === 'break' ? Math.max(0, (f.breakUntil - now) / 1000) : 0,
      breakOver: f.state === 'break' && now >= f.breakUntil,
      needBreak: f.state === 'run' && breakEveryMin > 0 && e - f.lastBreakAt >= breakEveryMin * 60 && now >= f.snoozeUntil
    };
  }

  // ---------- history ----------

  function history(d) {
    return d.sessions.slice().sort(function (a, b) { return b.end - a.end; });
  }
  function stats(d, now) {
    var today = dayKey(now), weekStart = addDays(today, -((new Date(now).getDay() + 6) % 7));
    var r = { todaySecs: 0, weekSecs: 0, doneToday: 0, sessionsToday: 0 };
    d.sessions.forEach(function (s) {
      var k = dayKey(s.end);
      if (k === today) { r.todaySecs += s.secs; r.sessionsToday++; }
      if (k >= weekStart) r.weekSecs += s.secs;
    });
    var f = d.focus;
    if (f) { var e = elapsed(f, now); r.todaySecs += e; r.weekSecs += e; }
    d.tasks.forEach(function (t) { if (t.done && dayKey(t.doneAt) === today) r.doneToday++; });
    return r;
  }

  // ---------- countdown timer ----------
  // timer: { name, total (s), end (ms), state: 'run' | 'ringing' }

  function startTimer(d, name, secs, now) {
    d.timer = { name: cleanTitle(name), total: secs, end: now + secs * 1000, state: 'run' };
    return d.timer;
  }
  function timerStatus(d, now) {
    var t = d.timer; if (!t) return null;
    if (t.state === 'run' && now >= t.end) t.state = 'ringing';
    return { name: t.name, total: t.total, left: Math.max(0, (t.end - now) / 1000), ringing: t.state === 'ringing' };
  }
  function snoozeTimer(d, now, secs) {
    var t = d.timer; if (!t) return;
    t.end = Math.max(now, t.end) + secs * 1000; t.total += secs; t.state = 'run';
  }
  function stopTimer(d) { d.timer = null; }

  return {
    dayKey: dayKey, addDays: addDays, normalize: normalize, prune: prune,
    addTask: addTask, findTask: findTask, setDone: setDone, deleteTask: deleteTask,
    tasksFor: tasksFor, tasksOn: tasksOn, monthMarks: monthMarks, suggestions: suggestions, isOverdue: isOverdue,
    startFocus: startFocus, pauseFocus: pauseFocus, resumeFocus: resumeFocus, startBreak: startBreak, snoozeBreak: snoozeBreak,
    stopFocus: stopFocus, focusStatus: focusStatus, elapsed: elapsed,
    history: history, stats: stats,
    startTimer: startTimer, timerStatus: timerStatus, snoozeTimer: snoozeTimer, stopTimer: stopTimer
  };
})();
if (typeof module !== 'undefined') module.exports = OrbitModel;

// Tasks, focus, history, timer and calendar: the panels plus the focus card (top left), the timer card
// (top right) and notices (break reminder, break over, timer alarm). Data lives in OrbitModel objects,
// stored by app.js. Without the hub there is no sound – alarms are visual (pulsing frame).
var OrbitPanels = (function () {
  'use strict';

  var M = OrbitModel, K = OrbitKeyboard, esc = OrbitKeyboard.esc;
  var t = function (k) { return OrbitI18n.t(k); };
  var $ = function (id) { return document.getElementById(id); };
  var ctx = null;          // { data, options, save() }
  var tab = 'today';
  var draft = { title: '', dayOffset: 0, minutes: 25, prio: 1 };
  var timerDraft = { name: '', secs: 10 * 60 };
  var cal = { year: 0, month: 0, selected: '' };
  var DURATIONS = [15, 25, 50, 90, 120];
  var TIMER_PRESETS = [1, 5, 10, 15, 25, 45, 60];
  var HOLD_DELETE_MS = 800;

  // ---------- formatting ----------

  function locale() { return OrbitI18n.lang === 'de' ? 'de-DE' : 'en-US'; }
  function hms(secs) {
    secs = Math.max(0, Math.floor(secs));
    var h = Math.floor(secs / 3600), m = Math.floor(secs / 60) % 60, s = secs % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s).padStart(2, '0');
  }
  function hoursMin(secs) {
    var m = Math.round(secs / 60);
    return m < 60 ? m + ' ' + t('minShort') : Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0') + ' h';
  }
  function durLabel(min) { return min < 60 ? min + ' ' + t('minShort') : (min % 60 ? (min / 60).toLocaleString(locale()) + ' h' : (min / 60) + ' h'); }
  function dayLabel(key, now) {
    var today = M.dayKey(now);
    if (key === today) return t('today');
    if (key === M.addDays(today, 1)) return t('tomorrow');
    if (key === M.addDays(today, -1)) return t('yesterday');
    var p = key.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' });
  }
  function clock(ms) {
    var d = new Date(ms);
    return ctx.options.clock24 ? String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
      : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  // ---------- tasks panel ----------

  function renderTasks() {
    var now = Date.now();
    Array.prototype.forEach.call(document.querySelectorAll('#panel-tasks [data-tab]'), function (b) {
      b.classList.toggle('on', b.getAttribute('data-tab') === tab);
    });
    var body = $('tasksBody');
    body.className = 'panel-body split tab-' + tab;
    if (tab === 'timer') { renderTimerTab(body, now); return; }
    var left = tab === 'history' ? historyHtml(now) : taskListHtml(M.tasksFor(ctx.data, tab, now), now, tab === 'today' ? 'emptyToday' : 'emptyUpcoming');
    var right = tab === 'history' ? statsHtml(now) : formHtml(now);
    body.innerHTML = '<div class="list scroll">' + left + '</div><div class="side">' + right + '</div>';
  }

  function taskRowHtml(task, now, showDate) {
    var active = ctx.data.focus && ctx.data.focus.taskId === task.id;
    var meta = [];
    if (showDate || M.isOverdue(task, now)) meta.push('<span class="' + (M.isOverdue(task, now) ? 'late' : '') + '">' + esc(dayLabel(task.date, now)) + '</span>');
    meta.push(esc(durLabel(task.minutes)));
    if (task.worked >= 60) meta.push(esc(hoursMin(task.worked) + ' ' + t('worked')));
    return '<div class="task-row' + (task.done ? ' done' : '') + (active ? ' active' : '') + '" data-id="' + esc(task.id) + '">' +
      '<button class="check" data-act="done" aria-label="' + esc(t('markDone')) + '"><svg viewBox="0 0 24 24"><path d="M6 12.5l4 4L18 8"/></svg></button>' +
      '<div class="task-main"><div class="task-title">' + esc(task.title) + '</div>' +
      '<div class="task-meta"><i class="prio p' + task.prio + '"></i>' + meta.join(' · ') + '</div></div>' +
      (task.done ? '' : '<button class="row-btn play" data-act="focus" aria-label="' + esc(t('startFocus')) + '">' +
        (active ? '<span class="live">' + esc(t('running')) + '</span>' : '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z"/></svg>') + '</button>') +
      '<button class="row-btn del" data-hold="delete" aria-label="' + esc(t('holdDelete')) + '"><span class="hold-ring"></span><svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg></button>' +
      '</div>';
  }
  function taskListHtml(list, now, emptyKey, showDate) {
    if (!list.length) return '<div class="empty">' + esc(t(emptyKey)) + '</div>';
    return list.map(function (x) { return taskRowHtml(x, now, showDate !== undefined ? showDate : tab === 'upcoming'); }).join('');
  }

  function chips(name, values, current, label) {
    return '<div class="chips" data-chips="' + name + '">' + values.map(function (v) {
      return '<button class="chip' + (v === current ? ' on' : '') + '" data-value="' + v + '">' + esc(label(v)) + '</button>';
    }).join('') + '</div>';
  }
  function formHtml(now) {
    var dayKey = M.addDays(M.dayKey(now), draft.dayOffset);
    return '<h3>' + esc(t('newTask')) + '</h3>' +
      '<button class="field" data-act="title">' + (draft.title ? esc(draft.title) : '<span class="ph">' + esc(t('taskPlaceholder')) + '</span>') + '</button>' +
      '<div class="form-row"><span class="form-lbl">' + esc(t('date')) + '</span>' +
        '<div class="stepper"><button data-act="dayPrev"' + (draft.dayOffset <= 0 ? ' disabled' : '') + '>‹</button><span>' + esc(dayLabel(dayKey, now)) + '</span><button data-act="dayNext">›</button></div></div>' +
      '<div class="form-row"><span class="form-lbl">' + esc(t('duration')) + '</span>' + chips('minutes', DURATIONS, draft.minutes, durLabel) + '</div>' +
      '<div class="form-row"><span class="form-lbl">' + esc(t('priority')) + '</span>' + chips('prio', [0, 1, 2], draft.prio, function (p) { return t('prio' + p); }) + '</div>' +
      '<div class="form-actions"><button class="btn" data-act="add"' + (draft.title ? '' : ' disabled') + '>' + esc(t('add')) + '</button>' +
      '<button class="btn primary" data-act="addStart"' + (draft.title ? '' : ' disabled') + '><svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z"/></svg>' + esc(t('addAndStart')) + '</button></div>';
  }

  function historyHtml(now) {
    var list = M.history(ctx.data);
    if (!list.length) return '<div class="empty">' + esc(t('emptyHistory')) + '</div>';
    var out = [], lastDay = '';
    list.slice(0, 60).forEach(function (s) {
      var day = M.dayKey(s.end);
      if (day !== lastDay) { out.push('<div class="day-head">' + esc(dayLabel(day, now).toUpperCase()) + '</div>'); lastDay = day; }
      out.push('<div class="hist-row" data-session="' + esc(s.id) + '">' +
        '<div class="hist-time">' + esc(clock(s.start)) + '<br />' + esc(clock(s.end)) + '</div>' +
        '<div class="task-main"><div class="task-title">' + esc(s.title) + '</div>' +
        '<div class="task-meta">' + esc(hoursMin(s.secs)) + (s.done ? ' · <span class="ok">' + esc(t('finished')) + '</span>' : '') + '</div></div>' +
        '<button class="pill" data-act="continue">' + esc(t('continue')) + '</button></div>');
    });
    return out.join('');
  }
  function statsHtml(now) {
    var s = M.stats(ctx.data, now);
    function stat(v, l) { return '<div class="stat"><div class="stat-v">' + esc(v) + '</div><div class="stat-l">' + esc(l) + '</div></div>'; }
    return '<h3>' + esc(t('overview')) + '</h3><div class="stats">' +
      stat(hoursMin(s.todaySecs), t('workedToday')) + stat(hoursMin(s.weekSecs), t('workedWeek')) +
      stat(String(s.doneToday), t('doneToday')) + stat(String(s.sessionsToday), t('sessionsToday')) + '</div>';
  }

  // ---------- timer tab ----------

  function renderTimerTab(body, now) {
    var st = M.timerStatus(ctx.data, now);
    var left, right;
    if (st) {
      left = '<div class="timer-big">' + esc(hms(st.left)) + '</div><div class="timer-name">' + esc(st.name || t('timer')) + '</div>';
      right = '<h3>' + esc(t('timerRunning')) + '</h3><div class="form-actions col">' +
        '<button class="btn" data-act="timerPlus">+5 ' + esc(t('minShort')) + '</button>' +
        '<button class="btn danger" data-act="timerStop">' + esc(t('stopTimer')) + '</button></div>';
    } else {
      left = '<div class="timer-big">' + esc(hms(timerDraft.secs)) + '</div>' +
        '<div class="timer-adjust"><button class="chip" data-act="tMinus">−1</button><button class="chip" data-act="tPlus1">+1</button>' +
        '<button class="chip" data-act="tPlus5">+5</button><button class="chip" data-act="tPlus10">+10</button></div>' +
        chips('timerPreset', TIMER_PRESETS, Math.round(timerDraft.secs / 60), function (m) { return m + ' ' + t('minShort'); });
      right = '<h3>' + esc(t('newTimer')) + '</h3>' +
        '<button class="field" data-act="timerName">' + (timerDraft.name ? esc(timerDraft.name) : '<span class="ph">' + esc(t('timerPlaceholder')) + '</span>') + '</button>' +
        '<p class="hint">' + esc(t('timerHint')) + '</p>' +
        '<div class="form-actions"><button class="btn primary" data-act="timerStart"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z"/></svg>' + esc(t('startTimer')) + '</button></div>';
    }
    body.innerHTML = '<div class="timer-set">' + left + '</div><div class="side">' + right + '</div>';
  }

  // ---------- calendar ----------

  function renderCalendar() {
    var now = Date.now();
    if (!cal.selected) { var d0 = new Date(now); cal.year = d0.getFullYear(); cal.month = d0.getMonth(); cal.selected = M.dayKey(now); }
    var first = new Date(cal.year, cal.month, 1), startDow = (first.getDay() + 6) % 7;
    var days = new Date(cal.year, cal.month + 1, 0).getDate();
    var marks = M.monthMarks(ctx.data, cal.year, cal.month), today = M.dayKey(now);
    var title = first.toLocaleDateString(locale(), { month: 'long', year: 'numeric' }).toUpperCase();
    var dow = [];
    for (var i = 0; i < 7; i++) dow.push(new Date(2024, 0, 1 + i).toLocaleDateString(locale(), { weekday: 'short' }).replace('.', '').toUpperCase());
    var cells = [];
    for (var c = 0; c < 42; c++) {
      var dn = c - startDow + 1;
      if (dn < 1 || dn > days) { cells.push('<span class="day out"></span>'); continue; }
      var key = cal.year + '-' + String(cal.month + 1).padStart(2, '0') + '-' + String(dn).padStart(2, '0');
      cells.push('<button class="day' + (key === today ? ' today' : '') + (key === cal.selected ? ' sel' : '') + '" data-day="' + key + '">' + dn +
        (marks[key] ? '<i class="mark m' + marks[key] + '"></i>' : '') + '</button>');
    }
    var p = cal.selected.split('-').map(Number);
    var selTitle = new Date(p[0], p[1] - 1, p[2]).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();
    $('calBody').innerHTML =
      '<div class="cal"><div class="cal-head"><button class="nav" data-act="monPrev">‹</button><span>' + esc(title) + '</span><button class="nav" data-act="monNext">›</button></div>' +
      '<div class="cal-grid">' + dow.map(function (d) { return '<span class="dow">' + esc(d) + '</span>'; }).join('') + cells.join('') + '</div></div>' +
      '<div class="side"><h3>' + esc(selTitle) + '</h3><div class="list scroll">' + taskListHtml(M.tasksOn(ctx.data, cal.selected), now, 'emptyDay', false) + '</div>' +
      '<button class="btn" data-act="addOnDay">+ ' + esc(t('addOnDay')) + '</button></div>';
  }

  // ---------- actions ----------

  function changed() { ctx.save(); renderAll(); }
  function renderAll() {
    if (isOpen('tasks')) renderTasks();
    if (isOpen('calendar')) renderCalendar();
    tick();
  }
  function isOpen(name) { var p = $('panel-' + name); return p && p.classList.contains('open'); }

  function startFocus(task) {
    M.startFocus(ctx.data, task, Date.now());
    changed();
  }
  function editTitle() {
    K.open({ title: t('newTask'), value: draft.title, placeholder: t('taskPlaceholder'),
      suggest: function (text) { return M.suggestions(ctx.data, text, 4); },
      onDone: function (v) { draft.title = v; renderTasks(); } });
  }
  function addFromDraft(start) {
    var now = Date.now();
    var task = M.addTask(ctx.data, { title: draft.title, date: M.addDays(M.dayKey(now), draft.dayOffset), minutes: draft.minutes, prio: draft.prio }, now);
    if (!task) return;
    draft.title = '';
    if (start) M.startFocus(ctx.data, task, now);
    tab = draft.dayOffset > 0 && !start ? 'upcoming' : 'today';
    changed();
  }

  function onClick(e) {
    var b = e.target.closest('button');
    if (!b || b.disabled) return;
    var now = Date.now(), d = ctx.data;
    var row = b.closest('[data-id]'), task = row ? M.findTask(d, row.getAttribute('data-id')) : null;
    var tabBtn = b.getAttribute('data-tab');
    if (tabBtn) { tab = tabBtn; renderTasks(); return; }
    var chipsEl = b.closest('[data-chips]');
    if (chipsEl) {
      var v = Number(b.getAttribute('data-value')), which = chipsEl.getAttribute('data-chips');
      if (which === 'timerPreset') timerDraft.secs = v * 60; else draft[which] = v;
      renderTasks(); return;
    }
    if (b.hasAttribute('data-day')) { cal.selected = b.getAttribute('data-day'); renderCalendar(); return; }
    switch (b.getAttribute('data-act')) {
      case 'done': if (task) { if (task.done) M.setDone(d, task.id, false, now); else if (d.focus && d.focus.taskId === task.id) M.stopFocus(d, now, true); else M.setDone(d, task.id, true, now); changed(); } break;
      case 'focus': if (task && !(d.focus && d.focus.taskId === task.id)) startFocus(task); break;
      case 'title': editTitle(); break;
      case 'dayPrev': draft.dayOffset = Math.max(0, draft.dayOffset - 1); renderTasks(); break;
      case 'dayNext': draft.dayOffset = Math.min(365, draft.dayOffset + 1); renderTasks(); break;
      case 'add': addFromDraft(false); break;
      case 'addStart': addFromDraft(true); break;
      case 'continue': {
        var s = M.history(d).filter(function (x) { return x.id === b.closest('[data-session]').getAttribute('data-session'); })[0];
        if (!s) break;
        var tk = M.findTask(d, s.taskId) || M.addTask(d, { title: s.title, minutes: 25 }, now);
        startFocus(tk); break;
      }
      case 'tMinus': timerDraft.secs = Math.max(60, timerDraft.secs - 60); renderTasks(); break;
      case 'tPlus1': timerDraft.secs = Math.min(24 * 3600, timerDraft.secs + 60); renderTasks(); break;
      case 'tPlus5': timerDraft.secs = Math.min(24 * 3600, timerDraft.secs + 300); renderTasks(); break;
      case 'tPlus10': timerDraft.secs = Math.min(24 * 3600, timerDraft.secs + 600); renderTasks(); break;
      case 'timerName': K.open({ title: t('newTimer'), value: timerDraft.name, placeholder: t('timerPlaceholder'),
        onDone: function (v) { timerDraft.name = v; renderTasks(); } }); break;
      case 'timerStart': M.startTimer(d, timerDraft.name, timerDraft.secs, now); timerDraft.name = ''; changed(); break;
      case 'timerPlus': M.snoozeTimer(d, now, 300); changed(); break;
      case 'timerStop': M.stopTimer(d); changed(); break;
      case 'monPrev': cal.month--; if (cal.month < 0) { cal.month = 11; cal.year--; } renderCalendar(); break;
      case 'monNext': cal.month++; if (cal.month > 11) { cal.month = 0; cal.year++; } renderCalendar(); break;
      case 'addOnDay': K.open({ title: t('newTask'), placeholder: t('taskPlaceholder'),
        suggest: function (text) { return M.suggestions(d, text, 4); },
        onDone: function (v) { if (M.addTask(d, { title: v, date: cal.selected, minutes: 25, prio: 1 }, Date.now())) changed(); } }); break;
    }
  }

  /** Press-and-hold to delete a task: a ring fills while holding, letting go early cancels. */
  function bindHoldDelete(container) {
    var timer = 0, btn = null;
    container.addEventListener('pointerdown', function (e) {
      var b = e.target.closest('[data-hold="delete"]');
      if (!b) return;
      btn = b; b.classList.add('holding');
      timer = setTimeout(function () {
        var row = b.closest('[data-id]');
        b.classList.remove('holding'); timer = 0; btn = null;
        if (row) { M.deleteTask(ctx.data, row.getAttribute('data-id')); changed(); }
      }, HOLD_DELETE_MS);
    });
    function cancel() { if (timer) { clearTimeout(timer); timer = 0; if (btn) btn.classList.remove('holding'); btn = null; } }
    container.addEventListener('pointerup', cancel);
    container.addEventListener('pointercancel', cancel);
    container.addEventListener('pointerleave', cancel);
  }

  // ---------- focus card, timer card, notices (every second) ----------

  var notice = null;   // what the notice shows: 'timer' | 'breakOver' | 'needBreak' | 'mic'
  var ALARM_REPEATS = 5, ALARM_EVERY_MS = 30000, MIC_SNOOZE_MS = 30 * 60000;
  var alarmCount = 0, alarmAt = 0, micOpenSince = 0, micSnoozeUntil = 0;

  /** Microphone open (not muted) longer than the chosen minutes – needs the hub, which knows the mute state. */
  function micCheck(now, o) {
    var a = OrbitHub.ready() ? OrbitHub.state.audio : null;
    var open = !!(a && a.mic && !a.mic.mute);
    if (!open) { micOpenSince = 0; return false; }
    if (!micOpenSince) micOpenSince = now;
    return o.micReminder > 0 && now - micOpenSince >= o.micReminder * 60000 && now >= micSnoozeUntil;
  }
  function tick() {
    var now = Date.now(), d = ctx.data, o = ctx.options;
    var f = M.focusStatus(d, now, o.breakEvery);
    var card = $('focusCard');
    card.hidden = !f;
    if (f) {
      card.dataset.state = f.state;
      $('focusState').textContent = t(f.state === 'run' ? 'stateRun' : f.state === 'break' ? (f.breakOver ? 'stateBreakOver' : 'stateBreak') : 'statePaused');
      $('focusTask').textContent = f.title;
      $('focusElapsed').textContent = f.state === 'break' ? hms(f.breakLeft) : hms(f.elapsed);
      $('focusGoal').textContent = f.state === 'break' ? t('breakLeft') : '/ ' + hms(f.planned);
      $('focusBar').style.width = Math.min(100, (f.state === 'break' ? (1 - f.breakLeft / (o.breakLen * 60)) : f.elapsed / Math.max(1, f.planned)) * 100) + '%';
      $('focusPause').textContent = t(f.state === 'run' ? 'pause' : 'resume');
    }
    var tm = M.timerStatus(d, now), tcard = $('timerCard');
    tcard.hidden = !tm;
    if (tm) {
      $('timerName').textContent = tm.name || t('timer');
      $('timerLeft').textContent = tm.ringing ? '0:00' : hms(tm.left);
      $('timerBar').style.width = (tm.ringing ? 100 : (1 - tm.left / Math.max(1, tm.total)) * 100) + '%';
      tcard.classList.toggle('ringing', tm.ringing);
    }
    var mic = micCheck(now, o);
    var want = tm && tm.ringing ? 'timer' : f && f.breakOver ? 'breakOver' : f && f.needBreak ? 'needBreak' : mic ? 'mic' : null;
    if (want !== notice) {
      // sounds come from the hub (widget sound stays silent in iCUE); without the hub the notice is visual only
      if (want === 'timer') { alarmCount = 1; alarmAt = now; OrbitHub.sound('alarm'); }
      else if (want) OrbitHub.sound('chime');
      showNotice(want, tm, o);
    } else if (want === 'timer' && alarmCount < ALARM_REPEATS && now - alarmAt >= ALARM_EVERY_MS) {
      alarmCount++; alarmAt = now; OrbitHub.sound('alarm');
    }
    $('root').classList.toggle('alarm', want === 'timer');
    if (isOpen('tasks') && tab === 'timer') {
      var big = document.querySelector('#tasksBody .timer-big');
      if (big && tm) big.textContent = hms(tm.ringing ? 0 : tm.left);
      if (!!tm !== !!document.querySelector('#tasksBody [data-act="timerStop"]')) renderTasks();
    }
  }

  function showNotice(kind, tm, o) {
    notice = kind;
    var el = $('notice');
    el.hidden = !kind;
    if (!kind) return;
    var text, a1, a2;
    if (kind === 'timer') { text = t('timerDone').replace('{name}', tm.name || t('timer')); a1 = ['noticeOff', t('off')]; a2 = ['noticeSnooze', '+5 ' + t('minShort')]; }
    else if (kind === 'breakOver') { text = t('breakOver'); a1 = ['noticeResume', t('resume')]; a2 = ['noticeStop', t('endSession')]; }
    else if (kind === 'mic') { text = t('micOn').replace('{min}', o.micReminder); a1 = ['noticeMicMute', t('muteMic')]; a2 = ['noticeMicOk', t('keepOn')]; }
    else { text = t('needBreak').replace('{min}', o.breakLen); a1 = ['noticeBreak', t('startBreak')]; a2 = ['noticeLater', t('later')]; }
    el.dataset.kind = kind;
    $('noticeText').textContent = text;
    $('noticeA').textContent = a1[1]; $('noticeA').dataset.act = a1[0];
    $('noticeB').textContent = a2[1]; $('noticeB').dataset.act = a2[0];
  }

  function onCardClick(e) {
    var now = Date.now(), d = ctx.data;
    var act = e.target.closest('[data-act]');
    if (!act) { e.currentTarget.classList.toggle('expanded'); return; }
    switch (act.dataset.act) {
      case 'focusPause': if (d.focus && d.focus.state === 'run') M.pauseFocus(d, now); else M.resumeFocus(d, now); break;
      case 'focusDone': M.stopFocus(d, now, true); break;
      case 'focusStop': M.stopFocus(d, now, false); break;
      case 'timerPlus': M.snoozeTimer(d, now, 300); break;
      case 'timerStop': M.stopTimer(d); break;
      case 'noticeOff': M.stopTimer(d); break;
      case 'noticeSnooze': M.snoozeTimer(d, now, 300); break;
      case 'noticeResume': M.resumeFocus(d, now); break;
      case 'noticeStop': M.stopFocus(d, now, false); break;
      case 'noticeBreak': M.startBreak(d, now, ctx.options.breakLen); break;
      case 'noticeLater': M.snoozeBreak(d, now, 10); break;
      case 'noticeMicMute': OrbitHub.send({ op: 'setMute', target: 'mic', mute: true }); micSnoozeUntil = now + 60000; break;
      case 'noticeMicOk': micSnoozeUntil = now + MIC_SNOOZE_MS; break;
    }
    $('focusCard').classList.remove('expanded'); $('timerCard').classList.remove('expanded');
    notice = '-';    // force the notice to be recomputed
    changed();
  }

  // ---------- setup ----------

  function init(c) {
    ctx = c;
    ['panel-tasks', 'panel-calendar'].forEach(function (id) {
      $(id).addEventListener('click', onClick);
      bindHoldDelete($(id));
    });
    $('focusCard').addEventListener('click', onCardClick);
    $('timerCard').addEventListener('click', onCardClick);
    $('notice').addEventListener('click', function (e) { if (e.target.closest('[data-act]')) onCardClick(e); });
    setInterval(tick, 1000);
    tick();
  }

  /** Called by app.js when a panel opens. */
  function onOpen(name) {
    if (name === 'tasks') renderTasks();
    if (name === 'calendar') { cal.selected = ''; renderCalendar(); }
  }

  return { init: init, onOpen: onOpen, render: renderAll };
})();

// Browser tests only: fills the widget with sample tasks, history, a running focus session and a timer.
// Used by tools/shot.py as the JS to run before a screenshot, e.g. "$(cat tools/demo-data.js); openPanel('tasks')".
(function () {
  var M = OrbitModel, d = app.data, now = Date.now(), day = 86400000, min = 60000;
  var en = OrbitI18n.lang !== 'de';
  var T = en
    ? { video: 'Edit the product video', mail: 'Answer emails', tax: 'Sort tax papers', board: 'Order circuit board', case_: 'Print ESP32 case', release: 'Release Orbitdeck', fw: 'Test firmware update' }
    : { video: 'Produktvideo schneiden', mail: 'Mails beantworten', tax: 'Steuerunterlagen sortieren', board: 'Platine bestellen', case_: 'ESP32-Gehäuse drucken', release: 'Release Orbitdeck', fw: 'Firmware-Update testen' };
  d.tasks = []; d.sessions = []; d.focus = null; d.timer = null;   // headless Edge may keep localStorage between runs
  var a = M.addTask(d, { title: T.video, minutes: 120, prio: 2 }, now - 5 * min);
  M.addTask(d, { title: T.mail, minutes: 25, prio: 1 }, now - 4 * min);
  M.addTask(d, { title: T.tax, minutes: 50, prio: 0, date: M.addDays(M.dayKey(now), -2) }, now - 3 * min);
  var done = M.addTask(d, { title: T.board, minutes: 15, prio: 1 }, now - 2 * min);
  M.setDone(d, done.id, true, now - 30 * min);
  M.addTask(d, { title: T.case_, minutes: 90, prio: 1, date: M.addDays(M.dayKey(now), 1) }, now);
  M.addTask(d, { title: T.release, minutes: 120, prio: 2, date: M.addDays(M.dayKey(now), 4) }, now);
  d.sessions.push({ id: 's1', taskId: done.id, title: T.board, start: now - 75 * min, end: now - 52 * min, secs: 23 * 60, done: true });
  d.sessions.push({ id: 's2', taskId: 'x', title: T.fw, start: now - day - 120 * min, end: now - day - 40 * min, secs: 80 * 60, done: false });
  M.startFocus(d, a, now - (1 * 3600 + 42 * 60 + 18) * 1000);
  M.startTimer(d, 'Pizza', 14 * 60 + 30, now);
  OrbitPanels.render();
})();

// node tests/model.test.js – checks the pure data model (tasks, focus, breaks, history, timer).
const assert = require('assert');
const M = require('../widget/scripts/model.js');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok', name); };
const T0 = new Date(2026, 10, 13, 9, 0, 0).getTime(); const MIN = 60000;

t('normalize repairs broken data', () => {
  const d = M.normalize({ tasks: [null, { id: 'a', title: 'x' }], sessions: 'no', focus: {} });
  assert.strictEqual(d.tasks.length, 1); assert.deepStrictEqual(d.sessions, []); assert.strictEqual(d.focus, null);
});
t('add task trims, clamps and rejects empty', () => {
  const d = M.normalize({});
  assert.strictEqual(M.addTask(d, { title: '   ' }, T0), null);
  const a = M.addTask(d, { title: '  Video   schneiden ', minutes: 9999, prio: 7 }, T0);
  assert.strictEqual(a.title, 'Video schneiden'); assert.strictEqual(a.minutes, 600); assert.strictEqual(a.prio, 1);
  assert.strictEqual(a.date, '2026-11-13');
});
t('today/upcoming lists, overdue first, prio order', () => {
  const d = M.normalize({});
  M.addTask(d, { title: 'later', date: '2026-11-20' }, T0);
  const low = M.addTask(d, { title: 'low', prio: 0 }, T0);
  const high = M.addTask(d, { title: 'high', prio: 2 }, T0 + 1);
  const old = M.addTask(d, { title: 'old', date: '2026-11-10' }, T0 + 2);
  assert.deepStrictEqual(M.tasksFor(d, 'today', T0).map(x => x.title), ['old', 'high', 'low']);
  assert.deepStrictEqual(M.tasksFor(d, 'upcoming', T0).map(x => x.title), ['later']);
  assert.ok(M.isOverdue(old, T0)); assert.ok(!M.isOverdue(high, T0));
  M.setDone(d, low.id, true, T0);
  assert.deepStrictEqual(M.tasksFor(d, 'today', T0).map(x => x.title), ['old', 'high', 'low']);
  assert.deepStrictEqual(M.tasksFor(d, 'today', T0 + 24 * 60 * MIN).map(x => x.title), ['old', 'high']);
});
t('month marks: open beats done', () => {
  const d = M.normalize({});
  const a = M.addTask(d, { title: 'a', date: '2026-11-05' }, T0); M.addTask(d, { title: 'b', date: '2026-11-05' }, T0);
  const c = M.addTask(d, { title: 'c', date: '2026-11-07' }, T0); M.setDone(d, c.id, true, T0);
  M.setDone(d, a.id, true, T0);
  assert.deepStrictEqual(M.monthMarks(d, 2026, 10), { '2026-11-05': 1, '2026-11-07': 2 });
});
t('suggestions: unique, substring, most recent first', () => {
  const d = M.normalize({});
  M.addTask(d, { title: 'Mails beantworten' }, T0); M.addTask(d, { title: 'Video schneiden' }, T0 + 5);
  d.sessions.push({ title: 'Mails sortieren', secs: 60, end: T0 });
  assert.deepStrictEqual(M.suggestions(d, 'mail'), ['Mails sortieren', 'Mails beantworten']);
  assert.deepStrictEqual(M.suggestions(d, ''), ['Mails sortieren', 'Video schneiden', 'Mails beantworten']);
});
t('focus: run, pause, resume, break, stop books time', () => {
  const d = M.normalize({});
  const task = M.addTask(d, { title: 'Write', minutes: 50 }, T0);
  M.startFocus(d, task, T0);
  M.pauseFocus(d, T0 + 10 * MIN);
  assert.strictEqual(Math.round(M.focusStatus(d, T0 + 30 * MIN, 50).elapsed), 600);
  M.resumeFocus(d, T0 + 30 * MIN);
  assert.strictEqual(Math.round(M.focusStatus(d, T0 + 70 * MIN, 50).elapsed), 3000);
  assert.ok(M.focusStatus(d, T0 + 70 * MIN, 50).needBreak);
  M.snoozeBreak(d, T0 + 70 * MIN, 10);
  assert.ok(!M.focusStatus(d, T0 + 75 * MIN, 50).needBreak);
  M.startBreak(d, T0 + 80 * MIN, 10);
  const st = M.focusStatus(d, T0 + 85 * MIN, 50);
  assert.strictEqual(st.state, 'break'); assert.strictEqual(Math.round(st.breakLeft), 300); assert.ok(!st.breakOver);
  assert.ok(M.focusStatus(d, T0 + 91 * MIN, 50).breakOver);
  M.resumeFocus(d, T0 + 91 * MIN);
  assert.ok(!M.focusStatus(d, T0 + 100 * MIN, 50).needBreak);   // counter restarts after the break
  const s = M.stopFocus(d, T0 + 100 * MIN, true);
  assert.strictEqual(s.secs, 60 * 60 + 9 * 60); assert.ok(task.done); assert.strictEqual(task.worked, s.secs);
  assert.strictEqual(d.focus, null);
});
t('focus: a mis-tap is not history, new start ends the old one', () => {
  const d = M.normalize({});
  const a = M.addTask(d, { title: 'a' }, T0), b = M.addTask(d, { title: 'b' }, T0);
  M.startFocus(d, a, T0); M.startFocus(d, b, T0 + 5000);
  assert.strictEqual(d.sessions.length, 0); assert.strictEqual(d.focus.title, 'b');
  M.startFocus(d, a, T0 + 5 * MIN);
  assert.strictEqual(d.sessions.length, 1); assert.strictEqual(d.sessions[0].title, 'b');
});
t('stats: today and week incl. running focus', () => {
  const d = M.normalize({});
  d.sessions.push({ title: 'x', secs: 1800, end: T0 - 3 * 24 * 60 * MIN });   // Tuesday same week (T0 is Friday)
  d.sessions.push({ title: 'y', secs: 600, end: T0 - MIN });
  const a = M.addTask(d, { title: 'a' }, T0); M.startFocus(d, a, T0);
  const r = M.stats(d, T0 + 5 * MIN);
  assert.strictEqual(Math.round(r.todaySecs), 900); assert.strictEqual(Math.round(r.weekSecs), 2700); assert.strictEqual(r.sessionsToday, 1);
});
t('timer: run, ring, snooze, stop', () => {
  const d = M.normalize({});
  M.startTimer(d, ' Pizza ', 300, T0);
  assert.strictEqual(M.timerStatus(d, T0 + 60000).left, 240);
  assert.ok(M.timerStatus(d, T0 + 301000).ringing);
  M.snoozeTimer(d, T0 + 301000, 300);
  const s = M.timerStatus(d, T0 + 302000);
  assert.ok(!s.ringing); assert.strictEqual(Math.round(s.left), 299); assert.strictEqual(s.name, 'Pizza');
  M.stopTimer(d); assert.strictEqual(M.timerStatus(d, T0), null);
});
t('prune drops old finished tasks and caps sessions', () => {
  const d = M.normalize({});
  const a = M.addTask(d, { title: 'a' }, T0); M.setDone(d, a.id, true, T0 - 100 * 24 * 60 * MIN);
  for (let i = 0; i < 320; i++) d.sessions.push({ title: 's', secs: 60, end: T0 });
  M.prune(d, T0);
  assert.strictEqual(d.tasks.length, 0); assert.strictEqual(d.sessions.length, 300);
});
console.log(n + ' tests passed');

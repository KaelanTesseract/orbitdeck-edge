// End-to-end test against a Debug hub started with --test-autopair (own data folder, port 47823; PC commands,
// shortcut starts and sounds are only logged). Every change it makes is reverted before it ends.
// Usage: node tools/hub-probe.mjs
import http from 'node:http';

const BASE = 'http://localhost:' + (process.env.HUB_PORT || 47823);
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${extra ? '  ' + extra : ''}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function rawUpgrade(origin) {
  return new Promise((resolve) => {
    const req = http.request(`${BASE}/ws`, { headers: {
      Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13',
      'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==', Origin: origin } });
    req.on('response', res => resolve(res.statusCode));
    req.on('upgrade', () => resolve(101));
    req.on('error', () => resolve(-1));
    req.end();
  });
}

class Client {
  constructor() { this.msgs = []; this.waiters = []; }
  open() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${BASE.replace('http', 'ws')}/ws`);
      this.ws.onopen = resolve; this.ws.onerror = reject;
      this.ws.onmessage = (e) => {
        const m = JSON.parse(e.data); this.msgs.push(m);
        this.waiters = this.waiters.filter(w => { if (w.pred(m)) { w.resolve(m); return false; } return true; });
      };
    });
  }
  send(o) { this.ws.send(JSON.stringify(o)); }
  wait(pred, ms = 3000) {
    const found = this.msgs.find(pred);
    if (found) return Promise.resolve(found);
    return this.next(pred, ms);
  }
  next(pred, ms = 3000) {
    return new Promise((resolve) => {
      const w = { pred, resolve }; this.waiters.push(w);
      setTimeout(() => { this.waiters = this.waiters.filter(x => x !== w); resolve(null); }, ms);
    });
  }
  close() { this.ws.close(); }
}

// --- security
const health = await fetch(`${BASE}/health`).then(r => r.json()).catch(() => null);
check('health', health?.app === 'orbitdeck-edge-hub' && health?.proto === 1);
check('foreign website refused', await rawUpgrade('https://evil.example.com') === 403);
check('icon without key refused', (await fetch(`${BASE}/icon/x.png`)).status === 403);

// --- pairing and snapshot
const c = new Client();
await c.open();
c.send({ op: 'hello', proto: 1 });
const paired = await c.wait(m => m.t === 'paired', 5000);
check('paired (test mode)', !!paired?.token);
const welcome = await c.wait(m => m.t === 'welcome');
check('welcome with icon key', welcome?.proto === 1 && /^[0-9a-f]{32}$/.test(welcome?.iconKey || ''));
const snap = await c.wait(m => m.t === 'snapshot');
check('snapshot has audio/sys/shortcuts', !!snap?.audio && 'sys' in snap && Array.isArray(snap?.shortcuts));
check('audio: devices + master', snap?.audio?.devices?.length > 0 && typeof snap?.audio?.master?.volume === 'number',
  `${snap?.audio?.devices?.length} Geräte, Master ${snap?.audio?.master?.volume} %`);
// the first reading has no network speed yet (needs two samples one second apart)
const sys = snap?.sys?.net ? snap.sys : (await c.wait(m => m.t === 'sys' && m.data?.net, 3000))?.data;
check('sys: ram + net', sys?.ram?.total > 0 && sys?.net && typeof sys.net.down === 'number',
  `RAM ${(sys?.ram?.used / 2 ** 30).toFixed(1)}/${(sys?.ram?.total / 2 ** 30).toFixed(1)} GB, ↓${Math.round((sys?.net?.down || 0) / 1024)} KB/s`);

// --- master volume: +1/-1 and straight back
const before = snap.audio.master.volume;
const probe = before >= 99 ? before - 1 : before + 1;
c.send({ op: 'setVolume', target: 'master', value: probe });
const changed = await c.next(m => m.t === 'audio' && m.data?.master?.volume === probe, 3000);
check('master volume set + broadcast', !!changed);
c.send({ op: 'setVolume', target: 'master', value: before });
check('master volume restored', !!await c.next(m => m.t === 'audio' && m.data?.master?.volume === before, 3000), `${before} %`);

// --- microphone mute: toggle and back
if (snap.audio.mic) {
  const m0 = snap.audio.mic.mute;
  c.send({ op: 'setMute', target: 'mic', mute: !m0 });
  check('mic mute toggled', !!await c.next(m => m.t === 'audio' && m.data?.mic?.mute === !m0, 3000));
  c.send({ op: 'setMute', target: 'mic', mute: m0 });
  check('mic mute restored', !!await c.next(m => m.t === 'audio' && m.data?.mic?.mute === m0, 3000));
}

// --- bad input
c.send({ op: 'setVolume', target: 'master', value: 150 });
check('volume 150 rejected', (await c.next(m => m.t === 'error'))?.code === 'bad_value');
c.send({ op: 'setVolume', target: 'app:chrome', value: 10 });
check('unknown target rejected', (await c.next(m => m.t === 'error'))?.code === 'bad_target');
c.send({ op: 'format' });
check('unknown op rejected', (await c.next(m => m.t === 'error'))?.code === 'unknown_op');

// --- visualizer
c.send({ op: 'visualizer', on: true });
const frame = await c.next(m => m.t === 'v', 4000);
check('visualizer frame', frame?.b?.length === 48, frame ? `max ${Math.max(...frame.b)}` : '');
c.send({ op: 'visualizer', on: false });
await sleep(400);

// --- shortcuts
const tList = Date.now();
c.send({ op: 'listApps' });
const apps = await c.next(m => m.t === 'apps', 20000);
const appList = (apps?.list || []).filter(a => a.kind === 'app');
check('app list (All apps)', appList.length > 10, `${appList.length} Programme in ${Date.now() - tList} ms`);
const firstIcon = appList.find(a => a.icon);
const iconRes = firstIcon ? await fetch(`${welcome.iconBase}${firstIcon.icon}.png?k=${welcome.iconKey}`) : null;
check('picker icon made on request', iconRes?.status === 200, firstIcon?.name);
const pick = appList.find(a => /notepad|editor|rechner|calculator/i.test(a.name)) || appList[0];
const startCount = snap.shortcuts.length;
c.send({ op: 'shortcuts.add', kind: 'app', ref: pick.ref });
let sc = await c.next(m => m.t === 'shortcuts' && m.list.length === startCount + 1, 3000);
check('add app shortcut', !!sc, pick.name);
c.send({ op: 'shortcuts.add', kind: 'folder', ref: 'downloads' });
sc = await c.next(m => m.t === 'shortcuts' && m.list.length === startCount + 2, 3000);
c.send({ op: 'shortcuts.add', kind: 'url', url: 'example.com' });
sc = await c.next(m => m.t === 'shortcuts' && m.list.length === startCount + 3, 3000);
check('add folder + url', !!sc && sc.list.some(s => s.url === 'https://example.com/'));
c.send({ op: 'shortcuts.add', kind: 'app', ref: 'C:\\Windows\\System32\\cmd.exe' });
check('app outside the list rejected', (await c.next(m => m.t === 'error'))?.code === 'not_found');
c.send({ op: 'shortcuts.add', kind: 'url', url: 'javascript:alert(1)' });
check('javascript url rejected', (await c.next(m => m.t === 'error'))?.code === 'bad_value');
const appSc = (await c.next(m => m.t === 'shortcuts' && m.list.some(s => s.kind === 'app' && s.icon), 6000))?.list.find(s => s.kind === 'app');
if (appSc) {
  const icon = await fetch(`${welcome.iconBase}${appSc.id}.png?k=${welcome.iconKey}`);
  const bytes = new Uint8Array(await icon.arrayBuffer());
  check('shortcut icon png', icon.status === 200 && bytes[1] === 0x50 && bytes[2] === 0x4e, `${bytes.length} Bytes`);
} else check('shortcut icon png', false, 'kein Icon');
const ids = (c.msgs.filter(m => m.t === 'shortcuts').at(-1)?.list || []).slice(startCount).map(s => s.id);
let mark = c.msgs.length;
c.send({ op: 'run', id: ids[2] });
await sleep(300);
check('run (logged only in test mode)', !c.msgs.slice(mark).some(m => m.t === 'error'));
c.send({ op: 'shortcuts.move', id: ids[2], to: 0 });
check('move', (await c.next(m => m.t === 'shortcuts'))?.list?.[0]?.id === ids[2]);
for (const id of ids) c.send({ op: 'shortcuts.remove', id });
check('shortcuts removed again', !!await c.next(m => m.t === 'shortcuts' && m.list.length === startCount, 3000));

// --- power, sound, iCUE (test mode: nothing really happens)
mark = c.msgs.length;
c.send({ op: 'power', action: 'shutdown' });
await sleep(300);
check('power shutdown accepted (dry run)', !c.msgs.slice(mark).some(m => m.t === 'error'));
c.send({ op: 'power', action: 'format' });
check('unknown power action rejected', (await c.next(m => m.t === 'error'))?.code === 'bad_value');
mark = c.msgs.length;
c.send({ op: 'sound', name: 'alarm' });
await sleep(200);
check('sound accepted (muted in test mode)', !c.msgs.slice(mark).some(m => m.t === 'error'));

// --- backup
c.send({ op: 'backup.save', data: { v: 1, tasks: [{ title: 'Probe' }] } });
await sleep(200);
c.send({ op: 'backup.load' });
const bk = await c.next(m => m.t === 'backup');
check('backup round trip', bk?.data?.tasks?.[0]?.title === 'Probe');
c.send({ op: 'backup.save', data: { big: 'x'.repeat(250 * 1024) } });
check('backup of 250 KB accepted', !(await c.next(m => m.t === 'error', 800)));
c.send({ op: 'backup.save', data: { big: 'x'.repeat(270 * 1024) } });
check('backup over 256 KB rejected', (await c.next(m => m.t === 'error', 4000))?.code === 'too_big');
c.send({ op: 'backup.save', data: { big: 'x'.repeat(400 * 1024) } });
check('message over 320 KB rejected, connection stays', (await c.next(m => m.t === 'error', 4000))?.code === 'too_big');
c.send({ op: 'backup.save', data: { v: 1 } });
check('still connected after that', !(await c.next(m => m.t === 'error', 800)) && c.ws.readyState === 1);

// --- second connection with the token: no new pairing
const c2 = new Client();
await c2.open();
c2.send({ op: 'hello', proto: 1, token: paired.token });
check('reconnect with token', !!await c2.wait(m => m.t === 'snapshot') && !c2.msgs.some(m => m.t === 'pair_pending'));
c2.close();
c.close();

console.log(`\n${pass} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);

// Docs/tests only: adds a few shortcuts to a Debug hub started with --test-autopair (port 47823).
const ws = new WebSocket('ws://localhost:' + (process.env.HUB_PORT || 47823) + '/ws'); const msgs = [];
ws.onmessage = e => msgs.push(JSON.parse(e.data));
await new Promise(r => ws.onopen = r);
ws.send(JSON.stringify({ op: 'hello', proto: 1 }));
await new Promise(r => setTimeout(r, 800));
ws.send(JSON.stringify({ op: 'listApps' }));
for (let i = 0; i < 150 && !msgs.some(m => m.t === 'apps'); i++) await new Promise(r => setTimeout(r, 200));
const apps = msgs.find(m => m.t === 'apps').list;
const want = [/^Google Chrome$/, /^Spotify/, /^Discord$/, /^Steam$/, /^Obsidian$/, /^(Rechner|Calculator)$/, /^Visual Studio Code$/, /^(Editor|Notepad)$/];
for (const n of want) { const a = apps.find(x => x.kind === 'app' && n.test(x.name)); if (a) ws.send(JSON.stringify({ op: 'shortcuts.add', kind: 'app', ref: a.ref })); }
ws.send(JSON.stringify({ op: 'shortcuts.add', kind: 'folder', ref: 'downloads' }));
ws.send(JSON.stringify({ op: 'shortcuts.add', kind: 'url', url: 'youtube.com', name: 'YouTube' }));
await new Promise(r => setTimeout(r, 3000));
console.log((msgs.filter(m => m.t === 'shortcuts').at(-1)?.list || []).map(s => s.name + (s.icon ? '*' : '')).join(', '));
ws.close();

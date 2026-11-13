// node tests/i18n-keys.test.js – every t('key') and data-t="key" used in the widget exists in German and English.
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'widget');
global.document = { documentElement: {} };
global.navigator = { language: 'en' };
// dev-only test: loads our own i18n.js (no external input) into this Node process
eval(fs.readFileSync(path.join(dir, 'scripts', 'i18n.js'), 'utf8').replace('var OrbitI18n', 'global.OrbitI18n'));

const files = fs.readdirSync(path.join(dir, 'scripts')).filter((f) => f.endsWith('.js') && f !== 'textures.js')
  .map((f) => path.join(dir, 'scripts', f)).concat(path.join(dir, 'index.html'));
const src = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
const keys = new Set();
for (const m of src.matchAll(/\bt\('([A-Za-z_0-9]+)'\)/g)) keys.add(m[1]);
for (const m of src.matchAll(/data-t="([A-Za-z_0-9]+)"/g)) keys.add(m[1]);
// keys built at runtime
['prio0', 'prio1', 'prio2', 'cpuLoad', 'cpuTemp', 'gpuLoad', 'gpuTemp',
 'sys_ram', 'sys_network', 'sys_lock', 'sys_taskmgr', 'sys_restart', 'sys_shutdown',
 'hubReady', 'hubPairPending', 'hubDenied', 'hubProto', 'hubLost', 'hubMissing', 'hubDemo', 'hubPairHint', 'hubDeniedHint', 'hubMissingHint',
 'pick_apps', 'pick_folders', 'pick_url', 'name', 'tooMany', 'badUrl', 'scFailed'].forEach((k) => keys.add(k));

const missing = [];
for (const k of keys) for (const l of ['de', 'en']) if (!OrbitI18n.has(k, l)) missing.push(l + ':' + k);
if (missing.length) { console.error('missing: ' + missing.join(' ')); process.exit(1); }
console.log(keys.size + ' keys, all present in de and en');

// Orbitdeck spike – measures the WebGL scene on the XENEON EDGE and tests text input and sound.
// Results show on screen and go to the iCUE log as "Orbitdeck spike:" lines (console.error).

icueEvents = {
  onDataUpdated: applyColors,
  onICUEInitialized: applyColors
};

var $ = function (id) { return document.getElementById(id); };
function log(msg) { try { console.error('Orbitdeck spike: ' + msg); } catch (e) {} }

function prop(name) {
  try { var v = Function('return typeof ' + name + ' !== "undefined" ? ' + name + ' : undefined')(); return v; } catch (e) { return undefined; }
}
function hexToRgb(h) {
  var m = /^#?([0-9a-f]{6})/i.exec(h || ''); if (!m) return null;
  var n = parseInt(m[1], 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
function applyColors() {
  var text = prop('textColor'), accent = prop('accentColor');
  if (/^#/.test(text || '')) document.documentElement.style.setProperty('--text', text);
  if (/^#/.test(accent || '')) { document.documentElement.style.setProperty('--accent', accent); if (scene) scene.setAccent(hexToRgb(accent)); }
}

// ---------- scene + loop ----------

var scene = null, glInfo = {}, startErr = '';
try { scene = OrbitScene.create($('scene'), window.ORBIT_TEXTURES); glInfo = scene.info(); } catch (e) { startErr = String(e.message || e); log('WebGL error ' + startErr); }

var ROCKS = [0, 1200, 2400, 4800], SCALES = [1, 0.75, 0.5];
var ignoreLimit = true;   // Edge test 0.0.2: iCUE suggests 10 fps but renders 60 when asked
var fpsLimit = function () { var f = typeof iCUE !== 'undefined' && iCUE.fpsLimit > 0 ? iCUE.fpsLimit : 0; return f; };
var stats = { frames: 0, since: performance.now(), fps: 0, syncMs: 0, syncN: 0, syncSum: 0, cpuSum: 0, cpuMs: 0 };
var last = 0, t0 = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  var lim = ignoreLimit ? 0 : fpsLimit();
  if (lim && now - last < 1000 / lim - 2) return;
  last = now;
  if (!scene) return;
  var c0 = performance.now();
  scene.draw((now - t0) / 1000);
  vizFrame((now - t0) / 1000);
  stats.cpuSum += performance.now() - c0;
  stats.frames++;
  if (stats.frames % 10 === 0) {           // every 10th frame: wait for the GPU to measure the real draw time
    var s0 = performance.now(); scene.sync(); stats.syncSum += performance.now() - s0 + (s0 - c0); stats.syncN++;
  }
  if (now - stats.since >= 1000) {
    stats.fps = stats.frames * 1000 / (now - stats.since);
    stats.cpuMs = stats.cpuSum / Math.max(1, stats.frames);
    stats.syncMs = stats.syncN ? stats.syncSum / stats.syncN : 0;
    stats.frames = 0; stats.cpuSum = 0; stats.syncSum = 0; stats.syncN = 0; stats.since = now;
    onSecond();
  }
}

function hud() {
  var chrome = (/Chrome\/([\d.]+)/.exec(navigator.userAgent) || [])[1] || '?';
  $('hud').textContent = startErr ? 'WebGL FEHLER: ' + startErr :
    'FPS ' + stats.fps.toFixed(1) + '   GPU-Zeit ' + stats.syncMs.toFixed(1) + ' ms   JS ' + stats.cpuMs.toFixed(2) + ' ms\n' +
    'Aufloesung ' + Math.round(scene.scale * 100) + ' %   Brocken ' + scene.rocks + '   Glas ' + (glassOpen ? 'an' : 'aus') + '\n' +
    'Flaeche ' + innerWidth + 'x' + innerHeight + ' @' + devicePixelRatio + '   fpsLimit ' + (fpsLimit() || '-') +
    '   ignoriert ' + ignoreLimit + '   Vorschau ' + (typeof iCUE !== 'undefined' ? iCUE.isPreview : '-') + '\n' +
    'GPU ' + glInfo.renderer + '\nWebGL2 ' + glInfo.gl2 + '   HDR ' + glInfo.hdr + '   Bloom ' + scene.bloom +
    '   Texturen ' + (scene.ready ? 'ok' : (scene.loadError || 'laden ...')) + '\nChrome ' + chrome;
}

var lastLog = 0;
function onSecond() {
  hud();
  if (bench) benchTick();
  if (performance.now() - lastLog > 10000) {
    lastLog = performance.now();
    log('fps=' + stats.fps.toFixed(1) + ' gpu=' + stats.syncMs.toFixed(1) + 'ms js=' + stats.cpuMs.toFixed(2) + 'ms scale=' + scene.scale +
        ' rocks=' + scene.rocks + ' glass=' + glassOpen + ' size=' + innerWidth + 'x' + innerHeight + ' limit=' + fpsLimit() +
        ' gpu=' + glInfo.renderer);
  }
}

// ---------- clock ----------

var focusStart = Date.now() - (1 * 3600 + 42 * 60 + 18) * 1000;   // demo focus session
function clock() {
  var d = new Date();
  $('time').textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  $('weekday').textContent = d.toLocaleDateString('de-DE', { weekday: 'long' }).toUpperCase();
  $('date').textContent = (d.getDate() + '. ' + d.toLocaleDateString('de-DE', { month: 'long' }) + ' ' + d.getFullYear()).toUpperCase();
  var sec = Math.floor((Date.now() - focusStart) / 1000);
  $('focusElapsed').textContent = Math.floor(sec / 3600) + ':' + String(Math.floor(sec / 60) % 60).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
  $('focusBar').style.width = Math.min(100, sec / 288) + '%';
}

// ---------- demo visualizer (the real bands come from the hub later) ----------

var VIZ_N = 64, vizBars = [], vizLevels = new Float32Array(VIZ_N);
for (var vi = 0; vi < VIZ_N; vi++) { var bar = document.createElement('i'); $('viz').appendChild(bar); vizBars.push(bar); }
function vizFrame(t) {
  for (var i = 0; i < VIZ_N; i++) {
    var x = i / VIZ_N, env = Math.exp(-Math.pow((x - 0.32) * 3.2, 2)) * 0.9 + Math.exp(-Math.pow((x - 0.7) * 5, 2)) * 0.5;
    var beat = Math.pow(Math.max(0, Math.sin(t * 7.5)), 6) * 0.35;
    var v = env * (0.35 + 0.35 * Math.sin(t * 3.1 + i * 0.9) * Math.sin(t * 1.7 + i * 0.37) + beat) + Math.random() * 0.08 * env;
    vizLevels[i] = Math.max(v, vizLevels[i] * 0.7);
    vizBars[i].style.height = Math.max(4, Math.min(100, vizLevels[i] * 100)) + '%';
  }
}
clock(); setInterval(clock, 1000);

// ---------- buttons ----------

var glassOpen = false;
function setGlass(on) { glassOpen = on; $('glass').classList.toggle('open', on); $('bGlass').classList.toggle('on', on); }
function label() {
  if (!scene) return;
  $('bRocks').textContent = 'Brocken ' + scene.rocks;
  $('bScale').textContent = 'Auflösung ' + Math.round(scene.scale * 100) + ' %';
  $('bLimit').textContent = ignoreLimit ? 'FPS-Limit ignoriert' : 'FPS-Limit aktiv (' + (fpsLimit() || '-') + ')';
  $('bLimit').classList.toggle('on', ignoreLimit);
  $('bBloom').textContent = 'Bloom ' + (scene.bloom ? 'an' : 'aus'); $('bBloom').classList.toggle('on', scene.bloom);
}
$('bRocks').onclick = function () { scene.setRocks(ROCKS[(ROCKS.indexOf(scene.rocks) + 1) % ROCKS.length]); label(); };
$('bScale').onclick = function () { scene.setScale(SCALES[(SCALES.indexOf(scene.scale) + 1) % SCALES.length]); label(); };
$('bGlass').onclick = function () { setGlass(!glassOpen); };
$('testToggle').onclick = function () { document.body.classList.toggle('testmode'); };
$('bLimit').onclick = function () { ignoreLimit = !ignoreLimit; label(); };
$('bBloom').onclick = function () { scene.setBloom(!scene.bloom); label(); };
$('bInput').onclick = function () {
  var box = $('inputTest'); box.hidden = !box.hidden; setGlass(!box.hidden || glassOpen);
  $('bInput').classList.toggle('on', !box.hidden);
};

var inp = $('testInput'), keys = [];
inp.addEventListener('focus', function () { log('input focus, viewport ' + (window.visualViewport ? visualViewport.height : '-')); });
inp.addEventListener('keydown', function (e) { keys.push(e.key); keys = keys.slice(-12); $('keyLog').textContent = 'Tasten: ' + keys.join(' '); });
inp.addEventListener('input', function () { log('input value "' + inp.value + '"'); });
if (window.visualViewport) visualViewport.addEventListener('resize', function () { log('viewport resize ' + visualViewport.width + 'x' + visualViewport.height); });

// ---------- sound test: Web Audio and <audio>, without a speaker permission in the manifest ----------

$('bSound').onclick = function () {
  var out = [];
  try {
    var Ctx = window.AudioContext || window.webkitAudioContext; var ctx = new Ctx();
    var o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 880; g.gain.value = 0.15;
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.25);
    out.push('WebAudio ' + ctx.state);
    setTimeout(function () { log('sound webaudio state=' + ctx.state); }, 400);
  } catch (e) { out.push('WebAudio Fehler ' + e.message); }
  try {
    var a = new Audio(wavBeep()); a.volume = 0.3;
    setTimeout(function () {
      a.play().then(function () { log('sound audio-element ok'); $('bSound').textContent = 'Ton: ' + out.join(', ') + ', Audio ok'; })
        .catch(function (e) { log('sound audio-element ' + e.name); $('bSound').textContent = 'Ton: ' + out.join(', ') + ', Audio ' + e.name; });
    }, 500);
  } catch (e) { out.push('Audio Fehler ' + e.message); }
  $('bSound').textContent = 'Ton: ' + out.join(', ');
};
function wavBeep() {
  var rate = 22050, n = Math.floor(rate * 0.25), buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  function s(o, str) { for (var i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); }
  s(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); s(8, 'WAVE'); s(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  s(36, 'data'); v.setUint32(40, n * 2, true);
  for (var i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.sin(i / rate * 2 * Math.PI * 660) * 9000 * (1 - i / n), true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

// ---------- benchmark: every combination for 4 s, first second ignored ----------

var bench = null;
$('bBench').onclick = function () {
  if (bench) return;
  var combos = [];
  SCALES.forEach(function (sc) { [0, 2400].forEach(function (r) { [false, true].forEach(function (g) { combos.push({ sc: sc, r: r, g: g }); }); }); });
  bench = { combos: combos, i: -1, sec: 0, rows: [], fps: [], gpu: [] };
  $('result').hidden = false; $('result').textContent = 'Messreihe laeuft ... (' + combos.length * 4 + ' s)';
  nextCombo();
};
function nextCombo() {
  bench.i++; bench.sec = 0; bench.fps = []; bench.gpu = [];
  if (bench.i >= bench.combos.length) { finishBench(); return; }
  var c = bench.combos[bench.i]; scene.setScale(c.sc); scene.setRocks(c.r); setGlass(c.g); label();
}
function benchTick() {
  bench.sec++;
  if (bench.sec > 1) { bench.fps.push(stats.fps); bench.gpu.push(stats.syncMs); }
  if (bench.sec >= 4) {
    var c = bench.combos[bench.i], avg = function (a) { return a.reduce(function (x, y) { return x + y; }, 0) / a.length; };
    var row = (c.sc * 100 + '%').padEnd(5) + String(c.r).padStart(5) + (c.g ? '  Glas' : '      ') +
      '  ' + avg(bench.fps).toFixed(1).padStart(5) + ' fps  ' + avg(bench.gpu).toFixed(1).padStart(5) + ' ms';
    bench.rows.push(row); log('bench ' + row.replace(/\s+/g, ' '));
    $('result').textContent = 'Aufl. Brocken  Glas   FPS     GPU\n' + bench.rows.join('\n');
    nextCombo();
  }
}
function finishBench() {
  $('result').textContent = 'Aufl. Brocken  Glas   FPS     GPU\n' + bench.rows.join('\n') + '\n(fertig, Tippen schliesst)';
  $('result').onclick = function () { $('result').hidden = true; };
  bench = null; scene.setScale(1); scene.setRocks(2400); setGlass(false); label();
}

label(); hud(); applyColors();
log('start ' + innerWidth + 'x' + innerHeight + ' gpu=' + glInfo.renderer + ' ua=' + navigator.userAgent);
requestAnimationFrame(frame);

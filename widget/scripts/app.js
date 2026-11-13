// Orbitdeck Edge widget – scene, clock, dock, glass panels, movie mode and on-screen options.
// Scene settings come from iCUE; clock and movie mode options are set on screen and stored per widget.

// iCUE API binding – bare assignment is intentional (see lifecycle reference).
icueEvents = {
  onDataUpdated: onIcueDataUpdated,
  onICUEInitialized: onIcueInitialized
};

var VERSION = '0.9.0';
var t = OrbitI18n.t;
var $ = function (id) { return document.getElementById(id); };

var ROCKS = { full: 2400, less: 1200, minimal: 400 };
var QUALITY = { high: 1, medium: 0.75, low: 0.5 };
var FPS = { smooth: 60, saver: 30 };
var PANEL_IDLE_MS = 30000;          // an open panel closes itself after this long without a touch
var HOLD_MS = 1500;                 // press-and-hold for destructive actions
var DEFAULT_ACCENT = '#f0a24a', DEFAULT_TEXT = '#f6f1e8', DEFAULT_GLASS = '#0a0b10';

var app = {
  started: false,
  scene: null,
  fps: 60,
  movie: false,
  panel: null,
  panelTimer: 0,
  options: null,
  data: null,          // tasks, sessions, focus, timer (OrbitModel)
  demo: false
};

function log(msg) { try { console.error('Orbitdeck: ' + msg); } catch (e) { /* no console */ } }

// ---------- iCUE properties ----------

function getIcueProperty(name) {
  if (typeof window !== 'undefined' && Object.prototype.hasOwnProperty.call(window, name)) {
    var value = window[name];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  try {
    var v = Function('return typeof ' + name + ' !== "undefined" ? ' + name + ' : undefined')();
    if (v !== undefined && v !== null && v !== '') return v;
  } catch (e) { /* not defined */ }
  return undefined;
}
function flag(name, d) {
  var v = getIcueProperty(name);
  if (v === undefined) return d;
  return v === true || v === 'true' || v === 1 || v === '1';
}
function choice(name, allowed, d) {
  var v = String(getIcueProperty(name));
  return allowed.indexOf(v) >= 0 ? v : d;
}
function clampRange(v, min, max, d) {
  v = Number(v);
  return isFinite(v) ? Math.max(min, Math.min(max, v)) : d;
}
function colorProperty(name, fallback) {
  var v = getIcueProperty(name);
  return typeof v === 'string' && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v) ? v.slice(0, 7) : fallback;
}
function hexToRgb(hex) {
  var n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Colours and transparency only count when "Custom style" is on: with it off iCUE sends the page colours
 * (e.g. white text, 80 % transparency), which would wash out the scene. Verified with Mixdeck/Voicedeck, iCUE 5.52.
 */
function customStyleOn() {
  var v = getIcueProperty('widgetPersonalizationCustomStyleEnabled');
  return v === true || v === 'true';
}

function applyIcueSettings() {
  var style = document.documentElement.style;
  var custom = customStyleOn();
  var accent = custom ? colorProperty('accentColor', DEFAULT_ACCENT) : DEFAULT_ACCENT;
  var text = custom ? colorProperty('textColor', DEFAULT_TEXT) : DEFAULT_TEXT;
  var glass = custom ? colorProperty('backgroundColor', DEFAULT_GLASS) : DEFAULT_GLASS;
  var transparency = custom ? clampRange(getIcueProperty('transparency'), 0, 100, 0) : 0;
  style.setProperty('--accent', accent);
  style.setProperty('--text', text);
  style.setProperty('--glass-tint', hexToRgb(glass).join(', '));
  style.setProperty('--scene-opacity', String(1 - transparency / 100));

  app.fps = FPS[choice('motion', ['smooth', 'saver'], 'smooth')];
  var scene = app.scene;
  if (!scene) return;
  var q = /[?&]scene=(\w+)/.exec(location.search);   // browser tests only
  scene.setScene(q ? q[1] : choice('scene', OrbitScene.scenes, 'ringworld'));
  scene.setSpin(Number(choice('spin', ['90', '180', '300', '600', '0'], '300')));
  var rocks = ROCKS[choice('rocks', ['full', 'less', 'minimal'], 'full')];
  if (scene.rocks !== rocks) scene.setRocks(rocks);
  scene.setScale(QUALITY[choice('quality', ['high', 'medium', 'low'], 'high')]);
  scene.setBloom(flag('glow', true));
  // the shader mixes the accent in gently; mid grey means "no tint"
  var rgb = hexToRgb(accent);
  scene.setAccent(flag('tintScene', false) ? [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255] : [0.5, 0.5, 0.5]);
}

// ---------- per-widget storage ----------

function storageKey() {
  var id = getIcueProperty('uniqueId');
  return 'orbitdeck:' + (typeof id === 'string' && id ? id : 'browser');
}
function defaultOptions() {
  return { clock24: OrbitI18n.lang !== 'en', showWeekday: true, showDate: true, movieBrightness: 10, breakEvery: 50, breakLen: 10, micReminder: 0 };
}
/** Loads options and the task data. Everything of one widget lives under one key. */
function loadStore() {
  var o = defaultOptions(), store = null;
  try {
    var raw = localStorage.getItem(storageKey());
    store = raw ? JSON.parse(raw) : null;
  } catch (e) { /* storage unavailable or broken – defaults */ }
  if (store && store.options && typeof store.options === 'object') {
    Object.keys(o).forEach(function (k) { if (typeof store.options[k] === typeof o[k]) o[k] = store.options[k]; });
  }
  app.options = o;
  app.data = OrbitModel.normalize(store && store.data);
  OrbitModel.prune(app.data, Date.now());
}
var saveTimer = 0;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(function () {
    try {
      localStorage.setItem(storageKey(), JSON.stringify({ v: 1, options: app.options, data: app.data }));
    } catch (e) { log('not saved: ' + e.message); }
    OrbitHub.scheduleBackup();
  }, 150);
}
function dataIsEmpty() { return !app.data.tasks.length && !app.data.sessions.length; }
/** The hub's backup arrives (only asked for when this widget's storage is empty, e.g. after re-importing it). */
function restoreBackup(backup) {
  if (!dataIsEmpty() || !backup || !backup.data) return;
  var restored = OrbitModel.normalize(backup.data);
  if (!restored.tasks.length && !restored.sessions.length) return;
  app.data = restored;
  save();
  OrbitPanels.render();
  toast(t('restored'));
  log('tasks restored from hub backup');
}
function saveOptions() { save(); }
function resetAll() {
  try { localStorage.removeItem(storageKey()); } catch (e) { /* nothing stored */ }
  app.options = defaultOptions();
  app.data = OrbitModel.normalize(null);
  applyOptions();
  OrbitPanels.render();
  toast(t('resetDone'));
}

// ---------- hub status (options panel) ----------

function renderHubStatus(conn) {
  var key = { ready: 'hubReady', pair_pending: 'hubPairPending', pair_denied: 'hubDenied', proto_mismatch: 'hubProto', lost: 'hubLost' }[conn] || 'hubMissing';
  if (app.demo && conn !== 'ready') key = 'hubDemo';
  $('hubState').textContent = t(key);
  $('hubState').dataset.state = conn;
  $('hubHint').textContent = conn === 'ready' || app.demo ? '' : t(conn === 'pair_pending' ? 'hubPairHint' : conn === 'pair_denied' ? 'hubDeniedHint' : 'hubMissingHint');
  $('hubAsk').hidden = conn !== 'pair_denied';
  $('openIcue').hidden = conn !== 'ready';
  $('root').classList.toggle('hub-ready', conn === 'ready');
}

// ---------- clock ----------

var lastClock = '';
function updateClock() {
  var d = new Date();
  var o = app.options;
  var h = d.getHours(), m = String(d.getMinutes()).padStart(2, '0');
  var time, ampm = '';
  if (o.clock24) time = String(h).padStart(2, '0') + ':' + m;
  else { time = ((h + 11) % 12 + 1) + ':' + m; ampm = h < 12 ? t('am') : t('pm'); }
  var locale = OrbitI18n.lang === 'de' ? 'de-DE' : 'en-US';
  var weekday = d.toLocaleDateString(locale, { weekday: 'long' }).toUpperCase();
  var month = d.toLocaleDateString(locale, { month: 'long' }).toUpperCase();
  var date = OrbitI18n.lang === 'de' ? d.getDate() + '. ' + month + ' ' + d.getFullYear() : month + ' ' + d.getDate() + ', ' + d.getFullYear();
  var key = time + ampm + weekday + date;
  if (key === lastClock) return;
  lastClock = key;
  OrbitGlyphs.render($('time'), time, { tracking: 22, stroke: 9 });
  $('ampm').textContent = ampm;
  OrbitGlyphs.render($('weekday'), weekday, { tracking: 100, stroke: 13, cap: 'butt' });
  $('date').textContent = date;
}

// ---------- render loop (own frame rate: iCUE.fpsLimit is only a suggestion, measured 2026-11-13) ----------

var t0 = performance.now(), lastFrame = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (!app.scene || app.movie || document.hidden) return;
  if (now - lastFrame < 1000 / app.fps - 2) return;
  lastFrame = now;
  try {
    app.scene.draw((now - t0) / 1000);
  } catch (e) {
    log('draw failed ' + e.message);
    showFallback();
  }
  if (app.scene && app.scene.ready && $('root').classList.contains('loading')) $('root').classList.remove('loading');
  if (app.scene && app.scene.loadError) { log('textures ' + app.scene.loadError); showFallback(); }
}

function showFallback() {
  app.scene = null;
  $('scene').hidden = true;
  $('fallback').hidden = false;
  $('root').classList.remove('loading');
}

// ---------- panels ----------

function openPanel(name) {
  if (app.panel === name) { closePanel(); return; }
  app.panel = name;
  Array.prototype.forEach.call(document.querySelectorAll('.panel'), function (p) {
    p.classList.toggle('open', p.getAttribute('data-panel') === name);
  });
  Array.prototype.forEach.call(document.querySelectorAll('.dock-btn'), function (b) {
    b.classList.toggle('on', b.getAttribute('data-open') === name);
  });
  $('root').classList.add('panel-open');
  touchPanel();
  if (name === 'tasks' || name === 'calendar') OrbitPanels.onOpen(name);
  if (name === 'system') OrbitSystem.onOpen();
  if (name === 'music') { OrbitMusic.render(); OrbitMusic.renderSound(); }
  if (name === 'shortcuts') OrbitShortcuts.onOpen();
}
function closePanel() {
  OrbitKeyboard.close();
  app.panel = null;
  clearTimeout(app.panelTimer);
  Array.prototype.forEach.call(document.querySelectorAll('.panel.open, .dock-btn.on'), function (el) {
    el.classList.remove('open'); el.classList.remove('on');
  });
  $('root').classList.remove('panel-open');
}
function touchPanel() {
  clearTimeout(app.panelTimer);
  if (app.panel) app.panelTimer = setTimeout(function () {
    if (OrbitKeyboard.isOpen()) touchPanel(); else closePanel();   // never close under someone typing
  }, PANEL_IDLE_MS);
}

// ---------- movie mode ----------

function setMovie(on) {
  app.movie = on;
  if (on) closePanel();
  document.documentElement.style.setProperty('--movie-dim', String(1 - app.options.movieBrightness / 100));
  $('root').classList.toggle('movie-on', on);
}

// ---------- options panel ----------

function applyOptions() {
  var o = app.options;
  $('root').classList.toggle('no-weekday', !o.showWeekday);
  $('root').classList.toggle('no-date', !o.showDate);
  Array.prototype.forEach.call(document.querySelectorAll('[data-opt]'), function (b) {
    var on = !!o[b.getAttribute('data-opt')];
    b.classList.toggle('on', on);
    b.setAttribute('role', 'switch');
    b.setAttribute('aria-checked', String(on));
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-opt-seg] button'), function (b) {
    var key = b.parentNode.getAttribute('data-opt-seg');
    b.classList.toggle('on', String(o[key]) === b.getAttribute('data-value'));
  });
  lastClock = '';
  updateClock();
}

function bindHold(button, action) {
  var timer = 0;
  function start(e) {
    e.preventDefault();
    button.classList.add('holding');
    timer = setTimeout(function () { button.classList.remove('holding'); timer = 0; action(); }, HOLD_MS);
  }
  function cancel() {
    if (!timer) return;
    clearTimeout(timer); timer = 0;
    button.classList.remove('holding');
    toast(t('holdLonger'));
  }
  button.addEventListener('pointerdown', start);
  button.addEventListener('pointerup', cancel);
  button.addEventListener('pointerleave', cancel);
  button.addEventListener('pointercancel', cancel);
}

/** Small API for the feature modules. */
var OrbitApp = { toast: function (text) { toast(text); } };

var toastTimer = 0;
function toast(text) {
  var el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
}

function bindUi() {
  Array.prototype.forEach.call(document.querySelectorAll('[data-open]'), function (b) {
    b.addEventListener('click', function () { openPanel(b.getAttribute('data-open')); });
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (b) {
    b.addEventListener('click', closePanel);
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-opt]'), function (b) {
    b.addEventListener('click', function () {
      var k = b.getAttribute('data-opt');
      app.options[k] = !app.options[k];
      saveOptions(); applyOptions();
    });
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-opt-seg] button'), function (b) {
    b.addEventListener('click', function () {
      app.options[b.parentNode.getAttribute('data-opt-seg')] = Number(b.getAttribute('data-value'));
      saveOptions(); applyOptions();
    });
  });
  bindHold($('resetBtn'), resetAll);
  $('hubAsk').addEventListener('click', function () { OrbitHub.requestPairing(); });
  $('openIcue').addEventListener('click', function () { OrbitHub.send({ op: 'openIcue' }); });
  $('movieBtn').addEventListener('click', function (e) { e.stopPropagation(); setMovie(true); });
  $('movie').addEventListener('pointerdown', function (e) { e.preventDefault(); setMovie(false); });

  // a touch outside the open panel (and outside the dock) closes it; any touch keeps it open longer
  $('root').addEventListener('pointerdown', function (e) {
    if (!app.panel) return;
    touchPanel();
    if (e.target.closest('.panel, .dock, .movie-btn, .card, .notice, .kb')) return;
    closePanel();
  });
}

// ---------- lifecycle ----------

function start() {
  if (app.started) return;
  app.started = true;
  var lang = typeof iCUE !== 'undefined' && iCUE.iCUELanguage ? iCUE.iCUELanguage : navigator.language;
  var q = /[?&]lang=(\w+)/.exec(location.search);   // browser tests only
  OrbitI18n.setLanguage(q ? q[1] : lang);
  OrbitI18n.apply();
  $('version').textContent = 'Orbitdeck Edge ' + VERSION;
  app.demo = /[?&]demo(&|$)/.test(location.search);   // browser tests only: sample track and sensors
  loadStore();

  try {
    app.scene = OrbitScene.create($('scene'), window.ORBIT_TEXTURES);
    var info = app.scene.info();
    log('start ' + innerWidth + 'x' + innerHeight + ' webgl2=' + info.gl2 + ' hdr=' + info.hdr + ' gpu=' + info.renderer);
  } catch (e) {
    log('scene failed ' + (e.message || e));
    showFallback();
    toast(t('noWebgl'));
  }
  applyIcueSettings();
  applyOptions();
  bindUi();
  // getters: a reset replaces app.data / app.options with new objects
  OrbitPanels.init({ get data() { return app.data; }, get options() { return app.options; }, save: save });
  OrbitSystem.init(app.demo);
  OrbitMusic.init(app.demo, function () { return app.movie || document.hidden; });
  OrbitShortcuts.init();
  // browser tests: "?demo&hub" shows sample music/sensors and still talks to a hub started with --dev
  if (!app.demo || /[?&]hub(&|$)/.test(location.search)) {
    var uid = getIcueProperty('uniqueId');
    OrbitHub.start({ storageId: typeof uid === 'string' && uid ? uid : 'browser',
      getBackup: function () { return { isEmpty: dataIsEmpty(), data: { v: 1, data: app.data } }; },
      onRestore: restoreBackup });
  }
  OrbitHub.on('connection', renderHubStatus);
  renderHubStatus(OrbitHub.state.connection);
  setInterval(updateClock, 1000);
  requestAnimationFrame(frame);
}

function onIcueInitialized() { start(); }
function onIcueDataUpdated() { if (app.started) applyIcueSettings(); }

// A single false read of iCUE_initialized is a race, not proof of a plain browser: retry ~1.5 s.
var bootAttempts = 0;
function bootCheck() {
  if (typeof iCUE_initialized !== 'undefined' && iCUE_initialized) { start(); return; }
  if (bootAttempts < 15) { bootAttempts++; setTimeout(bootCheck, 100); return; }
  start();   // plain browser (development)
}
bootCheck();

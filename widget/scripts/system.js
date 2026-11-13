// System panel: CPU and GPU load and temperature from iCUE's Sensors plugin (sensor choice from Specdeck).
// RAM, network and PC controls need the Orbitdeck hub (later step) and are shown as such.
var OrbitSystem = (function () {
  'use strict';

  var t = function (k) { return OrbitI18n.t(k); };
  var $ = function (id) { return document.getElementById(id); };
  var esc = OrbitKeyboard.esc;
  var READ_EVERY_MS = 2000;
  var GAUGES = [
    { key: 'cpuLoad', label: 'cpuLoad', unit: '%', min: 0, max: 100 },
    { key: 'cpuTemp', label: 'cpuTemp', unit: '°', min: 20, max: 100 },
    { key: 'gpuLoad', label: 'gpuLoad', unit: '%', min: 0, max: 100 },
    { key: 'gpuTemp', label: 'gpuTemp', unit: '°', min: 20, max: 100 }
  ];
  var service = null, demo = false, timer = 0, picks = null, values = {}, state = 'wait', tries = 0;

  function plugin() { return window.plugins && window.plugins.Sensorsdataprovider; }

  function connect() {
    if (service || demo) return;
    var p = plugin();
    if (!p) { state = ++tries > 10 ? 'none' : 'wait'; return; }
    service = new OrbitSensors.Service(p);
    try { p.sensorAdded.connect(function () { service.invalidate(); picks = null; }); } catch (e) { /* optional signal */ }
    try { p.sensorRemoved.connect(function () { service.invalidate(); picks = null; }); } catch (e) { /* optional signal */ }
  }

  function read() {
    connect();
    if (demo) {
      var s = Date.now() / 1000;
      values = { cpuLoad: 18 + 10 * Math.sin(s / 3), cpuTemp: 52 + 4 * Math.sin(s / 7), gpuLoad: 41 + 20 * Math.sin(s / 5), gpuTemp: 58 + 3 * Math.sin(s / 9) };
      picks = { cpuLoad: { device: 'AMD Ryzen 9 9950X' }, cpuTemp: { device: 'AMD Ryzen 9 9950X' }, gpuLoad: { device: 'NVIDIA GeForce RTX 5080' }, gpuTemp: { device: 'NVIDIA GeForce RTX 5080' } };
      state = 'ok'; render(); return;
    }
    if (!service) { render(); return; }
    service.loadCatalog().then(function () {
      if (!picks) {
        picks = {};
        GAUGES.forEach(function (g) {
          var r = service.resolve(g.key, '', true);
          picks[g.key] = r ? { id: r.id, device: (service.info(r.id) || {}).device || '' } : null;
        });
        try { console.error('Orbitdeck sensors: ' + GAUGES.map(function (g) { var p = picks[g.key]; return g.key + '=' + (p ? (service.info(p.id) || {}).name + ' @ ' + p.device : '-'); }).join(', ')); } catch (e) { /* no console */ }
      }
      return Promise.all(GAUGES.map(function (g) {
        var p = picks[g.key];
        return p ? service.read(p.id).then(function (v) { values[g.key] = v; }, function () { values[g.key] = null; }) : (values[g.key] = null);
      }));
    }).then(function () {
      state = GAUGES.some(function (g) { return values[g.key] !== null && values[g.key] !== undefined; }) ? 'ok' : 'none';
      render();
    }, function () { state = 'none'; render(); });
  }

  function gauge(g) {
    var v = values[g.key], has = v !== null && v !== undefined;
    var frac = has ? Math.max(0, Math.min(1, (v - g.min) / (g.max - g.min))) : 0;
    var C = 2 * Math.PI * 42, hot = g.unit === '°' && has && v >= 85;
    var dev = picks && picks[g.key] ? picks[g.key].device : '';
    return '<div class="gauge' + (has ? '' : ' na') + (hot ? ' hot' : '') + '">' +
      '<svg viewBox="0 0 100 100"><circle class="g-track" cx="50" cy="50" r="42"/>' +
      '<circle class="g-val" cx="50" cy="50" r="42" stroke-dasharray="' + (C * frac).toFixed(1) + ' ' + C.toFixed(1) + '"/></svg>' +
      '<div class="g-num">' + (has ? Math.round(v) + '<small>' + g.unit + '</small>' : '–') + '</div>' +
      '<div class="g-lbl">' + esc(t(g.label)) + '</div><div class="g-dev">' + esc(dev) + '</div></div>';
  }

  function isOpen() { return $('panel-system').classList.contains('open'); }

  /** Only the gauges are redrawn every reading; the hub side keeps its buttons (a held button must not vanish). */
  function render() {
    var body = $('systemBody');
    if (!body || !isOpen()) return;
    if (!$('sysGauges')) { body.innerHTML = '<div class="gauges" id="sysGauges"></div><div class="side" id="sysHub"></div>'; renderHub(); }
    $('sysGauges').innerHTML = state === 'none' ? '<div class="empty">' + esc(t('noSensors')) + '</div>'
      : state === 'wait' && !demo ? '<div class="empty">' + esc(t('loadingSensors')) + '</div>'
      : GAUGES.map(gauge).join('');
  }

  // ---------- RAM, network, PC commands (hub) ----------

  var PC = [
    { k: 'lock', hold: false, icon: '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>' },
    { k: 'taskmgr', hold: false, icon: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M6.5 15l3-4 3 2.5 4.5-6"/>' },
    { k: 'restart', hold: true, icon: '<path d="M19 12a7 7 0 1 1-2.05-4.95M19 5v4h-4"/>' },
    { k: 'shutdown', hold: true, icon: '<path d="M12 4v8M7.05 7.05a7 7 0 1 0 9.9 0"/>' }
  ];

  function gb(bytes) { return (bytes / 1073741824).toLocaleString(OrbitI18n.lang === 'de' ? 'de-DE' : 'en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 }); }
  function rate(bps) {
    var loc = OrbitI18n.lang === 'de' ? 'de-DE' : 'en-US';
    if (bps >= 1048576) return (bps / 1048576).toLocaleString(loc, { maximumFractionDigits: 1 }) + ' MB/s';
    return Math.round(bps / 1024).toLocaleString(loc) + ' KB/s';
  }

  function renderHub() {
    var side = $('sysHub');
    if (!side) return;
    if (!OrbitHub.ready()) {
      side.innerHTML = '<h3>' + esc(t('withHub')) + '</h3><div class="hub-tiles">' +
        ['ram', 'network', 'lock', 'taskmgr', 'restart', 'shutdown'].map(function (k) { return '<div class="hub-tile"><span>' + esc(t('sys_' + k)) + '</span></div>'; }).join('') +
        '</div><p class="hint">' + esc(t('withHubHint')) + '</p>';
      return;
    }
    side.innerHTML = '<div class="sys-stats">' +
      '<div class="stat"><div class="stat-l">' + esc(t('sys_ram')) + '</div><div class="stat-v" id="ramV">–</div><div class="mini-bar"><span id="ramBar"></span></div></div>' +
      '<div class="stat"><div class="stat-l">' + esc(t('sys_network')) + '</div><div class="net"><span>↓ <b id="netDown">–</b></span><span>↑ <b id="netUp">–</b></span></div></div></div>' +
      '<div class="pc-btns">' + PC.map(function (p) {
        return '<button class="pc-btn' + (p.hold ? ' hold' : '') + '" data-pc="' + p.k + '"><span class="hold-fill"></span><svg viewBox="0 0 24 24">' + p.icon + '</svg><span>' + esc(t('sys_' + p.k)) + '</span></button>';
      }).join('') + '</div><p class="hint">' + esc(t('holdHint')) + '</p>';
    updateSys(OrbitHub.state.sys);
  }

  function updateSys(s) {
    if (!$('ramV')) return;
    if (s && s.ram) {
      $('ramV').textContent = gb(s.ram.used) + ' / ' + gb(s.ram.total) + ' GB';
      $('ramBar').style.width = Math.round(s.ram.used / s.ram.total * 100) + '%';
    }
    if (s && s.net) { $('netDown').textContent = rate(s.net.down); $('netUp').textContent = rate(s.net.up); }
  }

  function bindPc() {
    var timer = 0, held = null;
    var panel = $('panel-system');
    panel.addEventListener('pointerdown', function (e) {
      var b = e.target.closest('[data-pc]');
      if (!b) return;
      if (!b.classList.contains('hold')) { OrbitHub.send({ op: 'power', action: b.getAttribute('data-pc') }); return; }
      e.preventDefault();
      held = b; b.classList.add('holding');
      timer = setTimeout(function () {
        b.classList.remove('holding'); held = null; timer = 0;
        OrbitHub.send({ op: 'power', action: b.getAttribute('data-pc') });
      }, 1500);
    });
    function cancel() {
      if (!timer) return;
      clearTimeout(timer); timer = 0;
      if (held) held.classList.remove('holding');
      held = null;
      OrbitApp.toast(t('holdToConfirm'));
    }
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { panel.addEventListener(ev, cancel); });
  }

  function onOpen() {
    var body = $('systemBody');
    if (body) body.innerHTML = '';
    render();
    read();
    clearInterval(timer);
    timer = setInterval(function () {
      if (!$('panel-system').classList.contains('open')) { clearInterval(timer); return; }
      read();
    }, READ_EVERY_MS);
  }

  function init(isDemo) {
    demo = !!isDemo;
    connect();
    bindPc();
    OrbitHub.on('connection', function () { if (isOpen()) renderHub(); });
    OrbitHub.on('sys', updateSys);
  }

  return { init: init, onOpen: onOpen };
})();

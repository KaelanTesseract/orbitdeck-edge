// Orbitdeck Edge Hub inside the widget: connection, pairing token, the hub's state (audio, sys, shortcuts),
// visualizer frames, sounds and the task backup. Other modules subscribe with OrbitHub.on(kind, fn).
// Without the hub everything else keeps working; features that need it show a hint instead.
var OrbitHub = (function () {
  'use strict';

  var BACKUP_DELAY_MS = 5000;
  var state = {
    connection: 'idle',      // idle | connecting | unreachable | pair_pending | pair_denied | ready | lost | proto_mismatch
    welcome: null, audio: null, sys: null, shortcuts: [], apps: null
  };
  var listeners = {};
  var client = null, tokenKey = 'orbitdeck-token:browser', backupTimer = 0, getBackup = null, onRestore = null;
  var restoreChecked = false;

  function emit(kind, data) { (listeners[kind] || []).forEach(function (fn) { try { fn(data); } catch (e) { console.error('Orbitdeck hub listener: ' + e.message); } }); }
  function on(kind, fn) { (listeners[kind] = listeners[kind] || []).push(fn); }

  function loadToken() { try { return localStorage.getItem(tokenKey) || ''; } catch (e) { return ''; } }
  function saveToken(t) { try { localStorage.setItem(tokenKey, t); } catch (e) { /* asked again next time */ } }

  function handle(msg) {
    switch (msg.t) {
      case 'welcome': state.welcome = msg; break;
      case 'snapshot':
        state.audio = msg.audio || null; state.sys = msg.sys || null; state.shortcuts = msg.shortcuts || [];
        emit('audio', state.audio); emit('sys', state.sys); emit('shortcuts', state.shortcuts);
        checkRestore();
        break;
      case 'audio': state.audio = msg.data; emit('audio', state.audio); break;
      case 'sys': state.sys = msg.data; emit('sys', state.sys); break;
      case 'shortcuts': state.shortcuts = msg.list || []; emit('shortcuts', state.shortcuts); break;
      case 'apps': state.apps = msg.list || []; emit('apps', state.apps); break;
      case 'v': emit('bands', msg.b); break;
      case 'backup':
        if (onRestore && msg.data) onRestore(msg.data);
        break;
      case 'error':
        if (msg.code !== 'proto_mismatch') console.error('Orbitdeck hub error: ' + msg.code + (msg.op ? ' (' + msg.op + ')' : ''));
        emit('error', msg);
        break;
    }
  }

  /** The widget's own storage is empty (e.g. re-imported into iCUE): ask once for the hub's copy. */
  function checkRestore() {
    if (restoreChecked || !getBackup) return;
    restoreChecked = true;
    var b = getBackup();
    if (b && b.isEmpty) send({ op: 'backup.load' });
    else scheduleBackup();
  }

  function scheduleBackup() {
    clearTimeout(backupTimer);
    backupTimer = setTimeout(function () {
      if (!getBackup || !ready()) return;
      var b = getBackup();
      if (b && !b.isEmpty) send({ op: 'backup.save', data: b.data });
    }, BACKUP_DELAY_MS);
  }

  function send(payload) { return !!client && client.send(payload); }
  function ready() { return state.connection === 'ready'; }

  function iconUrl(id) {
    var w = state.welcome;
    return w && id ? w.iconBase + encodeURIComponent(id) + '.png?k=' + encodeURIComponent(w.iconKey) : '';
  }

  /**
   * o: { storageId, getBackup() -> { isEmpty, data }, onRestore(data) }
   * The token lives under its own key, so "reset all data" in the widget does not unpair it.
   */
  function start(o) {
    tokenKey = 'orbitdeck-token:' + (o.storageId || 'browser');
    getBackup = o.getBackup; onRestore = o.onRestore;
    client = new OrbitHubClient({
      loadToken: loadToken, saveToken: saveToken,
      onState: function (s) {
        state.connection = s;
        if (s !== 'ready') { state.audio = null; state.sys = null; restoreChecked = false; }
        emit('connection', s);
        if (s !== 'ready') { emit('audio', null); emit('sys', null); }
      },
      onMessage: handle
    });
    client.start();
  }

  return {
    start: start, on: on, send: send, ready: ready, iconUrl: iconUrl, scheduleBackup: scheduleBackup,
    requestPairing: function () { if (client) client.requestPairing(); },
    sound: function (name) { return send({ op: 'sound', name: name }); },
    get state() { return state; }
  };
})();

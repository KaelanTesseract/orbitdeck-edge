// Connection to the Orbitdeck Edge Hub on this PC (ws://localhost:47822). Taken over from Mixdeck Edge.
// Handles hello/pairing and reconnects on its own. Commands are fire-and-forget: the hub answers with
// state changes (and an "error" message for invalid input).
// Connection states: connecting → (unreachable) → pair_pending / pair_denied → ready → lost → …
var OrbitHubClient = (function () {
  'use strict';

  // browser tests only: "?hubport=47823" talks to a Debug test hub (iCUE never passes a query string)
  var PORT = (/[?&]hubport=(\d{4,5})/.exec(location.search) || [])[1] || '47822';
  var HUB_URL = 'ws://localhost:' + PORT + '/ws';
  var PROTOCOL = 1;
  var RETRY_FAST_MS = 2000;
  var RETRY_SLOW_MS = 5000;

  function HubClient(options) {
    this.loadToken = options.loadToken;   // () => string
    this.saveToken = options.saveToken;   // (token) => void
    this.onState = options.onState;       // (connectionState) => void
    this.onMessage = options.onMessage;   // (message) => void
    this.state = 'idle';
    this.everReady = false;
    this.socket = null;
    this.retryTimer = null;
    this.stopped = false;
  }

  HubClient.prototype.start = function () {
    this.stopped = false;
    this.connect();
  };

  HubClient.prototype.stop = function () {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    if (this.socket) this.socket.close();
  };

  HubClient.prototype.setState = function (state) {
    if (this.state === state) return;
    this.state = state;
    this.onState(state);
  };

  HubClient.prototype.connect = function () {
    var self = this;
    clearTimeout(this.retryTimer);
    if (!this.everReady) this.setState('connecting');

    var socket;
    try {
      socket = new WebSocket(HUB_URL);
    } catch (e) {
      // Blocked (e.g. permission revoked): treat like an unreachable hub.
      this.setState(this.everReady ? 'lost' : 'unreachable');
      this.scheduleRetry();
      return;
    }
    this.socket = socket;

    socket.onopen = function () {
      socket.send(JSON.stringify({ op: 'hello', token: self.loadToken() || '', proto: PROTOCOL }));
    };

    socket.onmessage = function (event) {
      var msg;
      try { msg = JSON.parse(event.data); } catch (e) { return; }
      self.handle(msg);
    };

    socket.onclose = function () {
      if (self.socket !== socket) return;
      self.socket = null;
      if (self.stopped) return;
      if (self.state === 'proto_mismatch') { self.scheduleRetry(RETRY_SLOW_MS * 6); return; }
      self.setState(self.everReady ? 'lost' : 'unreachable');
      self.scheduleRetry();
    };
  };

  HubClient.prototype.scheduleRetry = function (delay) {
    var self = this;
    if (this.stopped) return;
    if (!delay) delay = this.state === 'lost' ? RETRY_FAST_MS : RETRY_SLOW_MS;
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(function () { self.connect(); }, delay);
  };

  HubClient.prototype.handle = function (msg) {
    switch (msg.t) {
      case 'pair_pending': this.setState('pair_pending'); break;
      case 'pair_denied': this.setState('pair_denied'); break;
      case 'paired': if (typeof msg.token === 'string') this.saveToken(msg.token); break;
      case 'welcome':
        this.everReady = true;
        this.setState('ready');
        break;
      case 'error':
        if (msg.code === 'proto_mismatch') this.setState('proto_mismatch');
        break;
    }
    this.onMessage(msg);
  };

  /** Sends a command when connected; returns false otherwise. */
  HubClient.prototype.send = function (payload) {
    if (!this.socket || this.state !== 'ready' || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(payload));
    return true;
  };

  /** After a denial: ask the hub to show the "Allow widget?" window again. */
  HubClient.prototype.requestPairing = function () {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ op: 'pair.request' }));
      this.setState('pair_pending');
    }
  };

  return HubClient;
})();

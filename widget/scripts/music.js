// Music: now playing from iCUE's Media plugin 1.1 (title, artist, album, cover, play state) with
// play/pause/skip. The visualizer is a calm stand-in until the Orbitdeck hub sends the real bands.
var OrbitMusic = (function () {
  'use strict';

  var t = function (k) { return OrbitI18n.t(k); };
  var $ = function (id) { return document.getElementById(id); };
  var BARS = 64, VIZ_FPS = 30;
  var track = { title: '', artist: '', album: '', cover: '', playing: false };
  var demo = false, plugin = null, tries = 0;
  var bars = [], levels = new Float32Array(BARS), lastViz = 0, t0 = performance.now();
  var paused = function () { return false; };   // set by app.js: movie mode / hidden page

  function get(p, name) { try { var v = p[name]; return v === undefined || v === null ? '' : v; } catch (e) { return ''; } }

  function pull() {
    if (!plugin) return;
    track.title = String(get(plugin, 'songName'));
    track.artist = String(get(plugin, 'artist'));
    track.album = String(get(plugin, 'album'));
    track.cover = String(get(plugin, 'thumbnail'));
    track.playing = get(plugin, 'isPlaying') === true;
    render();
  }

  function connect() {
    if (plugin || demo) return;
    var p = window.plugins && window.plugins.Mediadataprovider;
    if (!p) { if (++tries < 15) setTimeout(connect, 2000); return; }
    plugin = p;
    ['songNameChanged', 'artistChanged', 'albumChanged', 'thumbnailChanged', 'isPlayingChanged'].forEach(function (sig) {
      try { p[sig].connect(pull); } catch (e) { /* signal missing in older iCUE */ }
    });
    pull();
    setInterval(pull, 5000);   // safety net in case a change signal is missed
  }

  function command(cmd) {
    if (demo) {
      if (cmd === 'playPause') track.playing = !track.playing;
      render(); return;
    }
    if (!plugin) return;
    try {
      if (cmd === 'playPause') plugin.triggerPlayPause();
      else if (cmd === 'next') plugin.triggerNextTrack();
      else if (cmd === 'prev') plugin.triggerPreviousTrack();
    } catch (e) { console.error('Orbitdeck media: ' + e.message); }
    setTimeout(pull, 400);
  }

  var PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z"/></svg>';
  var PAUSE = '<svg viewBox="0 0 24 24"><path d="M9 6v12M15 6v12"/></svg>';

  function render() {
    var has = !!track.title;
    $('music').hidden = !has;
    $('root').classList.toggle('has-music', has);
    $('trackTitle').textContent = track.title;
    $('trackArtist').textContent = track.artist;
    $('playBtn').innerHTML = track.playing ? PAUSE : PLAY;
    $('playBtn').classList.toggle('paused', !track.playing);
    // music panel
    var pb = $('musicBody');
    if (!pb) return;
    pb.classList.toggle('none', !has);
    $('mCover').style.backgroundImage = track.cover ? 'url("' + track.cover.replace(/"/g, '') + '")' : '';
    $('mCover').classList.toggle('empty', !track.cover);
    $('mTitle').textContent = has ? track.title : t('nothingPlaying');
    $('mArtist').textContent = track.artist;
    $('mAlbum').textContent = track.album;
    $('mPlay').innerHTML = track.playing ? PAUSE : PLAY;
  }

  // ---------- visualizer: real bands from the hub, calm stand-in without it ----------

  var hubBands = null, hubBandsAt = 0, vizWanted = false;
  function wantVisualizer(on) {
    if (on === vizWanted) return;
    vizWanted = on;
    OrbitHub.send({ op: 'visualizer', on: on });
  }
  function bandAt(x) {   // 48 hub bands -> any number of bars, linear in between
    var p = x * (hubBands.length - 1), i = Math.floor(p), f = p - i;
    var a = hubBands[i] || 0, b = hubBands[Math.min(hubBands.length - 1, i + 1)] || 0;
    return (a + (b - a) * f) / 100;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    var visible = !!track.title && !paused() && !$('root').classList.contains('panel-open');
    wantVisualizer(visible && OrbitHub.ready());
    if (!visible) return;
    if (now - lastViz < 1000 / VIZ_FPS - 2) return;
    lastViz = now;
    var s = (now - t0) / 1000;
    var live = OrbitHub.ready() && hubBands && performance.now() - hubBandsAt < 600;
    for (var i = 0; i < BARS; i++) {
      var x = i / BARS, target = 0;
      if (live) {
        target = bandAt(i / (BARS - 1));
      } else if (track.playing) {
        var env = Math.exp(-Math.pow((x - 0.3) * 3.0, 2)) * 0.85 + Math.exp(-Math.pow((x - 0.68) * 4.5, 2)) * 0.45;
        var beat = Math.pow(Math.max(0, Math.sin(s * 7.3)), 8) * 0.3;
        target = env * (0.32 + 0.3 * Math.sin(s * 2.7 + i * 0.85) * Math.sin(s * 1.3 + i * 0.31) + beat) + Math.random() * 0.06 * env;
      }
      levels[i] = target > levels[i] ? levels[i] * 0.4 + target * 0.6 : levels[i] * 0.86;
      bars[i].style.height = Math.max(5, Math.min(100, levels[i] * 100)) + '%';
    }
  }

  function init(isDemo, pausedFn) {
    demo = !!isDemo;
    if (pausedFn) paused = pausedFn;
    var viz = $('viz');
    for (var i = 0; i < BARS; i++) { var b = document.createElement('i'); viz.appendChild(b); bars.push(b); }
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-media]');
      if (b) command(b.getAttribute('data-media'));
    });
    if (demo) { track = { title: OrbitI18n.lang === 'de' ? 'Mitternachtsfahrt' : 'Midnight Drive', artist: 'Lofi Demo', album: 'Orbitdeck', cover: '', playing: true }; render(); }
    else { render(); connect(); }
    OrbitHub.on('bands', function (b) { hubBands = b; hubBandsAt = performance.now(); });
    OrbitHub.on('connection', function (c) { if (c !== 'ready') vizWanted = false; renderSound(); });
    OrbitHub.on('audio', renderSound);
    bindSoundSide();
    renderSound();
    requestAnimationFrame(frame);
  }

  // ---------- volume, mute, microphone, output device (needs the hub) ----------

  var esc = OrbitKeyboard.esc;
  var dragging = null;   // { target, el } while a slider is held: hub echoes do not move it meanwhile
  var SPEAKER = '<svg viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>';
  var SPEAKER_OFF = '<svg viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>';
  var MIC = '<svg viewBox="0 0 24 24"><rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"/></svg>';
  var MIC_OFF = '<svg viewBox="0 0 24 24"><rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M4 4l16 16"/></svg>';

  function sliderHtml(target, ch) {
    return '<div class="vol-row" data-vol="' + target + '">' +
      '<button class="round mute-btn' + (ch.mute ? ' muted' : '') + '" data-mute="' + target + '" aria-label="Mute">' +
        (target === 'mic' ? (ch.mute ? MIC_OFF : MIC) : (ch.mute ? SPEAKER_OFF : SPEAKER)) + '</button>' +
      '<div class="slider' + (ch.mute ? ' muted' : '') + '" data-slider="' + target + '"><span class="fill" style="width:' + ch.volume + '%"></span><span class="knob" style="left:' + ch.volume + '%"></span></div>' +
      '<span class="vol-num">' + ch.volume + '</span></div>';
  }

  function renderSound() {
    var side = $('soundSide');
    if (!side || dragging) return;
    var a = OrbitHub.state.audio;
    if (!OrbitHub.ready() || !a) {
      side.innerHTML = '<h3>' + esc(t('withHub')) + '</h3><p class="hint">' + esc(t('musicHubHint')) + '</p>';
      return;
    }
    var html = '<h3>' + esc(t('volume')) + '</h3>' + (a.master ? sliderHtml('master', a.master) : '');
    if (a.mic) html += '<h3>' + esc(t('microphone')) + '</h3>' + sliderHtml('mic', a.mic);
    if (a.devices && a.devices.length > 1) {
      html += '<h3>' + esc(t('outputDevice')) + '</h3><div class="dev-list scroll">' + a.devices.map(function (d) {
        return '<button class="dev' + (d.id === a.device ? ' on' : '') + '"' + (a.canSwitch ? '' : ' disabled') + ' data-device="' + esc(d.id) + '">' + esc(d.name) + '</button>';
      }).join('') + '</div>';
    }
    side.innerHTML = html;
  }

  function setSlider(el, value) {
    el.querySelector('.fill').style.width = value + '%';
    el.querySelector('.knob').style.left = value + '%';
    var num = el.parentNode.querySelector('.vol-num');
    if (num) num.textContent = value;
  }

  function bindSoundSide() {
    var side = $('soundSide'), lastSent = 0;
    side.addEventListener('pointerdown', function (e) {
      var el = e.target.closest('[data-slider]');
      if (!el) return;
      e.preventDefault();
      dragging = { target: el.getAttribute('data-slider'), el: el };
      try { el.setPointerCapture(e.pointerId); } catch (x) { /* older engines */ }
      move(e);
    });
    function move(e) {
      if (!dragging) return;
      var r = dragging.el.getBoundingClientRect();
      var v = Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * 100);
      setSlider(dragging.el, v);
      var now = performance.now();
      if (now - lastSent > 33) { lastSent = now; OrbitHub.send({ op: 'setVolume', target: dragging.target, value: v }); }
      dragging.value = v;
    }
    side.addEventListener('pointermove', move);
    function end() {
      if (!dragging) return;
      if (dragging.value !== undefined) OrbitHub.send({ op: 'setVolume', target: dragging.target, value: dragging.value });
      dragging = null;
      setTimeout(renderSound, 300);
    }
    side.addEventListener('pointerup', end);
    side.addEventListener('pointercancel', end);
    side.addEventListener('click', function (e) {
      var m = e.target.closest('[data-mute]'), d = e.target.closest('[data-device]'), a = OrbitHub.state.audio;
      if (m && a) {
        var target = m.getAttribute('data-mute'), ch = a[target];
        if (ch) OrbitHub.send({ op: 'setMute', target: target, mute: !ch.mute });
      }
      if (d && !d.disabled && a && d.getAttribute('data-device') !== a.device) OrbitHub.send({ op: 'setDevice', id: d.getAttribute('data-device') });
    });
  }

  return { init: init, render: render, renderSound: renderSound };
})();

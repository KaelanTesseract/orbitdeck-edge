// Shortcuts panel: up to 12 programs, folders or web pages (kept by the hub, which also starts them).
// Tap starts; "Edit" shows remove/move buttons and the "+" tile opens a picker (programs, folders, web page).
var OrbitShortcuts = (function () {
  'use strict';

  var t = function (k) { return OrbitI18n.t(k); };
  var $ = function (id) { return document.getElementById(id); };
  var esc = OrbitKeyboard.esc;
  var MAX = 12;
  var editing = false, picker = null;   // picker: { tab: 'apps'|'folders'|'url', filter, url, name }
  var FOLDER = '<svg viewBox="0 0 24 24"><path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/></svg>';
  var GLOBE = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17"/></svg>';
  var PLUS = '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>';

  function isOpen() { var p = $('panel-shortcuts'); return p && p.classList.contains('open'); }

  function iconHtml(s) {
    if (s.kind === 'folder') return '<span class="sc-icon glyph">' + FOLDER + '</span>';
    if (s.kind === 'url') return '<span class="sc-icon glyph letter">' + esc((s.name || '?').charAt(0).toUpperCase()) + '</span>';
    var url = s.icon ? OrbitHub.iconUrl(s.id) : '';
    return url ? '<img class="sc-icon" alt="" src="' + esc(url) + '" />' : '<span class="sc-icon glyph">' + GLOBE + '</span>';
  }

  function render() {
    var body = $('shortcutsBody');
    if (!body || !isOpen()) return;
    $('scEdit').hidden = !OrbitHub.ready();
    $('scEdit').classList.toggle('on', editing);
    if (!OrbitHub.ready()) {
      body.className = 'panel-body sc-body';
      body.innerHTML = '<div class="empty">' + esc(t('shortcutsHub')) + '</div>';
      return;
    }
    if (picker) { renderPicker(body); return; }
    var list = OrbitHub.state.shortcuts || [];
    var tiles = list.map(function (s, i) {
      return '<div class="sc-tile' + (editing ? ' editing' : '') + '" data-id="' + esc(s.id) + '">' +
        '<button class="sc-main" data-run="' + esc(s.id) + '"' + (editing ? ' disabled' : '') + '>' + iconHtml(s) + '<span class="sc-name">' + esc(s.name) + '</span></button>' +
        (editing ? '<div class="sc-edit"><button data-move="-1"' + (i === 0 ? ' disabled' : '') + '>‹</button>' +
          '<button class="sc-del" data-remove="1">✕</button><button data-move="1"' + (i === list.length - 1 ? ' disabled' : '') + '>›</button></div>' : '') +
        '</div>';
    });
    if (list.length < MAX) tiles.push('<div class="sc-tile add"><button class="sc-main" data-add="1"><span class="sc-icon glyph">' + PLUS + '</span><span class="sc-name">' + esc(t('addShortcut')) + '</span></button></div>');
    body.className = 'panel-body sc-body';
    body.innerHTML = '<div class="sc-grid">' + tiles.join('') + '</div>' + (list.length ? '' : '<p class="hint sc-hint">' + esc(t('shortcutsEmpty')) + '</p>');
  }

  function renderPicker(body) {
    body.className = 'panel-body sc-body picking';
    var tabs = ['apps', 'folders', 'url'].map(function (k) {
      return '<button class="chip' + (picker.tab === k ? ' on' : '') + '" data-ptab="' + k + '">' + esc(t('pick_' + k)) + '</button>';
    }).join('');
    var content;
    if (picker.tab === 'url') {
      content = '<div class="pick-url"><button class="field" data-edit="url">' + (picker.url ? esc(picker.url) : '<span class="ph">' + esc(t('urlPlaceholder')) + '</span>') + '</button>' +
        '<button class="field" data-edit="name">' + (picker.name ? esc(picker.name) : '<span class="ph">' + esc(t('namePlaceholder')) + '</span>') + '</button>' +
        '<div class="form-actions"><button class="btn primary" data-addurl="1"' + (picker.url ? '' : ' disabled') + '>' + esc(t('add')) + '</button></div></div>';
    } else {
      var apps = OrbitHub.state.apps;
      if (!apps) content = '<div class="empty">' + esc(t('loadingApps')) + '</div>';
      else {
        var f = (picker.filter || '').toLowerCase();
        var list = apps.filter(function (a) { return (picker.tab === 'apps') === (a.kind === 'app') && (!f || a.name.toLowerCase().indexOf(f) >= 0); });
        content = '<div class="pick-list scroll">' + (list.length ? list.slice(0, 200).map(function (a) {
          var icon = a.kind === 'folder' ? '<span class="sc-icon glyph small">' + FOLDER + '</span>'
            : a.icon ? '<img class="sc-icon small" alt="" loading="lazy" onerror="this.style.visibility=&quot;hidden&quot;" src="' + esc(OrbitHub.iconUrl(a.icon)) + '" />' : '<span class="sc-icon glyph small">' + GLOBE + '</span>';
          return '<button class="pick-item" data-kind="' + esc(a.kind) + '" data-ref="' + esc(a.ref) + '">' + icon + '<span>' + esc(a.name) + '</span></button>';
        }).join('') : '<div class="empty">' + esc(t('noMatch')) + '</div>') + '</div>';
      }
    }
    body.innerHTML = '<div class="pick-head"><div class="chips">' + tabs + '</div>' +
      (picker.tab === 'apps' ? '<button class="field search" data-edit="filter">' + (picker.filter ? esc(picker.filter) : '<span class="ph">' + esc(t('search')) + '</span>') + '</button>' : '<span></span>') +
      '<button class="btn" data-pickclose="1">' + esc(t('cancel')) + '</button></div>' + content;
  }

  function onClick(e) {
    var b = e.target.closest('button');
    if (!b || b.disabled) return;
    if (b.id === 'scEdit') { editing = !editing; picker = null; render(); return; }
    if (b.hasAttribute('data-run')) { OrbitHub.send({ op: 'run', id: b.getAttribute('data-run') }); flash(b); return; }
    var tile = b.closest('[data-id]');
    if (b.hasAttribute('data-remove') && tile) { OrbitHub.send({ op: 'shortcuts.remove', id: tile.getAttribute('data-id') }); return; }
    if (b.hasAttribute('data-move') && tile) {
      var list = OrbitHub.state.shortcuts, id = tile.getAttribute('data-id');
      var i = list.findIndex(function (s) { return s.id === id; });
      OrbitHub.send({ op: 'shortcuts.move', id: id, to: Math.max(0, i + Number(b.getAttribute('data-move'))) });
      return;
    }
    if (b.hasAttribute('data-add')) {
      picker = { tab: 'apps', filter: '', url: '', name: '' };
      OrbitHub.state.apps = null;
      OrbitHub.send({ op: 'listApps' });
      render(); return;
    }
    if (b.hasAttribute('data-pickclose')) { picker = null; render(); return; }
    if (b.hasAttribute('data-ptab')) { picker.tab = b.getAttribute('data-ptab'); render(); return; }
    if (b.hasAttribute('data-ref')) {
      OrbitHub.send({ op: 'shortcuts.add', kind: b.getAttribute('data-kind'), ref: b.getAttribute('data-ref') });
      picker = null; editing = false; render(); return;
    }
    if (b.hasAttribute('data-addurl')) {
      OrbitHub.send({ op: 'shortcuts.add', kind: 'url', url: picker.url, name: picker.name || undefined });
      picker = null; render(); return;
    }
    if (b.hasAttribute('data-edit')) {
      var field = b.getAttribute('data-edit');
      OrbitKeyboard.open({
        title: t(field === 'filter' ? 'search' : field === 'url' ? 'pick_url' : 'name').toUpperCase(),
        value: picker[field], placeholder: t(field === 'filter' ? 'search' : field === 'url' ? 'urlPlaceholder' : 'namePlaceholder'),
        maxLength: field === 'url' ? 300 : 40, noAutoCaps: field === 'url',
        onDone: function (v) { if (picker) { picker[field] = v; render(); } }
      });
    }
  }

  function flash(b) {
    b.classList.add('started');
    setTimeout(function () { b.classList.remove('started'); }, 700);
  }

  function init() {
    $('panel-shortcuts').addEventListener('click', onClick);
    OrbitHub.on('shortcuts', render);
    OrbitHub.on('apps', function () { if (picker) render(); });
    OrbitHub.on('connection', function () { if (!OrbitHub.ready()) { picker = null; editing = false; } render(); });
    OrbitHub.on('error', function (m) {
      if (m.op && m.op.indexOf('shortcuts') === 0 || m.op === 'run') OrbitApp.toast(t(m.code === 'too_many' ? 'tooMany' : m.code === 'bad_value' ? 'badUrl' : 'scFailed'));
    });
  }

  return { init: init, render: render, onOpen: function () { picker = null; editing = false; render(); } };
})();

// On-screen keyboard: Windows shows no touch keyboard for iCUE widgets (Edge test 2026-11-13).
// OrbitKeyboard.open({ title, value, placeholder, maxLength, suggest(text) -> [string], onDone(text), onCancel() })
var OrbitKeyboard = (function () {
  'use strict';

  var LAYOUTS = {
    de: [['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'ß', 'BKSP'],
         ['q', 'w', 'e', 'r', 't', 'z', 'u', 'i', 'o', 'p', 'ü'],
         ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ö', 'ä'],
         ['SHIFT', 'y', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '-', 'SHIFT']],
    en: [['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', "'", 'BKSP'],
         ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '/'],
         ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ':', '&'],
         ['SHIFT', 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '-', 'SHIFT']]
  };
  var SYMBOLS = [['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '+', 'BKSP'],
                 ['!', '?', '"', '#', '%', '&', '/', '(', ')', '=', '*'],
                 ['@', ':', ';', '_', '€', '$', '<', '>', '[', ']', '\''],
                 ['SHIFT', '~', '|', '\\', '{', '}', '^', '°', ',', '.', '-', 'SHIFT']];

  var el = null, state = null;
  var t = function (k) { return OrbitI18n.t(k); };

  function build() {
    el = document.createElement('div');
    el.className = 'kb';
    el.innerHTML =
      '<div class="kb-head"><div class="kb-title"></div>' +
      '<div class="kb-field"><span class="kb-text"></span><span class="kb-caret"></span><span class="kb-ph"></span></div></div>' +
      '<div class="kb-sugg"></div><div class="kb-keys"></div>';
    document.getElementById('root').appendChild(el);
    el.addEventListener('pointerdown', function (e) {
      var k = e.target.closest('[data-k]');
      e.preventDefault();
      e.stopPropagation();
      if (!k) return;
      k.classList.add('down');
      setTimeout(function () { k.classList.remove('down'); }, 120);
      press(k.getAttribute('data-k'));
    });
  }

  function render() {
    var rows = state.symbols ? SYMBOLS : (LAYOUTS[OrbitI18n.lang] || LAYOUTS.en);
    var html = rows.map(function (row) {
      return '<div class="kb-row">' + row.map(function (k) {
        if (k === 'BKSP') return '<button class="key wide" data-k="BKSP"><svg viewBox="0 0 24 24"><path d="M9 6h11v12H9l-6-6z M12.5 9.5l5 5M17.5 9.5l-5 5"/></svg></button>';
        if (k === 'SHIFT') return '<button class="key wide' + (state.shift ? ' on' : '') + '" data-k="SHIFT"><svg viewBox="0 0 24 24"><path d="M12 4l7 8h-4v7H9v-7H5z"/></svg></button>';
        var c = state.shift && !state.symbols && k !== 'ß' ? k.toUpperCase() : k;   // 'ß'.toUpperCase() is 'SS'
        return '<button class="key" data-k="' + esc(c) + '">' + esc(c) + '</button>';
      }).join('') + '</div>';
    }).join('');
    html += '<div class="kb-row">' +
      '<button class="key wide2 muted" data-k="CANCEL">' + esc(t('cancel')) + '</button>' +
      '<button class="key wide" data-k="SYM">' + (state.symbols ? 'ABC' : '?123') + '</button>' +
      '<button class="key space" data-k=" ">' + esc(t('space')) + '</button>' +
      '<button class="key wide2 primary" data-k="DONE">' + esc(state.doneLabel || t('done')) + '</button></div>';
    el.querySelector('.kb-keys').innerHTML = html;
    renderText();
  }

  function renderText() {
    el.querySelector('.kb-text').textContent = state.value;
    el.querySelector('.kb-ph').textContent = state.value ? '' : (state.placeholder || '');
    var list = state.suggest ? state.suggest(state.value) : [];
    el.querySelector('.kb-sugg').innerHTML = list.map(function (s) {
      return '<button class="sugg" data-k="SUGG:' + esc(s) + '">' + esc(s) + '</button>';
    }).join('');
  }

  function press(k) {
    if (k === 'BKSP') { state.value = state.value.slice(0, -1); }
    else if (k === 'SHIFT') { state.shift = !state.shift; render(); return; }
    else if (k === 'SYM') { state.symbols = !state.symbols; state.shift = false; render(); return; }
    else if (k === 'CANCEL') { var c = state.onCancel; close(); if (c) c(); return; }
    else if (k === 'DONE') { var d = state.onDone, v = state.value.trim(); close(); if (d) d(v); return; }
    else if (k.indexOf('SUGG:') === 0) { state.value = k.slice(5); }
    else if (state.value.length < state.maxLength) {
      state.value += k;
      if (state.shift) { state.shift = false; render(); return; }
    }
    // capital letter at the start of the text and after ". "
    var autoShift = !state.symbols && !state.noAutoCaps && (state.value === '' || /[.!?]\s$/.test(state.value));
    if (autoShift !== state.shift) { state.shift = autoShift; render(); return; }
    renderText();
  }

  function open(o) {
    if (!el) build();
    state = { title: o.title || '', value: o.value || '', placeholder: o.placeholder || '', maxLength: o.maxLength || 80,
              suggest: o.suggest || null, onDone: o.onDone, onCancel: o.onCancel, doneLabel: o.doneLabel || '',
              shift: !o.noAutoCaps && !(o.value || ''), symbols: false, noAutoCaps: !!o.noAutoCaps };
    el.querySelector('.kb-title').textContent = state.title;
    render();
    el.classList.add('open');
    document.getElementById('root').classList.add('kb-open');
  }

  function close() {
    if (!el) return;
    el.classList.remove('open');
    document.getElementById('root').classList.remove('kb-open');
    state = null;
  }

  function isOpen() { return !!state; }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  return { open: open, close: close, isOpen: isOpen, esc: esc };
})();

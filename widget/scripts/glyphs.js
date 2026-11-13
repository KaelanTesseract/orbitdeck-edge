// Orbitdeck display lettering: own line glyphs (uppercase A–Z, Ä Ö Ü, digits, colon) drawn as SVG strokes.
// Style chosen in tests on the Edge (compared letter by letter with the original at equal height, 2026-11-13):
// geometric, wide, generous rounded corners, flat stroke ends for the weekday, "A" without crossbar
// (plain Λ), open "D", "U" whose left stroke starts halfway down, wide rounded-square digits.
// Cap height = 100 units; each glyph: [advance width, path data].
var OrbitGlyphs = (function () {
  'use strict';

  var O = 'M32,0 H54 Q86,0 86,32 V68 Q86,100 54,100 H32 Q0,100 0,68 V32 Q0,0 32,0 Z';
  var G = {
    A: [86, 'M0,100 L43,0 L86,100'],
    B: [80, 'M0,0 V100 M0,0 H50 Q76,0 76,24 Q76,48 50,48 H0 M0,48 H54 Q80,48 80,74 Q80,100 54,100 H0'],
    C: [80, 'M80,0 H32 Q0,0 0,32 V68 Q0,100 32,100 H80'],
    D: [84, 'M0,0 H48 Q84,0 84,36 V64 Q84,100 48,100 H0'],
    E: [76, 'M76,0 H0 V100 H76 M0,50 H62'],
    F: [76, 'M76,0 H0 V100 M0,50 H62'],
    G: [84, 'M84,0 H32 Q0,0 0,32 V68 Q0,100 32,100 H84 V54 H48'],
    H: [82, 'M0,0 V100 M82,0 V100 M0,52 H82'],
    I: [0, 'M0,0 V100'],
    J: [66, 'M66,0 V68 Q66,100 34,100 H0'],
    K: [78, 'M0,0 V100 M78,0 L10,58 M32,40 L78,100'],
    L: [72, 'M0,0 V100 H72'],
    M: [96, 'M0,100 V0 L48,64 L96,0 V100'],
    N: [82, 'M0,100 V0 L82,100 V0'],
    O: [86, O],
    P: [80, 'M0,100 V0 H50 Q80,0 80,28 Q80,56 50,56 H0'],
    Q: [86, O + ' M56,72 L90,106'],
    R: [74, 'M0,100 V0 H46 Q74,0 74,28 Q74,56 46,56 H0 M40,56 L74,100'],
    S: [80, 'M80,0 H30 Q0,0 0,25 Q0,50 30,50 H50 Q80,50 80,75 Q80,100 50,100 H0'],
    T: [100, 'M0,0 H100 M50,0 V100'],
    U: [84, 'M0,46 V68 Q0,100 32,100 H52 Q84,100 84,68 V0'],
    V: [86, 'M0,0 L43,100 L86,0'],
    W: [108, 'M0,0 L24,100 L54,30 L84,100 L108,0'],
    X: [82, 'M0,0 L82,100 M82,0 L0,100'],
    Y: [76, 'M0,0 L38,52 L76,0 M38,52 V100'],
    Z: [80, 'M0,0 H80 L0,100 H80'],
    '0': [62, 'M18,0 H44 Q62,0 62,18 V82 Q62,100 44,100 H18 Q0,100 0,82 V18 Q0,0 18,0 Z'],
    '1': [30, 'M2,14 L30,0 V100'],
    '2': [62, 'M0,18 Q0,0 18,0 H44 Q62,0 62,18 V32 Q62,50 44,50 H18 Q0,50 0,68 V100 H62'],
    '3': [62, 'M0,0 H44 Q62,0 62,18 V32 Q62,50 44,50 H20 M44,50 Q62,50 62,68 V82 Q62,100 44,100 H0'],
    '4': [62, 'M48,100 V0 L0,68 V72 H62'],
    '5': [62, 'M62,0 H0 V48 H44 Q62,48 62,66 V82 Q62,100 44,100 H0'],
    '6': [62, 'M56,0 H18 Q0,0 0,18 V82 Q0,100 18,100 H44 Q62,100 62,82 V66 Q62,48 44,48 H0'],
    '7': [62, 'M0,0 H62 L18,100'],
    '8': [62, 'M18,0 H44 Q62,0 62,16 V32 Q62,48 44,48 H18 Q0,48 0,32 V16 Q0,0 18,0 Z M18,48 H44 Q62,48 62,66 V82 Q62,100 44,100 H18 Q0,100 0,82 V66 Q0,48 18,48 Z'],
    '9': [62, 'M62,52 H18 Q0,52 0,34 V18 Q0,0 18,0 H44 Q62,0 62,18 V82 Q62,100 44,100 H6'],
    ':': [12, 'M6,34 V35 M6,74 V75'],
    '.': [0, 'M0,99 V100'],
    '-': [44, 'M0,54 H44'],
    ' ': [48, '']
  };
  // no stub inside the A (the plain Λ looked better on the Edge, 2026-11-13)

  /**
   * Letters are drawn on a wide grid and narrowed slightly here: measured on the original, letters are about 0.8 cap
   * heights wide with gaps of about 0.8 cap heights. Scaling the path data (not the SVG) keeps the strokes even.
   */
  var LETTER_WIDTH = 0.96;
  function scaleX(d, f) {
    return d.replace(/([MLHVQ])([^MLHVQZ]*)/g, function (all, cmd, args) {
      var n = args.trim().split(/[\s,]+/).filter(Boolean).map(Number);
      if (cmd === 'V') return cmd + n.join(' ');
      if (cmd === 'H') return cmd + n.map(function (v) { return +(v * f).toFixed(2); }).join(' ');
      return cmd + n.map(function (v, i) { return i % 2 === 0 ? +(v * f).toFixed(2) : v; }).join(',').replace(/,(?=[^,]*$)/, ',');
    });
  }
  Object.keys(G).forEach(function (k) {
    if (!/^[A-Z]$/.test(k)) return;
    G[k] = [Math.round(G[k][0] * LETTER_WIDTH), scaleX(G[k][1], LETTER_WIDTH)];
  });

  // umlauts: base glyph plus two dots above (drawn as short round-capped lines)
  [['Ä', 'A', 35], ['Ö', 'O', 35], ['Ü', 'U', 34]].forEach(function (u) {
    var b = G[u[1]], c = u[2];
    G[u[0]] = [b[0], b[1], 'M' + (c - 16) + ',-18 V-17 M' + (c + 16) + ',-18 V-17'];
  });

  /**
   * Draws text as one SVG into el. o: { tracking (units between glyphs), stroke (units), cap ('round' | 'butt') }.
   * The SVG's cap height is 1em (= font size of el); widths follow the glyphs.
   */
  function render(el, text, o) {
    o = o || {};
    var tracking = o.tracking === undefined ? 30 : o.tracking;
    var stroke = o.stroke || 8, cap = o.cap === 'butt' ? 'butt' : 'round';
    var x = 0, paths = [], dots = [], pad = stroke;
    String(text).toUpperCase().split('').forEach(function (ch, i) {
      var g = G[ch] || G[' '];
      if (i > 0) x += tracking;
      if (g[1]) paths.push('<path transform="translate(' + x + ',0)" d="' + g[1] + '"/>');
      if (g[2]) dots.push('<path transform="translate(' + x + ',0)" d="' + g[2] + '"/>');
      x += g[0];
    });
    var w = x + pad * 2, h = 100 + pad * 2 + 24;
    el.innerHTML = '<svg class="glyphs" viewBox="' + (-pad) + ' ' + (-pad - 24) + ' ' + w + ' ' + h + '" ' +
      'style="height:' + (h / 100) + 'em;width:' + (w / 100) + 'em" aria-hidden="true">' +
      '<g fill="none" stroke="currentColor" stroke-width="' + stroke + '" stroke-linecap="' + cap + '" stroke-linejoin="round">' + paths.join('') + '</g>' +
      (dots.length ? '<g fill="none" stroke="currentColor" stroke-width="' + stroke * 1.4 + '" stroke-linecap="round">' + dots.join('') + '</g>' : '') +
      '</svg>';
    el.setAttribute('aria-label', text);
  }

  return { render: render, has: function (ch) { return !!G[ch]; } };
})();

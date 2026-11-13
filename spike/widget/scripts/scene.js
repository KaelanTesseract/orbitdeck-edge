// Orbitdeck spike – "Ringwelt" scene v3: textured ringed planet (Solar System Scope, CC BY 4.0), lit from the left,
// wide ring + rock belt, textured moons, Milky Way, sun glare, shooting stars, HDR bloom and colour grading.
// World units: planet radius 1. Camera at z = 8 looking down -z.
// Pipeline: scene (HDR) → bright pass (1/4) → blur H/V ×2 → wider glow (1/8) → composite (tone map, grade, vignette).
(function () {
  'use strict';

  var CAM_Z = 8.0;
  var FOCAL = 0.3;          // screen p (in screen heights) = (x / depth) / FOCAL
  var RING_IN = 1.3, RING_OUT = 3.0;     // ring texture stretched wider than real Saturn for the look

  var QUAD_VS = 'attribute vec2 aPos; varying vec2 vUv; void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }';

  var COMMON = [
    'precision highp float;',
    'uniform vec2 uRes; uniform float uTime; uniform float uSpin; uniform mat3 uTilt; uniform vec3 uCenter; uniform vec3 uAccent;',
    'const vec3 RO = vec3(0.0, 0.0, CAM_Z_C);',
    'const vec3 LDIR = vec3(-1.0, 0.14, -0.22);',
    'float sphereT(vec3 ro, vec3 rd){ vec3 oc = ro - uCenter; float b = dot(oc, rd); float c = dot(oc, oc) - 1.0; float h = b*b - c;',
    '  return (h > 0.0 && -b - sqrt(h) > 0.0) ? -b - sqrt(h) : 1e9; }'
  ].join('\n');

  var SCENE_FS = COMMON + '\n' + [
    'uniform vec4 uMet[3]; uniform vec4 uMoon[5]; uniform float uMoonFront[5]; uniform float uTonemap;',
    'uniform sampler2D uPlanetTex; uniform sampler2D uRingTex; uniform sampler2D uSkyTex;',
    'uniform sampler2D uMoonTex0; uniform sampler2D uMoonTex1; uniform sampler2D uMoonTex2;',
    'const float PI = 3.14159265;',
    'float hash2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    'float vnoise(vec2 x){ vec2 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);',
    '  return mix(mix(hash2(i), hash2(i+vec2(1,0)), f.x), mix(hash2(i+vec2(0,1)), hash2(i+vec2(1,1)), f.x), f.y); }',
    'vec3 lin(vec3 c){ return c * c; }',
    'vec4 ringSample(float r){',
    '  float x = (r - RING_IN_C) / (RING_OUT_C - RING_IN_C);',
    '  vec4 t = (x > 0.0 && x < 1.0) ? texture2D(uRingTex, vec2(x, 0.5)) : vec4(0.0);',
    '  float dust = smoothstep(2.9, 3.2, r) * smoothstep(4.0, 3.5, r) * (0.05 + 0.04 * sin(r * 23.0) + 0.03 * sin(r * 61.0));',
    '  vec3 c = lin(t.rgb) * vec3(1.6, 0.95, 0.45) * 2.0;',
    '  vec3 dc = vec3(0.8, 0.45, 0.18);',
    '  float a = clamp(t.a * 0.95 + dust, 0.0, 1.0);',
    '  return vec4(a > 0.0 ? (c * t.a * 0.95 + dc * dust) / a : vec3(0.0), a); }',
    'vec3 sky(vec2 p){',
    '  vec3 mw = lin(texture2D(uSkyTex, vec2(0.47 + p.x * 0.13, 0.52 - p.y * 0.13)).rgb);',
    '  vec3 col = mw * vec3(0.85, 0.92, 1.1) * 0.9;',
    '  for (int layer = 0; layer < 2; layer++){',
    '    float sc = 90.0 + float(layer) * 110.0; vec2 g = p * sc; vec2 id = floor(g); vec2 f = fract(g) - 0.5;',
    '    float h = hash2(id + float(layer) * 17.0);',
    '    if (h > 0.94){ vec2 o = vec2(hash2(id + 3.1), hash2(id + 7.7)) - 0.5; float d = length(f - o * 0.7);',
    '      float tw = 0.7 + 0.3 * sin(uTime * (0.8 + h * 2.5) + h * 40.0);',
    '      col += smoothstep(0.09, 0.0, d) * (h - 0.94) * 16.0 * tw * mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.85, 0.65), hash2(id + 1.3)); } }',
    '  float n = vnoise(p * 2.2 + 5.0) * vnoise(p * 4.7 + 1.0);',
    '  col += n * n * 0.25 * vec3(0.8, 0.45, 0.2) * smoothstep(0.6, -1.6, p.x);',
    '  return col; }',
    'vec3 moonTex(int i, vec2 uv){',
    '  if (i == 1 || i == 4) return lin(texture2D(uMoonTex1, uv).rgb);',
    '  if (i == 2) return lin(texture2D(uMoonTex2, uv).rgb);',
    '  return lin(texture2D(uMoonTex0, uv).rgb); }',
    'vec3 moons(vec2 p, vec3 col, float front){',
    '  vec3 L = normalize(vec3(-1.0, 0.22, 0.25));',
    '  for (int i = 0; i < 5; i++){',
    '    if (abs(uMoonFront[i] - front) > 0.5) continue;',
    '    vec4 m = uMoon[i]; vec2 q = (p - m.xy) / m.z; float r = length(q);',
    '    if (r < 1.0){',
    '      vec3 nrm = vec3(q, sqrt(1.0 - r * r)); float ndl = dot(nrm, L);',
    '      vec2 uv = vec2(atan(nrm.x, nrm.z) / (2.0 * PI) + 0.5 + m.w + uTime * 0.006, acos(clamp(nrm.y, -1.0, 1.0)) / PI);',
    '      vec3 t = moonTex(i, uv) * vec3(1.2, 0.82, 0.55);',
    '      vec3 c = t * (0.008 + 2.4 * smoothstep(-0.05, 1.0, ndl)) + vec3(1.0, 0.6, 0.3) * pow(1.0 - nrm.z, 4.0) * max(ndl, 0.0) * 1.5;',
    '      col = mix(col, c, smoothstep(1.0, 1.0 - 2.0 / (m.z * uRes.y), r));',
    '    } }',
    '  return col; }',
    'void main(){',
    '  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;',
    '  vec3 rd = normalize(vec3(p * FOCAL_C, -1.0));',
    '  vec3 L = normalize(LDIR);',
    '  vec3 col = moons(p, sky(p), 0.0);',
    '  vec3 oc = RO - uCenter; float b = dot(oc, rd);',
    '  vec3 cp = oc + rd * (-b); float miss = length(cp); float sunSide = dot(normalize(cp), L);',
    '  vec3 glowC = vec3(1.0, 0.5, 0.16);',
    '  col += exp(-max(miss - 1.0, 0.0) * 9.0) * (0.03 + 0.7 * pow(max(sunSide, 0.0), 2.0)) * glowC;',
    '  float tS = sphereT(RO, rd);',
    '  vec3 n = uTilt[1]; float tR = dot(uCenter - RO, n) / dot(rd, n);',
    '  vec3 rp = RO + rd * tR - uCenter; float r = length(rp);',
    '  vec4 ring = tR > 0.0 ? ringSample(r) : vec4(0.0);',
    '  if (tS < 1e8){',
    '    vec3 hp = RO + rd * tS; vec3 nn = normalize(hp - uCenter);',
    '    vec3 lp = nn * uTilt;',
    '    float cs = cos(uSpin), sn = sin(uSpin); lp = vec3(cs * lp.x + sn * lp.z, lp.y, -sn * lp.x + cs * lp.z);',
    '    vec2 uv = vec2(atan(lp.z, lp.x) / (2.0 * PI) + 0.5, acos(clamp(lp.y, -1.0, 1.0)) / PI);',
    '    vec3 base = lin(texture2D(uPlanetTex, uv).rgb) * 1.3;',               // baked amber map (tools/bake_planet.py)
    '    base = mix(base, base * (0.55 + uAccent * 0.9), 0.08);',
    '    float ndl = dot(nn, L);',
    '    float diff = smoothstep(-0.08, 1.0, ndl);',
    '    float tRs = dot(uCenter - hp, n) / dot(L, n);',
    '    if (tRs > 0.0){ float rs = length(hp + L * tRs - uCenter); diff *= 1.0 - 0.7 * ringSample(rs).a; }',
    '    float rim = pow(1.0 - max(dot(nn, -rd), 0.0), 2.5);',
    '    float scatter = pow(max(dot(rd, L), 0.0), 6.0);',
    '    col = base * (0.012 + 1.0 * diff) + glowC * rim * (0.03 + 1.3 * smoothstep(-0.2, 0.8, ndl)) + glowC * rim * scatter * 2.0;',
    '  }',
    '  if (ring.a > 0.0 && tR < tS){',
    '    vec3 wp = rp + uCenter;',
    '    float lit = sphereT(wp, L) < 1e8 ? 0.05 : 1.0;',
    '    float grain = 0.85 + 0.15 * hash2(vec2(r * 1500.0, 1.0));',
    '    float fwd = 1.0 + 1.2 * smoothstep(0.0, -4.0, wp.x - uCenter.x);',
    '    col = mix(col, ring.rgb * grain * (0.015 + 1.0 * lit * fwd), ring.a);',
    '  }',
    '  col = moons(p, col, 1.0);',
    '  vec2 pc2 = uCenter.xy / (RO.z - uCenter.z) / FOCAL_C;',
    '  vec2 sun = pc2 + vec2(-0.405, 0.06); float d = length(p - sun); float occ = tS < 1e8 ? 0.3 : 1.0;',
    '  col += glowC * (exp(-d * 7.0) * 0.45 * occ + 0.0012 / (d * d + 0.0008));',
    '  col += vec3(1.0, 0.7, 0.4) * exp(-abs(p.y - sun.y) * 260.0) * exp(-abs(p.x - sun.x) * 3.5) * 0.45;',
    '  for (int i = 0; i < 3; i++){',
    '    vec4 m = uMet[i]; if (m.w <= 0.0 || m.w >= 1.0) continue;',
    '    vec2 dir = vec2(cos(m.z), sin(m.z)); vec2 head = m.xy + dir * m.w * 0.9; vec2 tail = head - dir * 0.22;',
    '    vec2 pa = p - tail, ba = head - tail; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);',
    '    float dd = length(pa - ba * h); float fade = sin(m.w * 3.14159);',
    '    col += vec3(1.0, 0.92, 0.8) * smoothstep(0.002, 0.0, dd) * h * h * fade * 2.5;',
    '  }',
    '  if (uTonemap > 0.5) col = 1.0 - exp(-col * 1.1);',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  var ROCK_VS = COMMON + '\n' + [
    'attribute vec4 aRock; attribute float aSeed;',
    'uniform float uOrbit;',
    'varying float vShade; varying float vSeed; varying float vFwd;',
    'void main(){',
    '  float ang = aRock.x + uOrbit / pow(aRock.y, 1.5);',
    '  vec3 lp = vec3(cos(ang) * aRock.y, aRock.z, sin(ang) * aRock.y);',
    '  vec3 wp = uTilt * lp + uCenter;',
    '  vec3 v = wp - RO; float dist = length(v); vec3 rd = v / dist;',
    '  vec2 p = (v.xy / -v.z) / FOCAL_C;',
    '  gl_Position = vec4(p.x * 2.0 * uRes.y / uRes.x, p.y * 2.0, 0.0, 1.0);',
    '  float sz = aRock.w * uRes.y / (FOCAL_C * dist);',
    '  if (sphereT(RO, rd) < dist) sz = 0.0;',
    '  vShade = sphereT(wp, normalize(LDIR)) < 1e8 ? 0.06 : 1.0;',
    '  vFwd = 1.0 + 1.0 * smoothstep(0.0, -4.0, wp.x - uCenter.x);',
    '  vSeed = aSeed;',
    '  gl_PointSize = sz;',
    '}'
  ].join('\n');

  var ROCK_FS = [
    'precision highp float;',
    'varying float vShade; varying float vSeed; varying float vFwd;',
    'float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    'float vn(vec2 x){ vec2 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);',
    '  return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }',
    'void main(){',
    '  vec2 q = gl_PointCoord * 2.0 - 1.0; q.y = -q.y;',
    '  float ang = atan(q.y, q.x);',
    '  float edge = 0.84 + 0.08 * sin(ang * 2.0 + vSeed * 20.0) + 0.06 * sin(ang * 5.0 + vSeed * 7.0);',
    '  float r = length(q); if (r > edge) discard;',
    '  vec2 s = q * 2.5 + vSeed * 31.0;',
    '  float bump = vn(s) * 0.6 + vn(s * 2.3) * 0.4;',
    '  vec3 nrm = normalize(vec3(q / edge + (bump - 0.5) * 0.7, sqrt(max(1.0 - r * r / (edge * edge), 0.0))));',
    '  float diff = max(dot(nrm, normalize(vec3(-1.0, 0.3, 0.3))), 0.0);',
    '  vec3 c = mix(vec3(0.2, 0.12, 0.06), vec3(0.38, 0.22, 0.1), fract(vSeed * 13.7)) * (0.7 + 0.6 * bump);',
    '  vec3 lit = c * (0.01 + diff * 2.6 * vShade * vFwd) + vec3(1.0, 0.55, 0.2) * pow(diff, 5.0) * 0.9 * vShade * vFwd;',
    '  gl_FragColor = vec4(lit, smoothstep(edge, edge - 0.25, r));',
    '}'
  ].join('\n');

  var BRIGHT_FS = [
    'precision highp float; varying vec2 vUv; uniform sampler2D uTex; uniform vec2 uTexel; uniform float uThreshold;',
    'void main(){',
    '  vec3 c = texture2D(uTex, vUv + uTexel * vec2(-1.0, -1.0)).rgb + texture2D(uTex, vUv + uTexel * vec2(1.0, -1.0)).rgb',
    '         + texture2D(uTex, vUv + uTexel * vec2(-1.0, 1.0)).rgb + texture2D(uTex, vUv + uTexel * vec2(1.0, 1.0)).rgb;',
    '  c *= 0.25;',
    '  float l = max(c.r, max(c.g, c.b));',
    '  gl_FragColor = vec4(c * max(l - uThreshold, 0.0) / max(l, 1e-4), 1.0);',
    '}'
  ].join('\n');

  var BLUR_FS = [
    'precision highp float; varying vec2 vUv; uniform sampler2D uTex; uniform vec2 uDir;',
    'void main(){',
    '  vec3 c = texture2D(uTex, vUv).rgb * 0.227;',
    '  c += (texture2D(uTex, vUv + uDir * 1.385).rgb + texture2D(uTex, vUv - uDir * 1.385).rgb) * 0.316;',
    '  c += (texture2D(uTex, vUv + uDir * 3.231).rgb + texture2D(uTex, vUv - uDir * 3.231).rgb) * 0.07;',
    '  gl_FragColor = vec4(c, 1.0);',
    '}'
  ].join('\n');

  var COMPOSITE_FS = [
    'precision highp float; varying vec2 vUv; uniform sampler2D uScene; uniform sampler2D uBloom; uniform sampler2D uBloom2;',
    'uniform float uHdr; uniform vec2 uRes; uniform float uTime; uniform float uBright;',
    'float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    'void main(){',
    '  vec3 c = texture2D(uScene, vUv).rgb;',
    '  vec3 b = texture2D(uBloom, vUv).rgb * 0.55 + texture2D(uBloom2, vUv).rgb * 0.45;',
    '  if (uHdr > 0.5){',
    '    c += b * 0.5;',
    '    c = 1.0 - exp(-c * 1.05);',
    '  } else { c += b * 0.7; }',
    '  c = sqrt(max(c, 0.0));',
    '  float l = dot(c, vec3(0.299, 0.587, 0.114));',
    '  c = mix(c, c * vec3(0.92, 0.96, 1.08), smoothstep(0.35, 0.0, l));',
    '  c = mix(c, c * vec3(1.06, 1.0, 0.9), smoothstep(0.4, 1.0, l));',
    '  c = (c - 0.5) * 1.06 + 0.5 - 0.012;',
    '  vec2 v = (vUv - 0.5) * vec2(uRes.x / uRes.y * 0.45, 1.0);',
    '  c *= mix(1.0, smoothstep(1.1, 0.25, length(v)), 0.55);',
    '  c *= uBright;',
    '  c += (h2(vUv * uRes + fract(uTime) * 91.0) - 0.5) / 160.0;',
    '  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);',
    '}'
  ].join('\n');

  function fill(src) {
    return src.replace(/FOCAL_C/g, FOCAL.toFixed(4)).replace(/CAM_Z_C/g, CAM_Z.toFixed(2))
      .replace(/RING_IN_C/g, RING_IN.toFixed(3)).replace(/RING_OUT_C/g, RING_OUT.toFixed(3));
  }
  function compile(gl, type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, fill(src)); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function program(gl, vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }
  function uniforms(gl, p, names) {
    var u = {}; names.forEach(function (n) { u[n] = gl.getUniformLocation(p, n); }); return u;
  }

  function tiltMatrix(pitch, roll) {
    var cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
    return new Float32Array([cr, sr, 0, -sr * cp, cr * cp, sp, sr * sp, -cr * sp, cp]);
  }

  // moon orbits around the planet, in screen heights: half axes a/b, period in s, start angle, radius, texture offset.
  // Index picks the texture in the shader: 0/3 moon, 1/4 mercury, 2 ceres.
  var ORBITS = [
    { a: 1.75, b: 0.34, period: 220, phase: 2.6, r: 0.075, tex: 0.11 },
    { a: 1.25, b: 0.24, period: 130, phase: 0.9, r: 0.032, tex: 0.47 },
    { a: 2.15, b: 0.42, period: 320, phase: 4.0, r: 0.05, tex: 0.73 },
    { a: 0.98, b: 0.2, period: 75, phase: 3.3, r: 0.02, tex: 0.21 },
    { a: 1.5, b: 0.52, period: 180, phase: 5.5, r: 0.016, tex: 0.92 }
  ];
  var ORBIT_ROLL = 0.15;   // same screen tilt as the ring

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image(); img.onload = function () { resolve(img); }; img.onerror = function () { reject(new Error('Bild laedt nicht')); };
      img.src = src;
    });
  }

  function createScene(canvas, textures) {
    var opts = { antialias: false, alpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' };
    var gl = canvas.getContext('webgl2', opts), gl2 = !!gl;
    if (!gl) gl = canvas.getContext('webgl', opts);
    if (!gl) throw new Error('WebGL nicht verfuegbar');
    var hdr = gl2 && !!gl.getExtension('EXT_color_buffer_float');

    var sceneP = program(gl, QUAD_VS, SCENE_FS);
    var rockP = program(gl, ROCK_VS, ROCK_FS);
    var brightP = program(gl, QUAD_VS, BRIGHT_FS);
    var blurP = program(gl, QUAD_VS, BLUR_FS);
    var compP = program(gl, QUAD_VS, COMPOSITE_FS);
    var U = ['uRes', 'uTime', 'uSpin', 'uTilt', 'uCenter', 'uAccent'];
    var su = uniforms(gl, sceneP, U.concat(['uMet', 'uMoon', 'uMoonFront', 'uTonemap', 'uPlanetTex', 'uRingTex', 'uSkyTex', 'uMoonTex0', 'uMoonTex1', 'uMoonTex2']));
    var ru = uniforms(gl, rockP, U.concat(['uOrbit']));
    var bu = uniforms(gl, brightP, ['uTex', 'uTexel', 'uThreshold']);
    var lu = uniforms(gl, blurP, ['uTex', 'uDir']);
    var cu = uniforms(gl, compP, ['uScene', 'uBloom', 'uBloom2', 'uHdr', 'uRes', 'uTime', 'uBright']);

    var quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    var tex = {}, ready = false, loadError = '';
    function makeTex(img, wrapS) {
      var t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    }
    var names = ['saturn', 'ring', 'moon', 'mercury', 'ceres', 'sky'];
    Promise.all(names.map(function (n) { return loadImage(textures[n]); })).then(function (imgs) {
      imgs.forEach(function (img, i) { tex[names[i]] = makeTex(img, names[i] === 'ring' ? gl.CLAMP_TO_EDGE : gl.REPEAT); });
      ready = true;
    }).catch(function (e) { loadError = String(e.message || e); });

    function target(w, h) {
      var t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      if (hdr) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      var fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { tex: t, fb: fb, w: w, h: h };
    }
    function free(t) { if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); } }
    var rt = null;

    var rockBuf = gl.createBuffer(), rockCount = 0;
    function setRocks(n) {
      var data = new Float32Array(n * 5), seed = 12345;
      function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
      for (var i = 0; i < n; i++) {
        var g = (rnd() + rnd() + rnd() + rnd() + rnd()) / 5;
        data[i * 5] = rnd() * Math.PI * 2;
        data[i * 5 + 1] = 2.45 + g * 1.4;
        data[i * 5 + 2] = (rnd() - 0.5) * 0.07;
        data[i * 5 + 3] = 0.005 + Math.pow(rnd(), 9) * 0.075;
        data[i * 5 + 4] = rnd();
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, rockBuf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      rockCount = n;
    }
    setRocks(2400);

    var state = { moonSpeed: 1, scale: 1, bloom: true, bright: 1, accent: [0.95, 0.62, 0.3], spinPeriod: 300, meteors: [], nextMeteor: 4 };
    var tilt = tiltMatrix(0.115, 0.15);
    var center = [0.2, -0.05, 0];
    var metData = new Float32Array(12), moonData = new Float32Array(20), moonFront = new Float32Array(5);
    var planetP = [center[0] / (CAM_Z - center[2]) / FOCAL, center[1] / (CAM_Z - center[2]) / FOCAL];
    function updateMoons(t) {
      var cr = Math.cos(ORBIT_ROLL), sr = Math.sin(ORBIT_ROLL);
      ORBITS.forEach(function (o, i) {
        var th = o.phase + t * Math.PI * 2 / o.period * state.moonSpeed;
        var x = o.a * Math.cos(th), y = -o.b * Math.sin(th), front = Math.sin(th) > 0;   // lower half = towards the camera
        moonData[i * 4] = planetP[0] + x * cr - y * sr;
        moonData[i * 4 + 1] = planetP[1] + x * sr + y * cr;
        moonData[i * 4 + 2] = o.r * (1 + 0.2 * Math.sin(th));                           // a little bigger when closer
        moonData[i * 4 + 3] = o.tex;
        moonFront[i] = front ? 1 : 0;
      });
    }

    function resize() {
      var w = Math.max(16, Math.round(canvas.clientWidth * state.scale)), h = Math.max(16, Math.round(canvas.clientHeight * state.scale));
      if (canvas.width !== w || canvas.height !== h || !rt) {
        canvas.width = w; canvas.height = h;
        if (rt) { free(rt.scene); free(rt.a); free(rt.b); free(rt.c); free(rt.d); }
        rt = { scene: target(w, h), a: target(w >> 2, h >> 2), b: target(w >> 2, h >> 2), c: target(w >> 3, h >> 3), d: target(w >> 3, h >> 3) };
      }
    }

    function updateMeteors(t) {
      if (t > state.nextMeteor) {
        var shower = Math.random() < 0.12, count = shower ? 3 : 1;
        for (var k = 0; k < count && state.meteors.length < 3; k++) {
          state.meteors.push({ x: (Math.random() - 0.5) * 3.0, y: 0.3 + Math.random() * 0.15,
            a: Math.PI + 0.3 + Math.random() * 0.35, start: t + k * 0.3, dur: 0.9 + Math.random() * 0.6 });
        }
        state.nextMeteor = t + (shower ? 14 : 6 + Math.random() * 9);
      }
      state.meteors = state.meteors.filter(function (m) { return t < m.start + m.dur; });
      for (var i = 0; i < 3; i++) {
        var m = state.meteors[i];
        metData[i * 4] = m ? m.x : 0; metData[i * 4 + 1] = m ? m.y : 0; metData[i * 4 + 2] = m ? m.a : 0;
        metData[i * 4 + 3] = m ? Math.max(0, (t - m.start) / m.dur) : 0;
      }
    }

    function setCommon(u, t) {
      gl.uniform2f(u.uRes, canvas.width, canvas.height);
      gl.uniform1f(u.uTime, t);
      gl.uniform1f(u.uSpin, state.spinPeriod > 0 ? t * Math.PI * 2 / state.spinPeriod : 0);
      gl.uniformMatrix3fv(u.uTilt, false, tilt);
      gl.uniform3fv(u.uCenter, center);
      gl.uniform3fv(u.uAccent, state.accent);
    }
    function bindTex(unit, t, loc) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(loc, unit); }
    function drawQuad(prog) {
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      var ap = gl.getAttribLocation(prog, 'aPos');
      gl.enableVertexAttribArray(ap); gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disableVertexAttribArray(ap);
    }
    function to(target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
      gl.viewport(0, 0, target ? target.w : canvas.width, target ? target.h : canvas.height);
    }
    function blur(src, tmp, w, h) {
      gl.useProgram(blurP);
      for (var k = 0; k < 2; k++) {
        to(tmp); bindTex(0, src.tex, lu.uTex); gl.uniform2f(lu.uDir, 1.6 / w, 0); drawQuad(blurP);
        to(src); bindTex(0, tmp.tex, lu.uTex); gl.uniform2f(lu.uDir, 0, 1.6 / h); drawQuad(blurP);
      }
    }

    function draw(t) {
      resize();
      if (!ready) { to(null); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); return; }
      updateMeteors(t);

      to(rt.scene);
      gl.disable(gl.BLEND);
      gl.useProgram(sceneP);
      setCommon(su, t);
      gl.uniform4fv(su.uMet, metData);
      updateMoons(t);
      gl.uniform4fv(su.uMoon, moonData); gl.uniform1fv(su.uMoonFront, moonFront);
      gl.uniform1f(su.uTonemap, hdr ? 0 : 1);
      bindTex(0, tex.saturn, su.uPlanetTex); bindTex(1, tex.ring, su.uRingTex); bindTex(2, tex.sky, su.uSkyTex);
      bindTex(3, tex.moon, su.uMoonTex0); bindTex(4, tex.mercury, su.uMoonTex1); bindTex(5, tex.ceres, su.uMoonTex2);
      drawQuad(sceneP);
      if (rockCount > 0) {
        gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(rockP);
        setCommon(ru, t);
        gl.uniform1f(ru.uOrbit, t * 0.03);
        gl.bindBuffer(gl.ARRAY_BUFFER, rockBuf);
        var ar = gl.getAttribLocation(rockP, 'aRock'), as = gl.getAttribLocation(rockP, 'aSeed');
        gl.enableVertexAttribArray(ar); gl.vertexAttribPointer(ar, 4, gl.FLOAT, false, 20, 0);
        gl.enableVertexAttribArray(as); gl.vertexAttribPointer(as, 1, gl.FLOAT, false, 20, 16);
        gl.drawArrays(gl.POINTS, 0, rockCount);
        gl.disableVertexAttribArray(ar); gl.disableVertexAttribArray(as);
        gl.disable(gl.BLEND);
      }

      if (state.bloom) {
        gl.useProgram(brightP);
        to(rt.a); bindTex(0, rt.scene.tex, bu.uTex);
        gl.uniform2f(bu.uTexel, 1 / rt.scene.w, 1 / rt.scene.h); gl.uniform1f(bu.uThreshold, hdr ? 1.8 : 0.75);
        drawQuad(brightP);
        blur(rt.a, rt.b, rt.a.w, rt.a.h);
        to(rt.c); bindTex(0, rt.a.tex, bu.uTex);
        gl.uniform2f(bu.uTexel, 1 / rt.a.w, 1 / rt.a.h); gl.uniform1f(bu.uThreshold, 0.0);
        drawQuad(brightP);
        blur(rt.c, rt.d, rt.c.w, rt.c.h);
      } else {
        gl.clearColor(0, 0, 0, 1);
        to(rt.a); gl.clear(gl.COLOR_BUFFER_BIT);
        to(rt.c); gl.clear(gl.COLOR_BUFFER_BIT);
      }

      to(null);
      gl.useProgram(compP);
      bindTex(0, rt.scene.tex, cu.uScene); bindTex(1, rt.a.tex, cu.uBloom); bindTex(2, rt.c.tex, cu.uBloom2);
      gl.uniform1f(cu.uHdr, hdr ? 1 : 0); gl.uniform2f(cu.uRes, canvas.width, canvas.height);
      gl.uniform1f(cu.uTime, t); gl.uniform1f(cu.uBright, state.bright);
      drawQuad(compP);
    }

    function sync() { var px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }

    function info() {
      var ext = gl.getExtension('WEBGL_debug_renderer_info');
      return { renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), gl2: gl2, hdr: hdr };
    }

    return {
      draw: draw, sync: sync, info: info, setRocks: setRocks,
      setScale: function (s) { state.scale = s; },
      setBloom: function (b) { state.bloom = b; },
      setAccent: function (rgb) { state.accent = rgb; },
      get rocks() { return rockCount; }, get scale() { return state.scale; }, get bloom() { return state.bloom; },
      get ready() { return ready; }, get loadError() { return loadError; }
    };
  }

  window.OrbitScene = { create: createScene };
})();

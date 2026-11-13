// Sensor access (taken over from Specdeck Edge): a promise bridge for the iCUE Sensors plugin plus the
// automatic sensor choice. iCUE's own default for a sensors-combobox is "the first sensor of that
// type", which is often wrong (e.g. AIO coolant instead of CPU package). Orbitdeck always picks the
// best matching sensor itself (tuned on real sensor lists, see Specdeck Edge).
var OrbitSensors = (function () {
  'use strict';

  var TIMEOUT_MS = 4000;

  /** Promise wrapper for the requestId/asyncResponse pattern of both plugins. */
  function Bridge(plugin) {
    this.plugin = plugin;
    this.next = 1;
    this.pending = {};
    var self = this;
    plugin.asyncResponse.connect(function (id, value) {
      var p = self.pending[id];
      if (!p) return;
      delete self.pending[id];
      clearTimeout(p.timer);
      p.resolve(value);
    });
  }

  Bridge.prototype.call = function (method) {
    var args = Array.prototype.slice.call(arguments, 1);
    var self = this;
    return new Promise(function (resolve, reject) {
      var id = self.next++;
      if (self.next > 2000000000) self.next = 1;
      var timer = setTimeout(function () {
        delete self.pending[id];
        reject(new Error('timeout ' + method));
      }, TIMEOUT_MS);
      self.pending[id] = { resolve: resolve, timer: timer };
      try {
        self.plugin[method].apply(self.plugin, [id].concat(args));
      } catch (e) {
        clearTimeout(timer);
        delete self.pending[id];
        reject(e);
      }
    });
  };

  // ---------- metric definitions ----------

  var CPU_DEV = /\b(intel|amd|ryzen|core\s?(i|ultra)|threadripper|xeon|epyc|cpu|processor|prozessor)\b/i;
  var GPU_DEV = /\b(nvidia|geforce|rtx|gtx|radeon|rx\s?\d|arc\s?[ab]\d|gpu|graphics|grafik)\b/i;
  // integrated graphics (e.g. "AMD Radeon(TM) Graphics" of a Ryzen) - a dedicated card is preferred
  var IGPU = /radeon\(tm\) graphics|radeon graphics|integrated|uhd graphics|iris|vega \d/i;
  var NOT_CPU = /\b(liquid|coolant|water|fl[uü]ssig|k[uü]hlmittel|dimm|dram|ram|memory|ssd|nvme|hdd|disk|vrm|chipset|pch|motherboard|mainboard|system|ambient|psu|gpu)\b/i;

  /**
   * Sensor fields are compared normalised (lower case, letters/digits only): the docs write types as
   * "frame-buffer-load", iCUE 5.52 itself uses names like "FrameBufferLoad" or "TemperaturePackage".
   * Every sensor gets s.t / s.k (normalised type / kind) and s.cpu / s.gpu (belongs to the processor /
   * graphics card – by device name, or by being the device that reports the CPU package / GPU load).
   * prop: iCUE property name; type/kind: arguments of iCUE's default (must match index.html);
   * score: the highest positive score wins.
   */
  function norm(v) { return String(v || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function has(s, word) { return s.t.indexOf(word) >= 0 || s.k.indexOf(word) >= 0; }
  var isTemp = function (s) { return s.t.indexOf('temperature') >= 0; };
  var isPlainLoad = function (s) { return s.t === 'load'; };
  var isPower = function (s) { return s.t.indexOf('power') >= 0; };

  var METRICS = {
    cpuTemp: {
      prop: 'cpuTempSensor', type: 'temperature', kind: 'cpu-temp',
      score: function (s) {
        if (!isTemp(s)) return -1;
        var v = 1;
        if (s.k === 'cputemp') v += 6;
        if (has(s, 'package')) v += 5;
        if (/package|paket|tctl|tdie|cpu/i.test(s.name)) v += 3;
        if (s.cpu) v += 4;
        if (/core\s*#?\d|ccd\s*\d/i.test(s.name)) v -= 1; // single core: package is better
        if (NOT_CPU.test(s.name) || (!s.cpu && NOT_CPU.test(s.device)) || s.gpu) v -= 8;
        return v;
      }
    },
    cpuLoad: {
      prop: 'cpuLoadSensor', type: 'load', kind: '',
      score: function (s) {
        if (!isPlainLoad(s)) return -1;
        var v = 1;
        if (s.cpu) v += 5;
        if (/total|package|cpu|gesamt/i.test(s.name)) v += 2;
        if (/core\s*#?\d/i.test(s.name)) v -= 2;
        if (s.k.indexOf('load') >= 0) v -= 6; // gpu-load, memory-load, ...
        if (s.gpu || /memory|ram|disk|speicher/i.test(s.name)) v -= 8;
        return v;
      }
    },
    gpuTemp: {
      prop: 'gpuTempSensor', type: 'temperature', kind: 'gpu-temp',
      score: function (s) {
        if (!isTemp(s)) return -1;
        var v = 0;
        if (s.k === 'gputemp') v += 6;
        if (s.gpu) v += 4;
        if (/gpu|core|edge/i.test(s.name)) v += 2;
        if (/hot\s?spot|junction|memory|vram|mem|speicher/i.test(s.name)) v -= 2;
        if (s.cpu && !s.gpu) v -= 6;
        v += gpuPref(s);
        return v;
      }
    },
    gpuLoad: {
      prop: 'gpuLoadSensor', type: 'load', kind: 'gpu-load',
      score: function (s) {
        if (!(isPlainLoad(s) || s.t === 'gpuload')) return -1;
        var v = 0;
        if (s.k === 'gpuload' || s.t === 'gpuload') v += 6;
        if (s.gpu) v += 3;
        if (/gpu|core|3d/i.test(s.name)) v += 1;
        if (has(s, 'framebuffer') || has(s, 'videoengine') || has(s, 'businterface') || has(s, 'memoryload')) v -= 6;
        if (/memory|video|bus|encode|decode|speicher/i.test(s.name)) v -= 3;
        v += gpuPref(s);
        return v;
      }
    },
    fan: {
      prop: 'fanSensor', type: 'pump', kind: 'cpu-pump',
      score: function (s) {
        var v;
        if (has(s, 'pump')) v = 5;
        else if (s.t.indexOf('fan') >= 0) v = 3;
        else return -1;
        if (s.k === 'cpupump') v += 2;
        if (/cpu|pump/i.test(s.name)) v += 1;
        if (s.gpu || s.k === 'gpupump') v -= 2;
        return v;
      }
    },
    ram: {
      prop: 'ramSensor', type: 'load', kind: 'memory-load',
      score: function (s) {
        if (!(isPlainLoad(s) || s.t === 'memoryload')) return -1;
        if (!s.device) return -1; // nameless sensors are leftovers, never trusted as system RAM
        var v = 0;
        if (has(s, 'memoryload')) v += 5;
        if (/memory|ram|speicher/i.test(s.name)) v += 3;
        if (s.gpu || s.k === 'gpuload' || /vram|gpu|virtual|grafik/i.test(s.name)) v -= 8;
        return v;
      }
    },
    // graphics memory in use – only shown when the PC reports no system RAM sensor
    vram: {
      prop: 'vramSensor', type: 'load', kind: 'frame-buffer-load',
      score: function (s) {
        var v = 0;
        if (has(s, 'framebuffer')) v += 6;
        if (/bildspeicher|frame\s?buffer|vram|dedicated/i.test(s.name)) v += 4;
        if (v === 0) return -1;
        if (s.gpu) v += 2;
        v += gpuPref(s);
        return v;
      }
    },
    cpuPower: {
      prop: 'cpuPowerSensor', type: 'power', kind: 'package',
      score: function (s) {
        if (!isPower(s)) return -1;
        // only power that clearly belongs to the CPU (not RAM modules, PSU, coolers, ...)
        if (!s.cpu && !/\bcpu\b/i.test(s.name)) return -1;
        var v = 1;
        if (s.cpu) v += 5;
        if (has(s, 'package') || /package|paket|cpu/i.test(s.name)) v += 3;
        if (/core\s*#?\d/i.test(s.name)) v -= 1;
        if (s.gpu || has(s, 'powerin') || has(s, 'powerout')) v -= 8;
        return v;
      }
    },
    gpuPower: {
      prop: 'gpuPowerSensor', type: 'power', kind: '',
      score: function (s) {
        if (!isPower(s)) return -1;
        // only power that clearly belongs to the graphics card
        if (!s.gpu && !/\bgpu\b/i.test(s.name)) return -1;
        var v = 1;
        if (s.gpu) v += 5;
        if (/gpu|board|total|package|gesamt/i.test(s.name)) v += 2;
        if (s.cpu && !s.gpu) v -= 8;
        v += gpuPref(s);
        return v;
      }
    }
  };

  /** Bonus for the dedicated graphics card, malus for duplicates without a device name. */
  function gpuPref(s) { return (IGPU.test(s.device) ? -3 : 0) + (s.device ? 0 : -1); }

  /** Adds s.t, s.k, s.cpu, s.gpu to every sensor of a catalog list. */
  function classify(list) {
    list.forEach(function (s) { s.t = norm(s.type); s.k = norm(s.kind); });
    var cpuDev = '', gpuDev = '';
    list.forEach(function (s) {
      if (!cpuDev && s.device && isTemp(s) && (s.k === 'cputemp' || has(s, 'package'))) cpuDev = s.device;
      if (!gpuDev && s.device && !IGPU.test(s.device) && (s.k === 'gpuload' || s.t === 'gpuload' || s.k === 'gputemp' ||
          has(s, 'framebuffer') || has(s, 'videoengine') || has(s, 'businterface'))) gpuDev = s.device;
    });
    if (cpuDev === gpuDev) cpuDev = gpuDev = '';
    list.forEach(function (s) {
      s.gpu = GPU_DEV.test(s.device) || (!!gpuDev && s.device === gpuDev);
      s.cpu = !s.gpu && (CPU_DEV.test(s.device) || (!!cpuDev && s.device === cpuDev));
    });
    // iCUE lists some graphics card sensors twice, once without a device name: same type/kind/name
    // as a GPU sensor -> it belongs to the GPU too (otherwise "memory load" looks like system RAM)
    list.forEach(function (s) {
      if (s.device) return;
      s.gpu = list.some(function (o) { return o.gpu && o.t === s.t && o.k === s.k && o.name === s.name; });
    });
    return list;
  }

  // ---------- sensor service ----------

  function Service(plugin) {
    this.bridge = new Bridge(plugin);
    this.plugin = plugin;
    this.catalog = null;    // id -> { type, kind, name, device }
    this.units = {};        // id -> units
    this.loading = null;
    this.fanSeen = {};      // id -> true once a fan/pump reported more than 0 RPM
    this.lastProbe = 0;
  }

  /**
   * Some boards list fan headers that never report data (seen on a Gigabyte X870E: "Lüfter #1-3" stay at 0).
   * Every 15 s all non-GPU fans/pumps are read once; only those that ever showed > 0 RPM may be
   * chosen automatically. Graphics card fans are always allowed (0 RPM there is the idle fan stop).
   */
  var PROBE_EVERY_MS = 15000;
  function isFanLike(s) { return has(s, 'pump') || s.t.indexOf('fan') >= 0; }

  Service.prototype.probeFans = function () {
    var now = Date.now();
    if (!this.catalog || now - this.lastProbe < PROBE_EVERY_MS) return Promise.resolve();
    this.lastProbe = now;
    var self = this, cat = this.catalog;
    return Promise.all(Object.keys(cat).filter(function (id) {
      return isFanLike(cat[id]) && !cat[id].gpu && !self.fanSeen[id];
    }).map(function (id) {
      return self.read(id).then(function (v) { if (v !== null && v > 0) self.fanSeen[id] = true; }, function () {});
    }));
  };

  /** May a sensor be chosen automatically for a metric? */
  Service.prototype.allowed = function (metric, s) {
    if (metric === 'fan' && !s.gpu && !this.fanSeen[s.id]) return false;
    return true;
  };

  Service.prototype.loadCatalog = function () {
    if (this.loading) return this.loading;
    var self = this;
    this.loading = this.bridge.call('getAllSensorIds').then(function (ids) {
      ids = Array.isArray(ids) ? ids : [];
      return Promise.all(ids.map(function (id) {
        return Promise.all([
          self.bridge.call('getSensorType', id).catch(function () { return ''; }),
          self.bridge.call('getSensorKind', id).catch(function () { return ''; }),
          self.bridge.call('getSensorName', id).catch(function () { return ''; }),
          self.bridge.call('getSensorDeviceName', id).catch(function () { return ''; }),
          self.bridge.call('getSensorUnits', id).catch(function () { return ''; })
        ]).then(function (r) {
          self.units[id] = String(r[4] || '');
          return { id: id, type: String(r[0] || ''), kind: String(r[1] || ''), name: String(r[2] || ''), device: String(r[3] || '') };
        });
      }));
    }).then(function (list) {
      classify(list);
      var cat = {};
      list.forEach(function (s) { cat[s.id] = s; });
      self.catalog = cat;
      return cat;
    }).catch(function (e) {
      self.loading = null; // try again next round
      throw e;
    });
    return this.loading;
  };

  /** Called when sensors appear/disappear (e.g. a USB device) – the next resolve re-reads the list. */
  Service.prototype.invalidate = function () {
    this.catalog = null;
    this.loading = null;
  };

  /**
   * The sensor to use for a metric. auto (default): the best scoring sensor, or null when nothing fits
   * (the widget then hides that reading). Manual: the user's choice when it exists, else automatic.
   * Note: iCUE hands over a stored sensor id even when its list shows "not available", so a set
   * value is no proof of a deliberate choice - that is what the "autoSensors" switch is for.
   */
  Service.prototype.resolve = function (metric, chosen, auto) {
    var m = METRICS[metric];
    var cat = this.catalog || {};
    chosen = typeof chosen === 'string' ? chosen : '';
    if (!auto && chosen && cat[chosen]) return { id: chosen, auto: false };
    var best = null, bestScore = 0, self = this;
    Object.keys(cat).forEach(function (id) {
      if (!self.allowed(metric, cat[id])) return;
      var sc = m.score(cat[id]);
      if (sc > bestScore) { bestScore = sc; best = id; }
    });
    return best ? { id: best, auto: true } : null;
  };

  Service.prototype.read = function (id) {
    return this.bridge.call('getSensorValue', id).then(function (v) {
      var n = parseFloat(String(v).replace(',', '.'));
      return Number.isFinite(n) ? n : null;
    });
  };

  Service.prototype.info = function (id) {
    return (this.catalog && this.catalog[id]) || null;
  };

  return { Service: Service, METRICS: METRICS };
})();

const { contextBridge, ipcRenderer, webFrame } = require('electron');

// ── 1. 从 --params 读取浏览器身份数据 ──
const paramEntry = process.argv.find(item => item.startsWith('--params='));
const context = JSON.parse(paramEntry.substring(paramEntry.indexOf('=') + 1));
const navData = context.fingerprint?.navigator || context;
// 每环境深层指纹参数（时区/地理位置/屏幕/WebGL/字体/媒体/噪声种子）
const deepData = context.fingerprint?.deep || {};

// ── 2. 在 Node.js 侧预计算所有需要的数据 ──
const ua = navData.userAgent || '';
const appVer = navData.appVersion || '';
const platform = navData.platform || '';
const vendor = navData.vendor || 'Google Inc.';
const language = navData.language || 'zh-CN';
const languages = navData.languages || ['zh-CN', 'zh'];
const hwConcurrency = navData.hardwareConcurrency ?? 8;
const deviceMemory = navData.deviceMemory ?? 8;
const pluginsData = navData.plugins || [];

// 从 UA 中提取 Chrome 版本号
const chromeVerMatch = ua.match(/Chrome\/([\d.]+)/);
const chromeVersion = chromeVerMatch ? chromeVerMatch[1] : '134.0.6998.165';

const userAgentData = navData.userAgentData || {};
const uadBrands = userAgentData.brands || [
  { brand: 'Not/A?Brand', version: '8' },
  { brand: 'Chromium', version: chromeVersion.split('.')[0] },
  { brand: 'Google Chrome', version: chromeVersion.split('.')[0] },
];

// 构建完整的 fullVersionList
const fullVersionList = uadBrands.map(b => ({
  brand: b.brand,
  version: b.brand === 'Not=A?Brand' ? '99' : chromeVersion,
}));

const uadPlatform = userAgentData.platform || 'Windows';
const uadMobile = userAgentData.mobile ?? false;
const uadPlatformVersion = userAgentData.platformVersion || '10.0.0';
const uadArchitecture = userAgentData.architecture || 'x86';
const uadBitness = userAgentData.bitness || '64';

// ── 2b. 深层指纹常量 ──
const timezone = deepData.timezone || 'Asia/Shanghai';
const geo = deepData.geo || { latitude: 39.9042, longitude: 116.4074, accuracy: 65 };
const scr = deepData.screen || {};
const screenWidth = scr.width || 1920;
const screenHeight = scr.height || 1080;
const screenDpr = scr.dpr || 1;
const webgl = deepData.webgl || { vendor: 'WebKit', renderer: 'WebKit WebGL', unmaskedVendor: 'Google Inc. (Intel)', unmaskedRenderer: 'ANGLE (Intel)' };
const fontsList = deepData.fonts || [];
const voicesList = deepData.voices || [];
const mediaCounts = deepData.media || { audioinput: 1, videoinput: 1, audiooutput: 2 };
const batteryInfo = deepData.battery || { level: 0.9, charging: true };
const seedNum = (key, fallback) => {
  const hex = (deepData.seeds && deepData.seeds[key]) || '';
  const v = parseInt(hex.slice(0, 8), 16);
  return Number.isFinite(v) && v > 0 ? v >>> 0 : fallback;
};
const canvasSeed = seedNum('canvas', 0x9e3779b9);
const audioSeed = seedNum('audio', 0x85ebca6b);
const webglSeed = seedNum('webgl', 0xc2b2ae35);
const rectSeed = seedNum('rect', 0x27d4eb2f);

// ── 3. 构造注入代码（只用纯值，不内嵌正则） ──
function buildMainWorldScript() {
  // JSON.stringify 处理所有值，避免转义问题
  const data = {
    platform,
    vendor,
    language,
    languages,
    hwConcurrency,
    deviceMemory,
    pluginsData,
    uadBrands,
    uadMobile,
    uadPlatform,
    uadPlatformVersion,
    uadArchitecture,
    uadBitness,
    fullVersionList,
    chromeVersion,
    timezone,
    geo,
    screenWidth,
    screenHeight,
    screenDpr,
    webgl,
    fontsList,
    voicesList,
    mediaCounts,
    batteryInfo,
    canvasSeed,
    audioSeed,
    webglSeed,
    rectSeed,
  };
  const json = JSON.stringify(data);

  return `
(function() {
  'use strict';

  var D = ${json};

  // 种子随机数（同一环境噪声恒定，跨会话指纹稳定）
  function seedNoise(seed) {
    var state = seed >>> 0;
    return function() {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  // ═══════════════════════════════════════════
  // 1. navigator 基础属性（逐个尝试定义，跳过 non-configurable 的属性）
  // ═══════════════════════════════════════════
  (function() {
    var props = {
      platform:            { get: function() { return D.platform; }, configurable: true },
      vendor:              { get: function() { return D.vendor; }, configurable: true },
      language:            { get: function() { return D.language; }, configurable: true },
      languages:           { get: function() { return D.languages.slice(); }, configurable: true },
      hardwareConcurrency: { get: function() { return D.hwConcurrency; }, configurable: true },
      deviceMemory:        { get: function() { return D.deviceMemory; }, configurable: true },
      cookieEnabled:       { get: function() { return true; }, configurable: true },
      doNotTrack:          { get: function() { return null; }, configurable: true },
      maxTouchPoints:      { get: function() { return 0; }, configurable: true },
      onLine:              { get: function() { return true; }, configurable: true },
      product:             { get: function() { return 'Gecko'; }, configurable: true },
      productSub:          { get: function() { return '20030107'; }, configurable: true },
      appCodeName:         { get: function() { return 'Mozilla'; }, configurable: true },
      appName:             { get: function() { return 'Netscape'; }, configurable: true },
      pdfViewerEnabled:    { get: function() { return true; }, configurable: true },
    };
    Object.keys(props).forEach(function(k) {
      try {
        Object.defineProperty(navigator, k, props[k]);
      } catch(e) {}
    });
  })();

  // ═══════════════════════════════════════════
  // 2. navigator.userAgentData
  // ═══════════════════════════════════════════
  try {
    var uad = {
    brands: D.uadBrands,
    mobile: D.uadMobile,
    platform: D.uadPlatform,
    getBrands: function() { return Promise.resolve(this.brands); },
    getHighEntropyValues: function(hints) {
      var result = {};
      if (hints.indexOf('fullVersionList') !== -1) result.fullVersionList = D.fullVersionList;
      if (hints.indexOf('platformVersion') !== -1) result.platformVersion = D.uadPlatformVersion;
      if (hints.indexOf('platform') !== -1) result.platform = D.uadPlatform;
      if (hints.indexOf('architecture') !== -1) result.architecture = D.uadArchitecture;
      if (hints.indexOf('model') !== -1) result.model = '';
      if (hints.indexOf('bitness') !== -1) result.bitness = D.uadBitness;
      if (hints.indexOf('uaFullVersion') !== -1) result.uaFullVersion = D.chromeVersion;
      if (hints.indexOf('wow64') !== -1) result.wow64 = false;
      return Promise.resolve(result);
    },
    toJSON: function() {
      return { brands: this.brands, mobile: this.mobile, platform: this.platform };
    }
  };
  Object.defineProperty(navigator, 'userAgentData', {
    get: function() { return uad; },
    configurable: true
  });
  } catch(e) {}

  // ═══════════════════════════════════════════
  // 3. navigator.plugins (PluginArray)
  // ═══════════════════════════════════════════
  (function() {
    var plugins = D.pluginsData;
    var arr = [];
    plugins.forEach(function(p, i) {
      // 把每个 plugin 添加到数组
      var entry = {
        name: p.name,
        filename: p.filename,
        description: p.description || '',
        length: (p.mimeTypes || []).length,
        0: null, 1: null, 2: null
      };
      // 挂载 MimeType 子项
      (p.mimeTypes || []).forEach(function(mt, j) {
        entry[j] = {
          type: mt.type,
          suffixes: mt.suffixes || '',
          description: mt.description || '',
          enabledPlugin: entry
        };
      });
      arr[i] = entry;
    });
    arr.item = function(idx) { return this[idx] || null; };
    arr.namedItem = function(name) {
      for (var i = 0; i < this.length; i++) {
        var p = this[i];
        if (p && p.name === name) return p;
      }
      return null;
    };
    arr.refresh = function() { return; };
    arr.toString = function() { return '[object PluginArray]'; };
    arr[Symbol.iterator] = function() {
      var idx = 0;
      var self = this;
      return {
        next: function() { return idx < self.length ? { value: self[idx++], done: false } : { done: true }; }
      };
    };
    arr.length = plugins.length;
    Object.defineProperty(navigator, 'plugins', {
      get: function() { return arr; },
      configurable: true
    });
  })();

  // ═══════════════════════════════════════════
  // 4. navigator.mimeTypes (MimeTypeArray)
  // ═══════════════════════════════════════════
  (function() {
    var mts = [];
    D.pluginsData.forEach(function(p) {
      (p.mimeTypes || []).forEach(function(mt) {
        mts.push({
          type: mt.type,
          suffixes: mt.suffixes || '',
          description: mt.description || '',
          enabledPlugin: {
            name: p.name,
            filename: p.filename,
            description: p.description || ''
          }
        });
      });
    });
    mts.item = function(idx) { return this[idx] || null; };
    mts.namedItem = function(name) {
      for (var i = 0; i < this.length; i++) {
        if (this[i].type === name) return this[i];
      }
      return null;
    };
    mts.length = mts.length;
    Object.defineProperty(navigator, 'mimeTypes', {
      get: function() { return mts; },
      configurable: true
    });
  })();

  // ═══════════════════════════════════════════
  // 5. navigator.connection
  // ═══════════════════════════════════════════
  var conn = {
    effectiveType: '4g',
    rtt: 50,
    downlink: 10,
    downlinkMax: Infinity,
    saveData: false,
    type: 'cellular',
    onchange: null,
    addEventListener: function() {},
    removeEventListener: function() {},
    dispatchEvent: function() { return true; }
  };
  Object.defineProperty(navigator, 'connection', {
    get: function() { return conn; },
    configurable: true
  });

  // ═══════════════════════════════════════════
  // 6. navigator.mediaCapabilities
  // ═══════════════════════════════════════════
  try {
    if (navigator.mediaCapabilities) {
      navigator.mediaCapabilities.decodingInfo = function(config) {
        return Promise.resolve({
          supported: true,
          smooth: true,
          powerEfficient: true,
          keySystemAccess: null
        });
      };
      navigator.mediaCapabilities.encodingInfo = function(config) {
        return Promise.resolve({
          supported: true,
          smooth: true,
          powerEfficient: true
        });
      };
    }
  } catch(e) {}

  // ═══════════════════════════════════════════
  // 7. navigator.permissions.query
  // ═══════════════════════════════════════════
  try {
    if (navigator.permissions) {
      navigator.permissions.query = function(desc) {
        return Promise.resolve({ state: 'prompt', onchange: null });
      };
    }
  } catch(e) {}

  // ═══════════════════════════════════════════
  // 8. navigator.geolocation
  // ═══════════════════════════════════════════
  try {
    if (navigator.geolocation) {
      var pos = {
        coords: {
          latitude: D.geo.latitude,
          longitude: D.geo.longitude,
          accuracy: D.geo.accuracy,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null
        },
        timestamp: 0
      };
      navigator.geolocation.getCurrentPosition = function(success) {
        pos.timestamp = Date.now();
        if (success) setTimeout(function() { success(pos); }, 5);
      };
      navigator.geolocation.watchPosition = function(success) {
        navigator.geolocation.getCurrentPosition(success);
        return Math.floor(Math.random() * 1000000) + 1;
      };
      navigator.geolocation.clearWatch = function() {};
    }
  } catch(e) {}

  // ═══════════════════════════════════════════
  // 9. window.chrome 对象（增强，不替换原生）
  // ═══════════════════════════════════════════
  try {
    if (typeof window.chrome === 'undefined') window.chrome = {};
    var c = window.chrome;

    // app
    if (!c.app) c.app = {};
    if (!c.app.isInstalled) c.app.isInstalled = false;
    if (!c.app.InstallState) c.app.InstallState = { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' };
    if (!c.app.RunningState) c.app.RunningState = { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' };

    // csi
    if (!c.csi) c.csi = function() {
      return { onloadT: Date.now(), startE: Date.now(), pageT: Date.now(), tran: 15 };
    };

    // loadTimes
    if (!c.loadTimes) c.loadTimes = function() {
      return {
        requestTime: 0, startLoadTime: Date.now(), commitLoadTime: Date.now(),
        finishDocumentLoadTime: Date.now(), finishLoadTime: Date.now(), firstPaintTime: Date.now(),
        wasFetchedViaSpdy: true, wasNpnNegotiated: true, npnNegotiatedProtocol: 'h2',
        wasAlternateProtocolAvailable: false, connectionInfo: 'http/2'
      };
    };

    // runtime
    if (!c.runtime) c.runtime = {};
    var r = c.runtime;
    if (r.lastError === undefined) r.lastError = undefined;
    if (!r.id) r.id = undefined;
    if (!r.connect) r.connect = function() {
      return { name: '', sender: { id: undefined, url: '', origin: '' },
        postMessage: function() {},
        onMessage: { addListener: function() {}, removeListener: function() {} },
        onDisconnect: { addListener: function() {}, removeListener: function() {} } };
    };
    if (!r.sendMessage) r.sendMessage = function(extensionId, message, options, cb) {
      if (typeof cb === 'function') cb();
    };
    if (!r.getManifest) r.getManifest = function() { return { manifest_version: 3, name: '', version: '0.0' }; };
    if (!r.requestUpdateCheck) r.requestUpdateCheck = function(cb) {
      if (typeof cb === 'function') cb({ status: 'no_update', version: '' });
    };
    if (!r.onMessage) r.onMessage = { addListener: function() {}, removeListener: function() {} };
    if (!r.onConnect) r.onConnect = { addListener: function() {}, removeListener: function() {} };
    if (!r.onInstalled) r.onInstalled = { addListener: function() {}, removeListener: function() {} };

    // webstore
    if (!c.webstore) c.webstore = {};
    if (!c.webstore.onInstallStageChanged) c.webstore.onInstallStageChanged = { addListener: function() {}, removeListener: function() {} };
    if (!c.webstore.onDownloadProgress) c.webstore.onDownloadProgress = { addListener: function() {}, removeListener: function() {} };

    // storage
    if (!c.storage) c.storage = {};
    if (!c.storage.local) c.storage.local = { get: function(keys, cb) { if (cb) cb({}); }, set: function(items, cb) { if (cb) cb(); }, remove: function(keys, cb) { if (cb) cb(); }, clear: function(cb) { if (cb) cb(); } };
    if (!c.storage.sync) c.storage.sync = { get: function(keys, cb) { if (cb) cb({}); }, set: function(items, cb) { if (cb) cb(); }, remove: function(keys, cb) { if (cb) cb(); }, clear: function(cb) { if (cb) cb(); } };
    if (!c.storage.onChanged) c.storage.onChanged = { addListener: function() {}, removeListener: function() {} };

    // extension
    if (!c.extension) c.extension = {};
    if (!c.extension.getURL) c.extension.getURL = function(path) { return path || ''; };
    if (!c.extension.getBackgroundPage) c.extension.getBackgroundPage = function() { return null; };
    if (!c.extension.getViews) c.extension.getViews = function() { return []; };
    if (!c.extension.isAllowedIncognitoAccess) c.extension.isAllowedIncognitoAccess = function(cb) { if (cb) cb(false); };
    if (!c.extension.isAllowedFileSchemeAccess) c.extension.isAllowedFileSchemeAccess = function(cb) { if (cb) cb(false); };

    // i18n
    if (!c.i18n) c.i18n = {};
    if (!c.i18n.getMessage) c.i18n.getMessage = function(name) { return name || ''; };
    if (!c.i18n.getUILanguage) c.i18n.getUILanguage = function() { return 'zh-CN'; };
    if (!c.i18n.getAcceptLanguages) c.i18n.getAcceptLanguages = function(cb) { if (cb) cb(['zh-CN', 'en']); };
    if (!c.i18n.detectLanguage) c.i18n.detectLanguage = function(text, cb) { if (cb) cb({ languages: [], isReliable: false }); };

    // sidePanel
    if (!c.sidePanel) c.sidePanel = {};
    if (!c.sidePanel.setOptions) c.sidePanel.setOptions = function() { return Promise.resolve(); };
    if (!c.sidePanel.getOptions) c.sidePanel.getOptions = function() { return Promise.resolve({}); };
    if (!c.sidePanel.open) c.sidePanel.open = function() { return Promise.resolve(); };
  } catch(e) {}

  // ═══════════════════════════════════════════
  // 10. screen 补充属性
  // ═══════════════════════════════════════════
  try {
    Object.defineProperties(screen, {
      width:       { get: function() { return D.screenWidth; }, configurable: true },
      height:      { get: function() { return D.screenHeight; }, configurable: true },
      availWidth:  { get: function() { return D.screenWidth; }, configurable: true },
      availHeight: { get: function() { return D.screenHeight - 48; }, configurable: true },
      colorDepth:  { get: function() { return 24; }, configurable: true },
      pixelDepth:  { get: function() { return 24; }, configurable: true }
    });
    Object.defineProperty(window, 'devicePixelRatio', {
      get: function() { return D.screenDpr; },
      configurable: true
    });
  } catch(e) {}

  // ═══════════════════════════════════════════
  // 11. 时区（Intl 构造器注入 + resolvedOptions + Date 偏移 + toLocale 系列）
  // ═══════════════════════════════════════════
  try {
    var OrigDateTimeFormat = Intl.DateTimeFormat;
    var hasTimeZone = function(options) {
      if (typeof options === 'string') return false; // locale 字符串，无时区
      return !!(options && typeof options === 'object' && options.timeZone);
    };
    function PatchedDateTimeFormat() {
      var args = Array.prototype.slice.call(arguments);
      if (!hasTimeZone(args[1])) {
        args[1] = Object.assign({}, (args[1] && typeof args[1] === 'object') ? args[1] : {}, { timeZone: D.timezone });
      }
      return new (Function.prototype.bind.apply(OrigDateTimeFormat, [null].concat(args)));
    }
    PatchedDateTimeFormat.prototype = OrigDateTimeFormat.prototype;
    PatchedDateTimeFormat.supportedLocalesOf = OrigDateTimeFormat.supportedLocalesOf;
    Intl.DateTimeFormat = PatchedDateTimeFormat;

    var OrigResolvedOptions = OrigDateTimeFormat.prototype.resolvedOptions;
    Intl.DateTimeFormat.prototype.resolvedOptions = function() {
      var result = OrigResolvedOptions.call(this);
      result.timeZone = D.timezone;
      return result;
    };

    // getTimezoneOffset：用时区名推算当前偏移（分钟，UTC-本地）
    try {
      var fmt = new OrigDateTimeFormat('en-US', { timeZone: D.timezone, timeZoneName: 'longOffset' });
      var part = fmt.formatToParts(new Date()).find(function(p) { return p.type === 'timeZoneName'; });
      var m = part && part.value && part.value.match(/GMT([+-])(\\d{2}):?(\\d{2})?/);
      if (m) {
        var sign = m[1] === '-' ? 1 : -1;
        var tzOffsetMinutes = sign * (parseInt(m[2], 10) * 60 + parseInt(m[3] || '0', 10));
        Object.defineProperty(Date.prototype, 'getTimezoneOffset', {
          value: function() { return tzOffsetMinutes; }, configurable: true, writable: true
        });
      }
    } catch(e) {}

    // toLocale 系列：显式注入时区，避免格式化走真实时区
    ['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString'].forEach(function(fn) {
      var defaults = fn === 'toLocaleString'
        ? { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }
        : fn === 'toLocaleDateString'
          ? { year: 'numeric', month: 'numeric', day: 'numeric' }
          : { hour: 'numeric', minute: 'numeric', second: 'numeric' };
      Date.prototype[fn] = function(locale, options) {
        options = Object.assign({}, (options && typeof options === 'object') ? options : {});
        if (!options.timeZone) options.timeZone = D.timezone;
        if (!options.dateStyle && !options.timeStyle) Object.assign(options, defaults);
        return new OrigDateTimeFormat(locale || undefined, options).format(this);
      };
    });
  } catch(e) {}

  // ═══════════════════════════════════════════
  // 11b. navigator.webdriver 显式关闭
  // ═══════════════════════════════════════════
  try {
    Object.defineProperty(navigator, 'webdriver', {
      get: function() { return false; },
      configurable: true
    });
  } catch(e) {}

  // ═══════════════════════════════════════════
  // 11c. Canvas 指纹噪声（读取/导出注入恒定微噪声，不影响页面显示）
  // ═══════════════════════════════════════════
  (function() {
    if (!window.HTMLCanvasElement) return;
    var origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    var makeNoisyCopy = function(canvas, salt) {
      var w = canvas.width, h = canvas.height;
      if (w <= 0 || h <= 0) return null;
      var src = origGetImageData.apply(canvas.getContext('2d'), [0, 0, w, h]);
      var rnd = seedNoise(D.canvasSeed ^ ((w * 31 + h * 17 + salt) >>> 0));
      var data = src.data;
      for (var i = 0; i < data.length; i += 4) {
        if (data[i + 3] === 0) continue;
        data[i] = Math.min(255, Math.max(0, data[i] + (Math.floor(rnd() * 3) - 1)));
      }
      var tmp = document.createElement('canvas');
      tmp.width = w; tmp.height = h;
      tmp.getContext('2d').putImageData(src, 0, 0);
      return tmp;
    };
    CanvasRenderingContext2D.prototype.getImageData = function(x, y, w, h) {
      var imageData = origGetImageData.apply(this, arguments);
      try {
        var rnd = seedNoise(D.canvasSeed ^ ((w * 31 + h * 7) >>> 0));
        var data = imageData.data;
        for (var i = 0; i < data.length; i += 4) {
          if (data[i + 3] === 0) continue;
          data[i] = Math.min(255, Math.max(0, data[i] + (Math.floor(rnd() * 3) - 1)));
        }
      } catch(e) {}
      return imageData;
    };
    var origToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function() {
      try {
        var tmp = makeNoisyCopy(this, 0);
        if (tmp) return origToDataURL.apply(tmp, arguments);
      } catch(e) {}
      return origToDataURL.apply(this, arguments);
    };
    var origToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) {
      try {
        var tmp = makeNoisyCopy(this, 1);
        if (tmp) return origToBlob.call(tmp, callback, type, quality);
      } catch(e) {}
      return origToBlob.apply(this, arguments);
    };
  })();

  // ═══════════════════════════════════════════
  // 11d. WebGL 供应商/渲染器伪装 + 像素读取噪声
  // ═══════════════════════════════════════════
  (function() {
    function patchProto(proto) {
      if (!proto) return;
      var origGetParameter = proto.getParameter;
      proto.getParameter = function(p) {
        if (p === 0x9245) return D.webgl.unmaskedVendor;   // UNMASKED_VENDOR_WEBGL
        if (p === 0x9246) return D.webgl.unmaskedRenderer; // UNMASKED_RENDERER_WEBGL
        if (p === 0x1f00) return D.webgl.vendor;           // VENDOR
        if (p === 0x1f01) return D.webgl.renderer;         // RENDERER
        return origGetParameter.apply(this, arguments);
      };
      var origReadPixels = proto.readPixels;
      proto.readPixels = function() {
        origReadPixels.apply(this, arguments);
        try {
          var pixels = arguments[6];
          if (pixels && pixels.length) {
            var rnd = seedNoise(D.webglSeed ^ ((arguments[2] || 0) * 31 + (arguments[3] || 0)));
            for (var i = 0; i < pixels.length; i += 4) {
              if (pixels[i + 3] === 0) continue;
              pixels[i] = Math.min(255, Math.max(0, pixels[i] + (Math.floor(rnd() * 3) - 1)));
            }
          }
        } catch(e) {}
      };
    }
    patchProto(window.WebGLRenderingContext && WebGLRenderingContext.prototype);
    patchProto(window.WebGL2RenderingContext && WebGL2RenderingContext.prototype);
  })();

  // ═══════════════════════════════════════════
  // 11e. 音频指纹噪声
  // ═══════════════════════════════════════════
  (function() {
    if (window.AudioBuffer && AudioBuffer.prototype.getChannelData) {
      var origGetChannelData = AudioBuffer.prototype.getChannelData;
      AudioBuffer.prototype.getChannelData = function(channel) {
        var data = origGetChannelData.apply(this, arguments);
        try {
          if (!this.__tbsNoiseDone) {
            var rnd = seedNoise(D.audioSeed ^ (this.length || 1));
            for (var i = 0; i < data.length; i += 100) {
              data[i] = data[i] + (rnd() - 0.5) * 1e-7;
            }
            this.__tbsNoiseDone = true;
          }
        } catch(e) {}
        return data;
      };
    }
    if (window.AnalyserNode && AnalyserNode.prototype.getFloatFrequencyData) {
      var origGetFloatFrequencyData = AnalyserNode.prototype.getFloatFrequencyData;
      AnalyserNode.prototype.getFloatFrequencyData = function(array) {
        origGetFloatFrequencyData.apply(this, arguments);
        try {
          var rnd = seedNoise(D.audioSeed ^ (array.length || 1));
          for (var i = 0; i < array.length; i++) array[i] += (rnd() - 0.5) * 1e-6;
        } catch(e) {}
      };
    }
  })();

  // ═══════════════════════════════════════════
  // 11f. 字体探测（fonts.check 只放行本环境字体白名单）
  // ═══════════════════════════════════════════
  (function() {
    if (!(document.fonts && document.fonts.check)) return;
    var origCheck = document.fonts.check.bind(document.fonts);
    var baseFamilies = ['Arial', 'Courier New', 'Georgia', 'Times New Roman', 'Verdana', 'sans-serif', 'serif', 'monospace', 'cursive', 'fantasy'];
    document.fonts.check = function(spec) {
      try {
        var family = String(spec || '').trim().split(/\\s+/).pop().replace(/["']/g, '');
        if (baseFamilies.indexOf(family) !== -1 || D.fontsList.indexOf(family) !== -1) return origCheck(spec);
        return false;
      } catch(e) { return origCheck(spec); }
    };
  })();

  // ═══════════════════════════════════════════
  // 11g. ClientRects 亚像素抖动（字体探测的旁路手段）
  // ═══════════════════════════════════════════
  (function() {
    function jitterRect(r, salt) {
      var rnd = seedNoise(D.rectSeed ^ ((Math.floor((r.left || 0) * 100) * 31 + Math.floor((r.top || 0) * 100) + salt) >>> 0));
      var dx = (rnd() - 0.5) * 0.002;
      var dy = (rnd() - 0.5) * 0.002;
      return {
        top: r.top + dy, bottom: r.bottom + dy, left: r.left + dx, right: r.right + dx,
        width: r.width + dx, height: r.height + dy, x: r.x + dx, y: r.y + dy,
        toJSON: function() { return this; }
      };
    }
    var origGBCR = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function() {
      var rect = origGBCR.apply(this, arguments);
      try {
        if (rect.width > 0 && rect.height > 0) {
          var j = jitterRect(rect, 0);
          var out = Object.create(DOMRect.prototype);
          for (var k in j) {
            try { Object.defineProperty(out, k, { value: j[k], enumerable: true }); } catch(e) {}
          }
          return out;
        }
      } catch(e) {}
      return rect;
    };
    var origGCRs = Element.prototype.getClientRects;
    Element.prototype.getClientRects = function() {
      var list = origGCRs.apply(this, arguments);
      try {
        var out = [];
        for (var i = 0; i < list.length; i++) out.push(jitterRect(list[i], i));
        out.item = function(idx) { return out[idx] || null; };
        return out;
      } catch(e) { return list; }
    };
  })();

  // ═══════════════════════════════════════════
  // 11h. 媒体设备枚举 / 电池 / 语音列表
  // ═══════════════════════════════════════════
  (function() {
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices = function() {
        var out = [];
        var kinds = [['audioinput', D.mediaCounts.audioinput], ['videoinput', D.mediaCounts.videoinput], ['audiooutput', D.mediaCounts.audiooutput]];
        var idx = 0;
        kinds.forEach(function(k) {
          for (var i = 0; i < k[1]; i++) {
            out.push({
              deviceId: i === 0 ? 'default' : 'id' + (D.canvasSeed + idx),
              kind: k[0],
              label: '',
              groupId: 'grp' + (D.canvasSeed + idx),
              toJSON: function() { return this; }
            });
            idx++;
          }
        });
        return Promise.resolve(out);
      };
    }
    if (navigator.getBattery) {
      navigator.getBattery = function() {
        return Promise.resolve({
          level: D.batteryInfo.level,
          charging: D.batteryInfo.charging,
          chargingTime: D.batteryInfo.charging ? 0 : Infinity,
          dischargingTime: D.batteryInfo.charging ? Infinity : 21600,
          onchargingchange: null, onchargingtimechange: null,
          ondischargingtimechange: null, onlevelchange: null,
          addEventListener: function() {}, removeEventListener: function() {}, dispatchEvent: function() { return true; },
          toJSON: function() { return this; }
        });
      };
    }
    if (window.speechSynthesis && speechSynthesis.getVoices) {
      var origGetVoices = speechSynthesis.getVoices.bind(speechSynthesis);
      speechSynthesis.getVoices = function() {
        try {
          var voices = origGetVoices();
          if (!voices || !voices.length) return voices;
          var matched = voices.filter(function(v) {
            return D.voicesList.some(function(n) { return v.name && v.name.indexOf(n) !== -1; });
          });
          return matched.length ? matched : voices.slice(0, 3);
        } catch(e) { return origGetVoices(); }
      };
    }
  })();

  // ═══════════════════════════════════════════
  // 12. 清理可能的泄露
  // ═══════════════════════════════════════════
  try {
    if (document.__webdriver_script_fn) delete document.__webdriver_script_fn;
    if (document.__selenium_unwrap) delete document.__selenium_unwrap;
    if (document.__driver_evaluate) delete document.__driver_evaluate;
    if (document.__webdriver_evaluate) delete document.__webdriver_evaluate;
  } catch(e) {}

  // ═══════════════════════════════════════════
  // 13. Error 栈清理（过滤 Electron 帧）
  // ═══════════════════════════════════════════
  try {
    var origPrep = Error.prepareStackTrace;
    Error.prepareStackTrace = function(err, stack) {
      if (!stack || !stack.filter) {
        return origPrep ? origPrep(err, stack) : err.stack;
      }
      var filtered = stack.filter(function(cs) {
        var fn = cs.getFileName ? (cs.getFileName() || '') : '';
        return fn.indexOf('node_modules/electron') === -1 &&
               fn.indexOf('electron.asar') === -1 &&
               fn.indexOf('electron/js2c') === -1;
      });
      if (origPrep) return origPrep(err, filtered);
      return err.name + ': ' + err.message + '\\n' +
        filtered.map(function(cs) {
          var fn = cs.getFunctionName ? cs.getFunctionName() : '';
          var file = cs.getFileName ? cs.getFileName() : '';
          var line = cs.getLineNumber ? cs.getLineNumber() : 0;
          return '    at ' + (fn || '<anonymous>') + ' (' + (file || '') + ':' + line + ')';
        }).join('\\n');
    };
  } catch(e) {}
})();
`;
}

// ── 4. 注入到 MAIN world ──
(async () => {
  const script = buildMainWorldScript();
  await webFrame.executeJavaScript(script);
})();

// ── 5. 应用层 IPC 接口（不参与伪装） ──
contextBridge.exposeInMainWorld('myApi', {
  refreshSelf: () => ipcRenderer.invoke('refresh:self')
});

ipcRenderer.on('open:window', (event, url) => {
  window.location.href = url;
});

window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const selectionText = window.getSelection().toString().trim();
  const data = { x: e.clientX, y: e.clientY };
  if (selectionText) {
    ipcRenderer.send('copy:text', selectionText)
    ipcRenderer.send("popup:contextMenu", Object.assign(data, { status: 3 }))
    return;
  }

  const isInputElement = ['INPUT', 'TEXTAREA'].includes(e.target.tagName);
  const isContentEditable = e.target.isContentEditable;
  if (isInputElement || isContentEditable) {
    ipcRenderer.send("popup:contextMenu", Object.assign(data, { status: 5 }))
    return;
  }

  ipcRenderer.send("popup:contextMenu", Object.assign(data, { status: 1 }))
});

window.addEventListener('keydown', (event) => {
  const isInputElement = ['INPUT', 'TEXTAREA'].includes(event.target.tagName);
  const isContentEditable = event.target.isContentEditable;

  const hasInputContent = isInputElement && event.target.value.trim() !== '';
  const hasEditableContent = isContentEditable && event.target.innerText.trim() !== '';
  if (hasInputContent || hasEditableContent) {
    return;
  }

  if (event.key === "ArrowLeft") {
    ipcRenderer.send('history:goBack')
  } else if (event.key === "ArrowRight") {
    ipcRenderer.send('history:goForward')
  }
});

document.addEventListener('wheel', async (event) => {
  if (event.ctrlKey || event.metaKey) {
    const isZoomOpen = await ipcRenderer.invoke("handle:zoom");
    if (isZoomOpen) {
      event.preventDefault();
      const delta = event.deltaY;
      ipcRenderer.send('zoom:wheel', delta);
    }
  }
}, { passive: false });

document.addEventListener('fullscreenchange', async () => {
  if (document.fullscreenElement) {
    await ipcRenderer.invoke('handle:menu', true)
  } else {
    await ipcRenderer.invoke('handle:menu', false)
  }
});

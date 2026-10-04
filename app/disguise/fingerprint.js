// 每站点独立指纹引擎
// 每个站点（含每次多开）一套独立、自洽、可持久化的浏览器环境：
//   操作系统 / Chrome 版本 / UA + 客户端提示 / 语言 / 时区 / 地理位置 /
//   屏幕 / 硬件 / WebGL / 字体 / 媒体设备 / 电池 / 噪声种子
// 同时负责代理生效：全局代理（设置项 globalProxy）+ 每站点覆盖（sites.proxy JSON）。
// SOCKS5 一律经本地中继（Chromium 不支持带认证的 SOCKS5，见 proxyCore.js）。
import { app, session } from 'electron'
import fs from 'fs'
import path from 'path'
import tbsDbManager from '../store/tbsDbManager.js'
import storeManager from '../store/storeManager.js'
import { normalizeProxy, getRelayPort } from '../utility/proxyCore.js'

// 真实存在的 Chrome 稳定版构建号（与 browserEnv 保持同一份清单）
const CHROME_VERSIONS = [
  '130.0.6723.58', '130.0.6723.69', '130.0.6723.91', '130.0.6723.116',
  '131.0.6778.69', '131.0.6778.85', '131.0.6778.108', '131.0.6778.139',
  '132.0.6834.83', '132.0.6834.110', '132.0.6834.159', '132.0.6834.194',
  '133.0.6943.53', '133.0.6943.98', '133.0.6943.126', '133.0.6943.141',
  '134.0.6998.88', '134.0.6998.118', '134.0.6998.165', '134.0.6998.178',
]

// 时区 → 语言 / 大致地理位置（保持指纹内部自洽）
const LOCALES = [
  { timezone: 'Asia/Shanghai',      languages: ['zh-CN', 'zh'],          geo: { latitude: 31.2304, longitude: 121.4737, accuracy: 65, city: 'Shanghai' } },
  { timezone: 'Asia/Hong_Kong',     languages: ['zh-HK', 'zh'],          geo: { latitude: 22.3193, longitude: 114.1694, accuracy: 65, city: 'Hong Kong' } },
  { timezone: 'Asia/Tokyo',         languages: ['ja-JP', 'ja'],          geo: { latitude: 35.6762, longitude: 139.6503, accuracy: 65, city: 'Tokyo' } },
  { timezone: 'Asia/Seoul',         languages: ['ko-KR', 'ko'],          geo: { latitude: 37.5665, longitude: 126.978,  accuracy: 65, city: 'Seoul' } },
  { timezone: 'Asia/Singapore',     languages: ['en-SG', 'en', 'zh-SG'], geo: { latitude: 1.3521,  longitude: 103.8198, accuracy: 65, city: 'Singapore' } },
  { timezone: 'America/New_York',   languages: ['en-US', 'en'],          geo: { latitude: 40.7128, longitude: -74.006,  accuracy: 65, city: 'New York' } },
  { timezone: 'America/Los_Angeles',languages: ['en-US', 'en'],          geo: { latitude: 34.0522, longitude: -118.2437,accuracy: 65, city: 'Los Angeles' } },
  { timezone: 'Europe/London',      languages: ['en-GB', 'en'],          geo: { latitude: 51.5074, longitude: -0.1278,  accuracy: 65, city: 'London' } },
  { timezone: 'Europe/Berlin',      languages: ['de-DE', 'de'],          geo: { latitude: 52.52,   longitude: 13.405,   accuracy: 65, city: 'Berlin' } },
  { timezone: 'Europe/Paris',       languages: ['fr-FR', 'fr'],          geo: { latitude: 48.8566, longitude: 2.3522,   accuracy: 65, city: 'Paris' } },
]

const OS_POOL = ['windows', 'windows', 'windows', 'macos', 'macos', 'linux']

const OS_VERSION_POOL = {
  windows: ['10.0.0', '13.0.0', '14.0.0', '15.0.0'], // Win10 / Win11
  macos:   ['13.5.0', '14.1.0', '14.4.1', '15.0.0'],
  linux:   ['6.2.0', '6.5.0', '6.8.0'],
}

const SCREEN_POOL = {
  windows: [[1920, 1080], [2560, 1440], [1366, 768], [1600, 900], [3840, 2160]],
  macos:   [[1440, 900], [1680, 1050], [1920, 1080], [2560, 1600]],
  linux:   [[1920, 1080], [2560, 1440]],
}
const DPR_POOL = { windows: [1, 1, 1.25, 1.5], macos: [2], linux: [1, 2] }

const WEBGL_POOL = {
  windows: [
    ['Intel', 'Intel(R) UHD Graphics 630'],
    ['Intel', 'Intel(R) Iris(R) Xe Graphics'],
    ['NVIDIA', 'NVIDIA GeForce GTX 1660 SUPER'],
    ['NVIDIA', 'NVIDIA GeForce RTX 3060'],
    ['AMD', 'AMD Radeon(R) Graphics'],
  ],
  macos: [['Apple', 'Apple M1'], ['Apple', 'Apple M2'], ['Apple', 'Apple M3']],
  linux: [
    ['Intel', 'Mesa Intel(R) UHD Graphics 630'],
    ['AMD', 'AMD Radeon RX 6600'],
  ],
}

const FONTS_POOL = {
  windows: ['Segoe UI', 'Arial', 'Times New Roman', 'Calibri', 'Cambria', 'Consolas', 'Verdana', 'Tahoma', 'Microsoft YaHei', 'SimSun'],
  macos:   ['Helvetica Neue', 'Helvetica', 'Arial', 'Menlo', 'Monaco', 'PingFang SC', 'Hiragino Sans GB', 'Times New Roman', 'Courier New'],
  linux:   ['DejaVu Sans', 'Ubuntu', 'Liberation Sans', 'Noto Sans CJK SC', 'Arial', 'FreeSans'],
}

const VOICES_POOL = {
  windows: ['Microsoft Huihui', 'Microsoft Kangkang', 'Microsoft Yaoyao', 'Google US English'],
  macos:   ['Samantha', 'Alex', 'Ting-Ting', 'Google US English'],
  linux:   ['FreeTTS - en US', 'Google US English'],
}

const CONCURRENCY_POOL = [4, 6, 8, 8, 12, 16]
const MEMORY_POOL = [4, 8, 8, 8, 16]

// ── 随机工具（种子确定性，重启后不变）──

function hashKey(str) {
  let h = 2166136261
  for (const ch of String(str)) {
    h ^= ch.codePointAt(0)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)]
}

function pickWeighted(rng, arr) {
  return arr[Math.floor(rng() * arr.length)]
}

function randomHex(rng, bytes) {
  let out = ''
  for (let i = 0; i < bytes; i++) out += Math.floor(rng() * 256).toString(16).padStart(2, '0')
  return out
}

// ── 持久化（userData/fingerprints.json，原子写）──

let storeCache = null

function storePath() {
  return path.join(app.getPath('userData'), 'fingerprints.json')
}

function loadStore() {
  if (storeCache) return storeCache
  try {
    const raw = fs.readFileSync(storePath(), 'utf-8')
    const data = JSON.parse(raw)
    if (data && typeof data === 'object') {
      storeCache = data
      return storeCache
    }
  } catch { /* 空库，重新生成 */ }
  storeCache = {}
  return storeCache
}

function saveStore() {
  if (!storeCache) return
  const target = storePath()
  const tmp = target + '.tmp'
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(tmp, JSON.stringify(storeCache, null, 2), 'utf-8')
    fs.renameSync(tmp, target)
  } catch (e) {
    console.error('指纹档案保存失败:', e)
  }
}

// ── 生成 ──

function generateBase(key, salt) {
  const rng = mulberry32(hashKey(`${key}|${salt}`))
  const os = pickWeighted(rng, OS_POOL)
  const osVersion = pick(rng, OS_VERSION_POOL[os])
  const chromeVersion = pick(rng, CHROME_VERSIONS)
  const locale = pick(rng, LOCALES)
  const screen = pick(rng, SCREEN_POOL[os])
  const webgl = pick(rng, WEBGL_POOL[os])
  const rngMedia = mulberry32(hashKey(`${key}|${salt}|media`))
  return {
    salt,
    os,
    osVersion,
    chromeVersion,
    timezone: locale.timezone,
    languages: locale.languages,
    geo: { latitude: locale.geo.latitude, longitude: locale.geo.longitude, accuracy: locale.geo.accuracy },
    hardwareConcurrency: pick(rng, CONCURRENCY_POOL),
    deviceMemory: pick(rng, MEMORY_POOL),
    screen: { width: screen[0], height: screen[1], dpr: pick(rng, DPR_POOL[os]) },
    webgl: { vendor: webgl[0], renderer: webgl[1] },
    media: {
      audioinput: 1 + Math.floor(rngMedia() * 2),
      videoinput: rngMedia() < 0.85 ? 1 : 0,
      audiooutput: 1 + Math.floor(rngMedia() * 2),
    },
    batteryLevel: Math.round((0.55 + rngMedia() * 0.45) * 100) / 100,
    seeds: {
      canvas: randomHex(rng, 8),
      audio: randomHex(rng, 8),
      webgl: randomHex(rng, 8),
      rect: randomHex(rng, 4),
    },
  }
}

function osDetail(os, osVersion) {
  if (os === 'windows') {
    const win11 = parseFloat(osVersion) >= 13
    return {
      navigatorPlatform: 'Win32',
      chromePlatformName: 'Windows',
      uaPlatformString: 'Windows NT 10.0; Win64; x64',
      uaPlatformVersion: win11 ? '15.0.0' : '14.0.0',
      architecture: 'x86',
      bitness: '64',
    }
  }
  if (os === 'macos') {
    return {
      navigatorPlatform: 'MacIntel',
      chromePlatformName: 'macOS',
      uaPlatformString: 'Macintosh; Intel Mac OS X 10_15_7',
      uaPlatformVersion: osVersion,
      architecture: 'arm',
      bitness: '64',
    }
  }
  return {
    navigatorPlatform: 'Linux x86_64',
    chromePlatformName: 'Linux',
    uaPlatformString: 'X11; Linux x86_64',
    uaPlatformVersion: osVersion,
    architecture: 'x86',
    bitness: '64',
  }
}

function buildPlugins() {
  // Chrome 默认插件三件套
  return [
    {
      name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format',
      mimeTypes: [
        { type: 'application/x-google-chrome-pdf', suffixes: 'pdf', description: 'Portable Document Format' },
        { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
      ],
    },
    {
      name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '',
      mimeTypes: [{ type: 'application/pdf', suffixes: 'pdf', description: '' }],
    },
    {
      name: 'Native Client', filename: 'internal-nacl-plugin', description: '',
      mimeTypes: [
        { type: 'application/x-pnacl', suffixes: '', description: '' },
        { type: 'application/nacl', suffixes: '', description: '' },
      ],
    },
  ]
}

// 覆盖项白名单（用户在界面上可手动固定的字段）
function mergeOverrides(base, overrides) {
  if (!overrides || typeof overrides !== 'object') return base
  const merged = { ...base }
  if (OS_POOL.includes(overrides.os) && overrides.os !== merged.os) {
    merged.os = overrides.os
    // 换系统后 osVersion 用新系统的池子重新确定
    const rng = mulberry32(hashKey(`${base.salt}|osver|${overrides.os}`))
    merged.osVersion = pick(rng, OS_VERSION_POOL[overrides.os])
  }
  if (CHROME_VERSIONS.includes(overrides.chromeVersion)) merged.chromeVersion = overrides.chromeVersion
  const locale = LOCALES.find(l => l.timezone === overrides.timezone)
  if (locale) {
    merged.timezone = locale.timezone
    merged.languages = [...locale.languages]
    merged.geo = { latitude: locale.geo.latitude, longitude: locale.geo.longitude, accuracy: locale.geo.accuracy }
  }
  if (typeof overrides.hardwareConcurrency === 'number' && overrides.hardwareConcurrency > 0) merged.hardwareConcurrency = overrides.hardwareConcurrency
  if (typeof overrides.deviceMemory === 'number' && overrides.deviceMemory > 0) merged.deviceMemory = overrides.deviceMemory
  if (typeof overrides.screenWidth === 'number' && overrides.screenWidth >= 640) merged.screen.width = overrides.screenWidth
  if (typeof overrides.screenHeight === 'number' && overrides.screenHeight >= 480) merged.screen.height = overrides.screenHeight
  if (typeof overrides.dpr === 'number' && [1, 1.25, 1.5, 2].includes(overrides.dpr)) merged.screen.dpr = overrides.dpr
  const pair = WEBGL_POOL[merged.os].find(w => w[0] === overrides.webglVendor && w[1] === overrides.webglRenderer)
  if (pair) merged.webgl = { vendor: pair[0], renderer: pair[1] }
  return merged
}

function derive(base) {
  const detail = osDetail(base.os, base.osVersion)
  const chromeMajor = base.chromeVersion.split('.')[0]
  const webkit = '537.36'
  const ua = `Mozilla/5.0 (${detail.uaPlatformString}) AppleWebKit/${webkit} (KHTML, like Gecko) Chrome/${base.chromeVersion} Safari/${webkit}`
  const brands = [
    { brand: 'Not/A?Brand', version: '8' },
    { brand: 'Chromium', version: chromeMajor },
    { brand: 'Google Chrome', version: chromeMajor },
  ]
  const fullVersionList = [
    { brand: 'Not/A?Brand', version: '99' },
    { brand: 'Chromium', version: base.chromeVersion },
    { brand: 'Google Chrome', version: base.chromeVersion },
  ]
  const angleRenderer = (() => {
    if (base.os === 'windows') {
      const did = hashKey(base.seeds.webgl).toString(16).padStart(8, '0').toUpperCase().slice(0, 8)
      return `ANGLE (${base.webgl.vendor}, ${base.webgl.renderer} (0x0000${did}) Direct3D11 vs_5_0 ps_5_0, D3D11)`
    }
    if (base.os === 'macos') return `ANGLE (${base.webgl.vendor}, ANGLE Metal Renderer: ${base.webgl.renderer}, Unspecified Version)`
    return `ANGLE (${base.webgl.vendor}, ${base.webgl.renderer} (0x0000${hashKey(base.seeds.webgl) & 0xffff}))`
  })()

  const navigator = {
    userAgent: ua,
    appVersion: `5.0 (${detail.uaPlatformString}) AppleWebKit/${webkit} (KHTML, like Gecko) Chrome/${base.chromeVersion} Safari/${webkit}`,
    platform: detail.navigatorPlatform,
    vendor: 'Google Inc.',
    language: base.languages[0],
    languages: [...base.languages],
    hardwareConcurrency: base.hardwareConcurrency,
    deviceMemory: base.deviceMemory,
    maxTouchPoints: 0,
    doNotTrack: null,
    webdriver: false,
    userAgentData: {
      brands,
      mobile: false,
      platform: detail.chromePlatformName,
      platformVersion: detail.uaPlatformVersion,
      architecture: detail.architecture,
      bitness: detail.bitness,
      fullVersionList,
    },
    plugins: buildPlugins(),
  }

  return {
    navigator,
    headers: {
      'user-agent': ua,
      'sec-ch-ua': brands.map(b => `"${b.brand}";v="${b.version}"`).join(', '),
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': `"${detail.chromePlatformName}"`,
      'sec-ch-ua-platform-version': `"${detail.uaPlatformVersion}"`,
      'accept-language': base.languages.map((l, i) => (i === 0 ? l : `${l};q=${(1 - i * 0.1).toFixed(1)}`)).join(','),
    },
    deep: {
      timezone: base.timezone,
      geo: { ...base.geo },
      screen: { ...base.screen },
      webgl: {
        vendor: 'WebKit',
        renderer: 'WebKit WebGL',
        unmaskedVendor: `Google Inc. (${base.webgl.vendor})`,
        unmaskedRenderer: angleRenderer,
      },
      fonts: [...FONTS_POOL[base.os]],
      voices: [...VOICES_POOL[base.os]],
      media: { ...base.media },
      battery: { level: base.batteryLevel, charging: true },
      seeds: { ...base.seeds },
    },
  }
}

// ── 对外接口 ──

/** 读取（或生成）某站点/多开实例的完整环境 */
export function getProfile(key) {
  const store = loadStore()
  if (!store[key]) {
    store[key] = generateBase(key, randomHex(mulberry32(hashKey(`salt|${key}|${Date.now()}`)), 8))
    saveStore()
  }
  const base = mergeOverrides({ ...store[key], screen: { ...store[key].screen }, geo: { ...store[key].geo }, languages: [...store[key].languages] }, tbsDbManager.getSiteFingerprintOverrides(key))
  return { base, env: derive(base) }
}

/** 随机化：重新生成基础档案（保留用户覆盖项） */
export function randomizeProfile(key) {
  const store = loadStore()
  const salt = randomHex(mulberry32(hashKey(`salt|${key}|${Date.now()}`)), 8)
  store[key] = generateBase(key, salt)
  saveStore()
  return getProfile(key)
}

/** 传给 preload 的身份数据（经 additionalArguments --params） */
export function getViewEnv(name) {
  const { env } = getProfile(name)
  return {
    identity: { navigator: env.navigator },
    headers: env.headers,
    deep: env.deep,
  }
}

/** 概要（管理界面列表用） */
export function summarize(key) {
  const { base, env } = getProfile(key)
  return {
    os: base.os,
    chromeVersion: base.chromeVersion,
    timezone: base.timezone,
    language: base.languages[0],
    screen: `${base.screen.width}x${base.screen.height}@${base.screen.dpr}x`,
    hardware: `${base.hardwareConcurrency}核/${base.deviceMemory}G`,
    webgl: base.webgl.renderer,
    userAgent: env.navigator.userAgent,
  }
}

// ── 代理生效 ──

function parseSiteProxy(raw) {
  const value = String(raw || '')
  if (!value) return null
  if (value.startsWith('{')) {
    try { return JSON.parse(value) } catch { return null }
  }
  // 旧格式：纯 proxyRules 字符串
  return { mode: 'custom', legacy: value }
}

function resolveFromConfig(config) {
  // config: {type:'none'|'socks5'|'http', host, port, username, password} 或 null
  if (!config || config.type === 'none') return { rules: '' }
  const cfg = normalizeProxy(config)
  if (!cfg) return { rules: '' }
  if (cfg.type === 'socks5') {
    const port = getRelayPort(cfg)
    return { rules: `socks5://127.0.0.1:${port}` }
  }
  return {
    rules: `http://${cfg.host}:${cfg.port}`,
    creds: { username: cfg.username, password: cfg.password },
  }
}

/** 解析某站点最终生效的代理（全局 / 直连 / 自定义，兼容旧字符串格式） */
export function resolveProxy(name) {
  const site = tbsDbManager.getSite(name)
  const parsed = parseSiteProxy(site ? site.proxy : '')
  if (parsed && parsed.mode === 'direct') return { rules: '' }
  if (parsed && parsed.legacy) return { rules: parsed.legacy }
  if (parsed && parsed.mode === 'custom') return resolveFromConfig(parsed)
  return resolveFromConfig(storeManager.getSetting('globalProxy'))
}

/** 在站点会话上应用网络环境（代理 + WebRTC 防泄漏） */
export function applyNetwork(session, name) {
  try {
    const eff = resolveProxy(name)
    if (eff.rules) {
      session.setProxy({ proxyRules: eff.rules, proxyBypassRules: '<local>' })
    } else {
      session.setProxy({ mode: 'direct' })
    }
    if (eff.creds) session.__tbsProxyCreds = eff.creds
    else delete session.__tbsProxyCreds
    session.setWebRTCIPHandlingPolicy('disable_non_proxied_udp')
  } catch (e) {
    console.error(`应用网络环境失败(${name}):`, e)
  }
}

/** 全局代理应用到默认会话（主窗口 / 图标抓取 / 更新检查等） */
export function applyGlobalProxy() {
  try {
    const eff = resolveFromConfig(storeManager.getSetting('globalProxy'))
    const defaultSession = session.defaultSession
    if (eff.rules) defaultSession.setProxy({ proxyRules: eff.rules, proxyBypassRules: '<local>' })
    else defaultSession.setProxy({ mode: 'direct' })
    if (eff.creds) defaultSession.__tbsProxyCreds = eff.creds
    else delete defaultSession.__tbsProxyCreds
  } catch (e) {
    console.error('应用全局代理失败:', e)
  }
}

/** UI 可选项池 */
export function getOptions() {
  return {
    chromeVersions: [...CHROME_VERSIONS],
    osList: ['windows', 'macos', 'linux'],
    timezones: LOCALES.map(l => l.timezone),
    screens: { windows: SCREEN_POOL.windows, macos: SCREEN_POOL.macos, linux: SCREEN_POOL.linux },
    hardware: { concurrency: [...CONCURRENCY_POOL], memory: [...MEMORY_POOL] },
    webgl: WEBGL_POOL,
  }
}

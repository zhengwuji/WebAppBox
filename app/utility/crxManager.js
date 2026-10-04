// Chrome 应用商店扩展安装器
// 原理：Electron 内核不支持商店页面的"添加至 Chrome"按钮（依赖 chrome.webstore API），
// 这里直接从 Google 的 CRX 分发接口拉取扩展包，解压后注册为插件并挂载到指定浏览器环境。
import { app, net } from 'electron'
import fs from 'fs'
import path from 'path'
import AdmZip from 'adm-zip'
import tbsDbManager from '../store/tbsDbManager.js'
import pluginManager from '../pluginManager.js'

const STORE_ID_RE = /([a-p]{32})/

export function extractExtensionId(input) {
  const m = String(input || '').match(STORE_ID_RE)
  if (!m) throw new Error('无法解析扩展 ID：请粘贴 Chrome 商店详情页链接或 32 位扩展 ID')
  return m[1]
}

async function fetchCrx(id) {
  const prodversion = process.versions.chrome
  const url = `https://clients2.google.com/service/update2/crx?response=redirect&acceptformat=crx2,crx3&prodversion=${prodversion}&x=${encodeURIComponent(`id=${id}&uc`)}`
  const res = await net.fetch(url)
  if (!res.ok) throw new Error(`下载失败(HTTP ${res.status})`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 16) throw new Error('下载内容为空')
  return buf
}

function crxToZip(buf) {
  const idx = buf.indexOf('PK\x03\x04')
  if (idx === -1) throw new Error('CRX 内容异常（未找到扩展包数据）')
  return buf.subarray(idx)
}

function extDir(id) {
  return path.join(app.getPath('userData'), 'browser-extensions', id)
}

class CrxManager {

  /**
   * 安装商店扩展到指定浏览器环境
   * @returns {Promise<{ok:boolean, id?:string, name?:string, version?:string, error?:string}>}
   */
  async install(envName, input) {
    try {
      const id = extractExtensionId(input)
      const dir = extDir(id)
      if (!fs.existsSync(path.join(dir, 'manifest.json'))) {
        const crx = await fetchCrx(id)
        const zipBuf = crxToZip(crx)
        fs.rmSync(dir, { recursive: true, force: true })
        fs.mkdirSync(dir, { recursive: true })
        new AdmZip(zipBuf).extractAllTo(dir, true)
      }
      const manifestPath = path.join(dir, 'manifest.json')
      if (!fs.existsSync(manifestPath)) throw new Error('扩展包中缺少 manifest.json')
      let manifest
      try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) } catch { throw new Error('manifest.json 解析失败') }
      if (manifest.manifest_version === 3 && String(manifest.minimum_chrome_version || '') > process.versions.chrome) {
        // 版本过高不阻断，仅提示
      }

      // 注册为插件（type=store），路径指向解压目录
      pluginManager.addPlugin({
        id,
        name: manifest.name || id,
        description: manifest.description || '',
        version: manifest.version || '1.0',
        type: 'store',
        enabled: true,
        ext_path: dir
      })

      // 追加到当前环境的扩展清单
      const ids = tbsDbManager.getSiteExtensions(envName) || []
      if (!ids.includes(id)) {
        ids.push(id)
        const site = tbsDbManager.getSite(envName)
        if (site) tbsDbManager.updateSite({ ...site, extensions: ids })
      }
      return { ok: true, id, name: manifest.name || id, version: manifest.version || '' }
    } catch (e) {
      return { ok: false, error: String(e.message || e) }
    }
  }

  /** 从环境中移除扩展（商店安装的扩展在无任何环境引用时清理文件） */
  remove(envName, id) {
    const ids = (tbsDbManager.getSiteExtensions(envName) || []).filter(x => x !== id)
    const site = tbsDbManager.getSite(envName)
    if (site) tbsDbManager.updateSite({ ...site, extensions: ids })

    const plugin = pluginManager.getPlugin(id)
    if (plugin && plugin.type === 'store') {
      const stillUsed = tbsDbManager.getSites().some(s => (tbsDbManager.getSiteExtensions(s.name) || []).includes(id))
      if (!stillUsed) {
        try { fs.rmSync(plugin.ext_path, { recursive: true, force: true }) } catch { /* 忽略 */ }
        pluginManager.removePlugin(id)
      }
    }
  }
}

export default new CrxManager()

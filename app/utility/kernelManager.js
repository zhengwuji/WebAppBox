// Electron 内核管理：版本列表 / 下载（npmmirror 优先，GitHub 备用）/ SHA256 校验 /
// 暂存 / 退出后替换内核文件并自动重启 / 备份还原。
// 说明：应用进程本身就是内核（Electron = Chromium 运行时），无法运行中热切换，
// 因此采用"下载暂存 → 退出替换 → 自动重启"方案，替换前自动备份、可一键还原。
// 仅支持打包后的 Windows 环境（macOS 需处理签名与 App Bundle 结构，Linux 安装目录权限受限）。
import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import https from 'https'
import crypto from 'crypto'
import { spawn } from 'child_process'
import AdmZip from 'adm-zip'

const DOWNLOAD_TIMEOUT = 30 * 60 * 1000

function assetName(version) {
  const p = process.platform
  const a = process.arch
  if (p === 'win32') return `electron-v${version}-${a === 'arm64' ? 'win32-arm64' : a === 'ia32' ? 'win32-ia32' : 'win32-x64'}.zip`
  if (p === 'darwin') return `electron-v${version}-darwin-${a === 'arm64' ? 'arm64' : 'x64'}.zip`
  return `electron-v${version}-linux-${a === 'arm64' ? 'arm64' : 'x64'}.zip`
}

function kernelDir() {
  return path.join(app.getPath('userData'), 'kernel')
}

function stageDir(version) {
  return path.join(kernelDir(), `v${version}`)
}

function zipPath(version) {
  return path.join(kernelDir(), assetName(version))
}

function backupDir() {
  return path.join(kernelDir(), 'backup')
}

function installDir() {
  return path.dirname(process.execPath)
}

function followRedirect(url, max = 5) {
  return new Promise((resolve, reject) => {
    const request = (target, redirects) => {
      const req = https.get(target, { headers: { 'User-Agent': 'webappbox-kernel-manager' } }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) {
          res.resume()
          const next = new URL(res.headers.location, target).toString()
          return request(next, redirects - 1)
        }
        resolve(res)
      })
      req.on('error', reject)
      req.setTimeout(DOWNLOAD_TIMEOUT, () => {
        req.destroy(new Error('下载超时'))
      })
    }
    request(url, max)
  })
}

async function httpsGetJson(url) {
  const res = await followRedirect(url)
  if (res.statusCode !== 200) {
    res.resume()
    throw new Error(`请求失败(${res.statusCode}): ${url}`)
  }
  let data = ''
  res.setEncoding('utf8')
  for await (const chunk of res) data += chunk
  return JSON.parse(data)
}

async function httpsGetText(url) {
  const res = await followRedirect(url)
  if (res.statusCode !== 200) {
    res.resume()
    throw new Error(`请求失败(${res.statusCode})`)
  }
  let data = ''
  res.setEncoding('utf8')
  for await (const chunk of res) data += chunk
  return data
}

async function httpsDownload(url, dest, onProgress) {
  const res = await followRedirect(url)
  if (res.statusCode !== 200) {
    res.resume()
    throw new Error(`下载失败(${res.statusCode})`)
  }
  const total = parseInt(res.headers['content-length'], 10) || 0
  let received = 0
  let lastTick = 0
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    res.on('data', (chunk) => {
      received += chunk.length
      const now = Date.now()
      if (onProgress && now - lastTick > 300) {
        lastTick = now
        onProgress({ received, total, percent: total ? Math.floor((received / total) * 100) : 0 })
      }
    })
    res.pipe(file)
    file.on('error', reject)
    file.on('finish', () => file.close(() => resolve({ total, received })))
    res.on('error', reject)
  })
}

function semverDesc(a, b) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pb[i] || 0) !== (pa[i] || 0)) return (pb[i] || 0) - (pa[i] || 0)
  }
  return 0
}

class KernelManager {

  getKernelInfo() {
    const info = {
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      platform: process.platform,
      arch: process.arch,
      packaged: app.isPackaged,
      supported: app.isPackaged && process.platform === 'win32',
      stagedVersion: '',
      hasBackup: false,
    }
    try {
      if (fs.existsSync(kernelDir())) {
        for (const entry of fs.readdirSync(kernelDir())) {
          if (/^v\d+\.\d+\.\d+$/.test(entry) && fs.existsSync(path.join(kernelDir(), entry, 'electron.exe'))) {
            info.stagedVersion = entry.slice(1)
          }
        }
      }
      info.hasBackup = fs.existsSync(path.join(backupDir(), 'chrome_100_percent.pak')) ||
        fs.existsSync(path.join(backupDir(), 'electron.exe'))
    } catch { /* 忽略 */ }
    return info
  }

  /** 可用稳定版列表（当前版本排除，倒序） */
  async listAvailable() {
    const current = process.versions.electron
    let versions = []
    try {
      const list = await httpsGetJson('https://registry.npmmirror.com/-/binary/electron/')
      versions = (Array.isArray(list) ? list : [])
        .map(item => String(item.name || ''))
        .filter(name => /^v\d+\.\d+\.\d+$/.test(name))
        .map(name => name.slice(1))
    } catch {
      const releases = await httpsGetJson('https://api.github.com/repos/electron/electron/releases?per_page=30')
      versions = releases
        .filter(r => !r.prerelease && !r.draft)
        .map(r => String(r.tag_name || '').replace(/^v/, ''))
        .filter(v => /^\d+\.\d+\.\d+$/.test(v))
    }
    return [...new Set(versions)]
      .filter(v => v !== current)
      .sort(semverDesc)
      .slice(0, 15)
      .map(v => ({ version: v }))
  }

  /** 下载 + 校验 + 解压暂存 */
  async downloadKernel(version, onProgress) {
    if (!/^\d+\.\d+\.\d+$/.test(String(version))) return { ok: false, error: '无效的版本号' }
    const asset = assetName(version)
    fs.mkdirSync(kernelDir(), { recursive: true })
    const dest = zipPath(version)

    let mirrorTried = ''
    for (const mirror of ['npmmirror', 'github']) {
      const url = mirror === 'npmmirror'
        ? `https://registry.npmmirror.com/-/binary/electron/v${version}/${asset}`
        : `https://github.com/electron/electron/releases/download/v${version}/${asset}`
      try {
        mirrorTried = mirror
        if (fs.existsSync(dest)) fs.rmSync(dest, { force: true })
        await httpsDownload(url, dest, onProgress)
        break
      } catch (e) {
        if (mirror === 'github') return { ok: false, error: `下载失败: ${e.message}` }
      }
    }

    // SHA256 校验（清单拉取失败时跳过校验并标记）
    let verified = false
    try {
      const shasumUrl = mirrorTried === 'npmmirror'
        ? `https://registry.npmmirror.com/-/binary/electron/v${version}/SHASUMS256.txt`
        : `https://github.com/electron/electron/releases/download/v${version}/SHASUMS256.txt`
      const text = await httpsGetText(shasumUrl)
      const line = text.split('\n').find(l => l.trim().endsWith(asset))
      if (line) {
        const expected = line.trim().split(/\s+/)[0].toLowerCase()
        const actual = crypto.createHash('sha256').update(fs.readFileSync(dest)).digest('hex')
        if (actual !== expected) {
          fs.rmSync(dest, { force: true })
          return { ok: false, error: 'SHA256 校验失败，安装包已删除' }
        }
        verified = true
      }
    } catch { verified = false }

    // 解压暂存
    const target = stageDir(version)
    fs.rmSync(target, { recursive: true, force: true })
    fs.mkdirSync(target, { recursive: true })
    try {
      new AdmZip(dest).extractAllTo(target, true)
    } catch (e) {
      return { ok: false, error: `解压失败: ${e.message}` }
    }
    if (!fs.existsSync(path.join(target, 'electron.exe'))) {
      return { ok: false, error: '内核包内容异常（缺少 electron.exe）' }
    }
    return { ok: true, version, verified }
  }

  /** 生成批处理脚本（退出后执行替换） */
  _writeScript(name, content) {
    const scriptPath = path.join(kernelDir(), name)
    fs.writeFileSync(scriptPath, content, 'utf-8')
    return scriptPath
  }

  /** 暂存内核应用：写入切换脚本 → 脱离启动 → 本进程退出 */
  async applyStaged(version) {
    const info = this.getKernelInfo()
    if (!info.packaged || process.platform !== 'win32') {
      return { ok: false, error: '仅支持打包后的 Windows 环境更换内核' }
    }
    const stage = stageDir(version)
    if (!fs.existsSync(path.join(stage, 'electron.exe'))) {
      return { ok: false, error: '该版本尚未下载暂存' }
    }
    const exeName = path.basename(process.execPath)
    const install = installDir()
    const backup = backupDir()
    const stageAbs = stage
    const script = [
      '@echo off',
      'chcp 65001 >nul',
      'timeout /t 2 /nobreak >nul',
      `if not exist "${backup}" mkdir "${backup}"`,
      `for %%F in ("${install}\\*.*") do copy /y "%%F" "${backup}\\" >nul 2>&1`,
      `for %%F in ("${stageAbs}\\*.*") do copy /y "%%F" "${install}\\" >nul 2>&1`,
      'if /i not "' + exeName + '"=="electron.exe" (',
      `  del "${install}\\${exeName}" >nul 2>&1`,
      `  ren "${install}\\electron.exe" "${exeName}" >nul 2>&1`,
      ')',
      `start "" "${install}\\${exeName}"`,
      'del "%~f0" >nul 2>&1',
    ].join('\r\n')
    const scriptPath = this._writeScript('apply.cmd', script)
    const child = spawn('cmd.exe', ['/c', scriptPath], { detached: true, stdio: 'ignore', windowsHide: true })
    child.unref()
    setTimeout(() => app.quit(), 500)
    return { ok: true, restarting: true }
  }

  /** 还原为更换前内核 */
  async restoreKernel() {
    const info = this.getKernelInfo()
    if (!info.packaged || process.platform !== 'win32') {
      return { ok: false, error: '仅支持打包后的 Windows 环境' }
    }
    if (!info.hasBackup) return { ok: false, error: '没有可用的内核备份' }
    const exeName = path.basename(process.execPath)
    const install = installDir()
    const backup = backupDir()
    const script = [
      '@echo off',
      'chcp 65001 >nul',
      'timeout /t 2 /nobreak >nul',
      `for %%F in ("${backup}\\*.*") do copy /y "%%F" "${install}\\" >nul 2>&1`,
      'if /i not "' + exeName + '"=="electron.exe" (',
      `  if not exist "${install}\\${exeName}" if exist "${install}\\electron.exe" ren "${install}\\electron.exe" "${exeName}" >nul 2>&1`,
      ')',
      `start "" "${install}\\${exeName}"`,
      'del "%~f0" >nul 2>&1',
    ].join('\r\n')
    const scriptPath = this._writeScript('restore.cmd', script)
    const child = spawn('cmd.exe', ['/c', scriptPath], { detached: true, stdio: 'ignore', windowsHide: true })
    child.unref()
    setTimeout(() => app.quit(), 500)
    return { ok: true, restarting: true }
  }
}

export default new KernelManager()

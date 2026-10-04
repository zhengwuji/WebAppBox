<script setup>
import { ref, computed, onMounted } from 'vue'

const message = useMessage()

// ---------- 站点列表 ----------
const sites = ref([])
const selected = ref('')
const detail = ref(null)
const options = ref(null)
const saving = ref(false)

const loadSites = async () => {
  sites.value = await window.myApi.getSiteFingerprints()
}

const selectSite = async (site) => {
  selected.value = site.name
  detail.value = await window.myApi.getSiteFingerprint(site.name)
  ov.value = { ...detail.value.overrides }
  if (ov.value.webglVendor && ov.value.webglRenderer) {
    ov.value.webglPair = ov.value.webglVendor + '||' + ov.value.webglRenderer
  }
  parseProxy()
}

// ---------- 指纹覆盖 ----------
const ov = ref({})

const webglPairs = computed(() => {
  const os = ov.value.os || detail.value?.profile?.os || 'windows'
  return (options.value?.webgl?.[os]) || []
})

const randomize = async () => {
  await window.myApi.randomizeSiteFingerprint(selected.value)
  message.success('已随机化，重新打开该站点后生效')
  await selectSite({ name: selected.value })
  await loadSites()
}

const saveEnvironment = async () => {
  saving.value = true
  try {
    const clean = {}
    Object.keys(ov.value).forEach(k => {
      const v = ov.value[k]
      if (v === null || v === undefined || v === '') return
      if (k === 'screenWidth' || k === 'screenHeight') {
        const n = parseInt(v, 10)
        if (Number.isFinite(n) && n > 0) clean[k] = n
        return
      }
      if (k === 'webglPair') {
        const parts = String(v).split('||')
        if (parts.length === 2) {
          clean.webglVendor = parts[0]
          clean.webglRenderer = parts[1]
        }
        return
      }
      clean[k] = v
    })
    const proxy = proxyMode.value === 'custom'
      ? { mode: 'custom', ...cleanProxyForm(proxyForm.value) }
      : { mode: proxyMode.value }
    await window.myApi.updateSiteFingerprint({ name: selected.value, overrides: clean, proxy })
    message.success('环境已保存，重新打开该站点后生效')
    await loadSites()
  } catch (e) {
    message.error('保存失败: ' + e)
  } finally {
    saving.value = false
  }
}

// ---------- 站点代理 ----------
const proxyMode = ref('global')
const proxyForm = ref({ type: 'socks5', host: '', port: '', username: '', password: '' })
const testing = ref(false)
const testResult = ref(null)

const parseProxy = () => {
  const raw = detail.value?.proxy || ''
  if (raw.startsWith('{')) {
    try {
      const p = JSON.parse(raw)
      proxyMode.value = p.mode || 'global'
      if (p.type && p.type !== 'none') {
        proxyForm.value = { type: p.type, host: p.host || '', port: String(p.port || ''), username: p.username || '', password: p.password || '' }
      }
      return
    } catch { /* 落到默认 */ }
  } else if (raw) {
    proxyMode.value = 'custom'
    const parts = raw.split(':')
    proxyForm.value = { type: 'http', host: parts[0] || '', port: parts[1] || '', username: '', password: '' }
    return
  }
  proxyMode.value = 'global'
}

const cleanProxyForm = (form) => {
  if (form.type === 'none') return { type: 'none' }
  return {
    type: form.type,
    host: String(form.host || '').trim(),
    port: parseInt(form.port, 10),
    username: String(form.username || ''),
    password: String(form.password || ''),
  }
}

const testProxyNow = async () => {
  testing.value = true
  testResult.value = null
  try {
    testResult.value = await window.myApi.testProxy(cleanProxyForm(proxyForm.value))
  } catch (e) {
    testResult.value = { ok: false, error: String(e) }
  } finally {
    testing.value = false
  }
}

// ---------- 全局代理 ----------
const globalForm = ref({ type: 'none', host: '', port: '', username: '', password: '' })
const globalTesting = ref(false)
const globalTestResult = ref(null)

const loadGlobalProxy = async () => {
  const g = await window.myApi.getGlobalProxy()
  globalForm.value = {
    type: g?.type || 'none',
    host: g?.host || '',
    port: String(g?.port || ''),
    username: g?.username || '',
    password: g?.password || '',
  }
}

const saveGlobalProxy = async () => {
  await window.myApi.setGlobalProxy(cleanProxyForm(globalForm.value))
  message.success('全局代理已保存并对新会话生效')
}

const testGlobalProxy = async () => {
  globalTesting.value = true
  globalTestResult.value = null
  try {
    globalTestResult.value = await window.myApi.testProxy(cleanProxyForm(globalForm.value))
  } catch (e) {
    globalTestResult.value = { ok: false, error: String(e) }
  } finally {
    globalTesting.value = false
  }
}

// ---------- 内核管理 ----------
const kernel = ref(null)
const kernelList = ref([])
const kernelVersion = ref('')
const kernelBusy = ref(false)
const kernelProgress = ref(null)

const loadKernel = async () => {
  kernel.value = await window.myApi.getKernelInfo()
  kernelList.value = await window.myApi.listKernels()
}

const downloadKernel = async () => {
  if (!kernelVersion.value) return message.warning('请先选择内核版本')
  kernelBusy.value = true
  kernelProgress.value = { percent: 0 }
  const off = window.myApi.onKernelProgress(p => { kernelProgress.value = p })
  try {
    const r = await window.myApi.downloadKernel(kernelVersion.value)
    if (r.ok) {
      message.success(`v${r.version} 已下载暂存${r.verified ? '（SHA256 校验通过）' : '（校验清单不可用，未校验）'}`)
    } else {
      message.error(r.error)
    }
  } catch (e) {
    message.error(String(e))
  } finally {
    off && off()
    kernelBusy.value = false
    kernelProgress.value = null
    await loadKernel()
  }
}

const applyKernel = async () => {
  const r = await window.myApi.applyKernel(kernelVersion.value)
  if (!r.ok) message.error(r.error)
  // 成功时应用会退出并由脚本重启
}

const restoreKernel = async () => {
  const r = await window.myApi.restoreKernel()
  if (!r.ok) message.error(r.error)
}

onMounted(async () => {
  options.value = await window.myApi.getFingerprintOptions()
  await loadSites()
  await loadGlobalProxy()
  await loadKernel()
  if (sites.value.length) selectSite(sites.value[0])
})
</script>

<template>
  <div id="content-main">
    <n-alert :show-icon="false" type="info" style="margin-bottom: 1rem;">
      <n-h3 style="margin-bottom: 0;">指纹环境</n-h3>
    </n-alert>

    <div class="layout">
      <!-- 左侧站点列表 -->
      <div class="side">
        <div class="side-title">站点环境</div>
        <div
          v-for="site in sites" :key="site.name"
          class="side-item" :class="{ active: selected === site.name }"
          @click="selectSite(site)"
        >
          <div class="side-name">{{ site.tag || site.name }}</div>
          <div class="side-sub">{{ site.summary.os }} · Chrome {{ site.summary.chromeVersion.split('.')[0] }} · {{ site.summary.timezone }}</div>
        </div>
        <n-empty v-if="!sites.length" description="暂无站点" style="padding: 40px 0;" />
      </div>

      <!-- 右侧详情 -->
      <div class="main" v-if="detail">
        <n-tabs type="line" animated>
          <!-- 指纹 -->
          <n-tab-pane name="fp" tab="环境指纹">
            <div class="cards">
              <div class="kcard">
                <div class="klabel">操作系统</div>
                <div class="kvalue">{{ detail.profile.os }} {{ detail.profile.osVersion }}</div>
              </div>
              <div class="kcard">
                <div class="klabel">Chrome 版本</div>
                <div class="kvalue">{{ detail.profile.chromeVersion }}</div>
              </div>
              <div class="kcard">
                <div class="klabel">时区 / 语言</div>
                <div class="kvalue">{{ detail.profile.timezone }} · {{ detail.profile.languages[0] }}</div>
              </div>
              <div class="kcard">
                <div class="klabel">屏幕</div>
                <div class="kvalue">{{ detail.profile.screen.width }}x{{ detail.profile.screen.height }} @{{ detail.profile.screen.dpr }}x</div>
              </div>
              <div class="kcard">
                <div class="klabel">硬件</div>
                <div class="kvalue">{{ detail.profile.hardwareConcurrency }} 核 / {{ detail.profile.deviceMemory }}G</div>
              </div>
              <div class="kcard">
                <div class="klabel">WebGL</div>
                <div class="kvalue">{{ detail.profile.webgl.renderer }}</div>
              </div>
            </div>

            <n-button size="small" type="primary" ghost @click="randomize" style="margin: 10px 0;">🎲 随机化新身份</n-button>

            <n-h6 style="margin: 6px 0;">手动固定（留空跟随随机身份）</n-h6>
            <div class="form-grid">
              <div class="fitem"><label>操作系统</label>
                <n-select size="small" clearable v-model:value="ov.os" :options="(options?.osList || []).map(v => ({ label: v, value: v }))" placeholder="随机" />
              </div>
              <div class="fitem"><label>Chrome 版本</label>
                <n-select size="small" clearable filterable v-model:value="ov.chromeVersion" :options="(options?.chromeVersions || []).map(v => ({ label: v, value: v }))" placeholder="随机" />
              </div>
              <div class="fitem"><label>时区（决定语言/地理位置）</label>
                <n-select size="small" clearable filterable v-model:value="ov.timezone" :options="(options?.timezones || []).map(v => ({ label: v, value: v }))" placeholder="随机" />
              </div>
              <div class="fitem"><label>CPU 核数</label>
                <n-select size="small" clearable v-model:value="ov.hardwareConcurrency" :options="(options?.hardware?.concurrency || []).map(v => ({ label: v + ' 核', value: v }))" placeholder="随机" />
              </div>
              <div class="fitem"><label>内存 (GB)</label>
                <n-select size="small" clearable v-model:value="ov.deviceMemory" :options="(options?.hardware?.memory || []).map(v => ({ label: v + ' GB', value: v }))" placeholder="随机" />
              </div>
              <div class="fitem"><label>WebGL 显卡</label>
                <n-select size="small" clearable v-model:value="ov.webglPair" :options="webglPairs.map(w => ({ label: w[0] + ' / ' + w[1], value: w[0] + '||' + w[1] }))" placeholder="随机" />
              </div>
              <div class="fitem"><label>屏幕宽</label>
                <n-input size="small" v-model:value="ov.screenWidth" placeholder="如 1920" />
              </div>
              <div class="fitem"><label>屏幕高</label>
                <n-input size="small" v-model:value="ov.screenHeight" placeholder="如 1080" />
              </div>
              <div class="fitem"><label>缩放比</label>
                <n-select size="small" clearable v-model:value="ov.dpr" :options="[1, 1.25, 1.5, 2].map(v => ({ label: v + 'x', value: v }))" placeholder="随机" />
              </div>
            </div>

            <n-button size="small" type="primary" :loading="saving" @click="saveEnvironment" style="margin-top: 12px;">保存环境</n-button>
          </n-tab-pane>

          <!-- 代理 -->
          <n-tab-pane name="proxy" tab="站点代理">
            <n-radio-group v-model:value="proxyMode" size="small" style="margin-bottom: 12px;">
              <n-radio-button value="global">跟随全局</n-radio-button>
              <n-radio-button value="direct">直连</n-radio-button>
              <n-radio-button value="custom">自定义</n-radio-button>
            </n-radio-group>

            <template v-if="proxyMode === 'custom'">
              <div class="form-grid">
                <div class="fitem"><label>类型</label>
                  <n-select size="small" v-model:value="proxyForm.type" :options="[{ label: 'SOCKS5', value: 'socks5' }, { label: 'HTTP', value: 'http' }]" />
                </div>
                <div class="fitem"><label>主机</label>
                  <n-input size="small" v-model:value="proxyForm.host" placeholder="127.0.0.1" />
                </div>
                <div class="fitem"><label>端口</label>
                  <n-input size="small" v-model:value="proxyForm.port" placeholder="11111" />
                </div>
                <div class="fitem"><label>用户名（可空）</label>
                  <n-input size="small" v-model:value="proxyForm.username" placeholder="无认证留空" />
                </div>
                <div class="fitem"><label>密码（可空）</label>
                  <n-input size="small" type="password" show-password-on="click" v-model:value="proxyForm.password" placeholder="无认证留空" />
                </div>
              </div>
            </template>

            <n-space style="margin-top: 10px;">
              <n-button size="small" type="primary" :loading="testing" @click="testProxyNow" :disabled="proxyMode === 'direct'">测试连接</n-button>
            </n-space>

            <n-alert v-if="testResult && testResult.ok" type="success" style="margin-top: 12px;" :show-icon="false">
              ✅ 连接成功 · 出口 IP：{{ testResult.ip }} · {{ testResult.country }}（{{ testResult.countryCode }}）· {{ testResult.city }} · {{ testResult.isp }} · 延迟 {{ testResult.latencyMs }}ms
            </n-alert>
            <n-alert v-if="testResult && !testResult.ok" type="error" style="margin-top: 12px;" :show-icon="false">
              ❌ 连接失败：{{ testResult.error }}
            </n-alert>

            <n-alert type="default" style="margin-top: 12px;" :show-icon="false">
              提示：SOCKS5 带用户名密码时，应用会自动经本地中继转发（Chromium 内核原生不支持 SOCKS5 认证）；HTTP 代理认证由内核直接处理。
            </n-alert>
          </n-tab-pane>
        </n-tabs>
      </div>
    </div>

    <!-- 全局代理 & 内核：独立卡片 -->
    <div class="layout" style="margin-top: 12px;">
      <div class="main-wide">
        <n-tabs type="line" animated>
          <n-tab-pane name="global" tab="全局代理">
            <div class="form-grid">
              <div class="fitem"><label>类型</label>
                <n-select size="small" v-model:value="globalForm.type" :options="[{ label: '不使用代理', value: 'none' }, { label: 'SOCKS5', value: 'socks5' }, { label: 'HTTP', value: 'http' }]" />
              </div>
              <template v-if="globalForm.type !== 'none'">
                <div class="fitem"><label>主机</label>
                  <n-input size="small" v-model:value="globalForm.host" placeholder="127.0.0.1" />
                </div>
                <div class="fitem"><label>端口</label>
                  <n-input size="small" v-model:value="globalForm.port" placeholder="11111" />
                </div>
                <div class="fitem"><label>用户名（可空）</label>
                  <n-input size="small" v-model:value="globalForm.username" placeholder="无认证留空" />
                </div>
                <div class="fitem"><label>密码（可空）</label>
                  <n-input size="small" type="password" show-password-on="click" v-model:value="globalForm.password" placeholder="无认证留空" />
                </div>
              </template>
            </div>
            <n-space style="margin-top: 10px;">
              <n-button size="small" type="primary" @click="saveGlobalProxy" :disabled="globalForm.type === 'none'">保存全局代理</n-button>
              <n-button size="small" :loading="globalTesting" @click="testGlobalProxy" :disabled="globalForm.type === 'none'">测试连接</n-button>
            </n-space>
            <n-alert v-if="globalTestResult && globalTestResult.ok" type="success" style="margin-top: 12px;" :show-icon="false">
              ✅ 连接成功 · 出口 IP：{{ globalTestResult.ip }} · {{ globalTestResult.country }}（{{ globalTestResult.countryCode }}）· {{ globalTestResult.city }} · {{ globalTestResult.isp }} · 延迟 {{ globalTestResult.latencyMs }}ms
            </n-alert>
            <n-alert v-if="globalTestResult && !globalTestResult.ok" type="error" style="margin-top: 12px;" :show-icon="false">
              ❌ 连接失败：{{ globalTestResult.error }}
            </n-alert>
            <n-alert type="default" style="margin-top: 12px;" :show-icon="false">
              全局代理作用于主窗口、图标抓取、更新检查等默认会话；各站点默认"跟随全局"，可在站点代理里改为直连或自定义。
            </n-alert>
          </n-tab-pane>

          <n-tab-pane name="kernel" tab="内核管理">
            <div v-if="kernel && !kernel.supported" >
              <n-alert type="warning" :show-icon="false">内核更换仅支持打包后的 Windows 版本；当前为{{ kernel.packaged ? '非 Windows 平台' : '开发模式' }}。</n-alert>
            </div>
            <template v-if="kernel && kernel.supported">
              <div class="cards">
                <div class="kcard">
                  <div class="klabel">当前 Electron 内核</div>
                  <div class="kvalue">v{{ kernel.electron }}</div>
                </div>
                <div class="kcard">
                  <div class="klabel">当前 Chromium</div>
                  <div class="kvalue">{{ kernel.chrome }}</div>
                </div>
                <div class="kcard">
                  <div class="klabel">已暂存</div>
                  <div class="kvalue">{{ kernel.stagedVersion ? 'v' + kernel.stagedVersion : '无' }}</div>
                </div>
                <div class="kcard">
                  <div class="klabel">备份</div>
                  <div class="kvalue">{{ kernel.hasBackup ? '可用' : '无' }}</div>
                </div>
              </div>

              <div class="form-grid">
                <div class="fitem"><label>目标内核版本</label>
                  <n-select size="small" filterable v-model:value="kernelVersion"
                    :options="kernelList.map(k => ({ label: 'v' + k.version, value: k.version }))"
                    placeholder="选择要下载的 Electron 版本" />
                </div>
              </div>
              <n-space style="margin-top: 10px;" align="center">
                <n-button size="small" type="primary" :loading="kernelBusy" @click="downloadKernel">下载并暂存</n-button>
                <n-button size="small" type="warning" @click="applyKernel" :disabled="!kernel.stagedVersion">应用暂存内核并重启</n-button>
                <n-button size="small" type="error" ghost @click="restoreKernel" :disabled="!kernel.hasBackup">还原备份内核</n-button>
              </n-space>
              <n-progress v-if="kernelProgress" type="line" :percentage="kernelProgress.percent || 0" indicator-placement="inside" style="margin-top: 10px;" />
              <n-alert type="default" style="margin-top: 12px;" :show-icon="false">
                应用流程：下载 → SHA256 校验 → 暂存 → 退出应用 → 自动替换内核文件并重启。替换前会自动备份当前内核，可用"还原"回滚。仅影响应用自身运行内核；各站点指纹中的 Chrome 版本可在"环境指纹"里单独选择。
              </n-alert>
            </template>
          </n-tab-pane>
        </n-tabs>
      </div>
    </div>
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.side {
  width: 260px;
  flex-shrink: 0;
  border: 1px solid var(--new-color-border);
  border-radius: var(--radius-md);
  padding: 8px;
  background: var(--color-background);
  max-height: 70vh;
  overflow-y: auto;
}
.side-title {
  font-size: 13px;
  font-weight: 600;
  padding: 4px 8px 8px;
  color: var(--color-text);
}
.side-item {
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}
.side-item:hover { background: var(--color-background-mute); }
.side-item.active { background: var(--color-background-mute); box-shadow: inset 3px 0 0 var(--color-accent-green); }
.side-name { font-size: 13px; color: var(--color-text); }
.side-sub { font-size: 11px; color: var(--color-text-tertiary); margin-top: 2px; }
.main, .main-wide {
  flex: 1;
  min-width: 600px;
  border: 1px solid var(--new-color-border);
  border-radius: var(--radius-md);
  padding: 12px 16px;
  background: var(--color-background);
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
}
.kcard {
  border: 1px solid var(--new-color-border);
  border-radius: 8px;
  padding: 8px 12px;
  background: var(--color-background-mute);
}
.klabel { font-size: 11px; color: var(--color-text-tertiary); }
.kvalue { font-size: 13px; color: var(--color-text); margin-top: 2px; word-break: break-all; }
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
}
.fitem label {
  display: block;
  font-size: 12px;
  color: var(--color-text-tertiary);
  margin-bottom: 4px;
}
</style>

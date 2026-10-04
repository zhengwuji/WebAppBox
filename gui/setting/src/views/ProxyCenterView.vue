<script setup>
import { h } from 'vue'
import { NDropdown } from 'naive-ui'

const message = useMessage();

// ---------- 全局代理 ----------
const globalForm = ref({ type: 'none', host: '', port: '', username: '', password: '' });
const globalTesting = ref(false);
const globalTestResult = ref(null);

const cleanProxyForm = (f) => {
  if (!f.type || f.type === 'none') return { type: 'none' };
  return {
    type: f.type,
    host: String(f.host || '').trim(),
    port: parseInt(f.port, 10) || 0,
    username: f.username || '',
    password: f.password || '',
  };
};

const loadGlobalProxy = async () => {
  const g = await window.myApi.getGlobalProxy();
  globalForm.value = {
    type: g?.type || 'none',
    host: g?.host || '',
    port: String(g?.port || ''),
    username: g?.username || '',
    password: g?.password || '',
  };
};

const saveGlobalProxy = async () => {
  const clean = cleanProxyForm(globalForm.value);
  if (clean.type !== 'none' && (!clean.host || !clean.port)) {
    return message.error('自定义全局代理需填写主机和端口');
  }
  await window.myApi.setGlobalProxy(clean);
  message.success('全局代理已保存并对新会话生效');
};

const testGlobalProxy = async () => {
  const clean = cleanProxyForm(globalForm.value);
  if (clean.type === 'none') return message.error('当前为直接连接，无需测试');
  if (!clean.host || !clean.port) return message.error('请先填写主机和端口');
  globalTesting.value = true;
  globalTestResult.value = null;
  try {
    globalTestResult.value = await window.myApi.testProxy(clean);
  } catch (e) {
    globalTestResult.value = { ok: false, error: String(e) };
  } finally {
    globalTesting.value = false;
  }
};

// ---------- 每个窗口的代理 ----------
const list = ref([]);
const loading = ref(false);
const load = async () => {
  loading.value = true;
  try {
    const config = await window.myApi.getConfig();
    list.value = [...config.openMenus, ...config.closeMenus];
  } finally {
    loading.value = false;
  }
};
onMounted(async () => {
  await loadGlobalProxy();
  await load();
});

const proxySummary = (raw) => {
  const value = String(raw || '');
  if (!value) return { label: '跟随全局', tone: 'default' };
  if (value.startsWith('{')) {
    try {
      const p = JSON.parse(value);
      if (p.mode === 'direct') return { label: '直连', tone: 'success' };
      if (p.mode === 'custom') return { label: `${(p.type || 'socks5').toUpperCase()} ${p.host}:${p.port}`, tone: 'info' };
      return { label: '跟随全局', tone: 'default' };
    } catch { /* fallthrough */ }
  }
  const withoutAuth = value.replace(/^\w+:\/\//, '').split('@').pop();
  const type = value.startsWith('socks') ? 'SOCKS5' : 'HTTP';
  return { label: `${type} ${withoutAuth}`, tone: 'info' };
};

const testingName = ref('');
const testResults = ref({}); // name -> result
const testRowProxy = async (row) => {
  const value = String(row.proxy || '');
  if (!value.startsWith('{')) return message.error('该窗口未配置自定义代理');
  let p;
  try { p = JSON.parse(value) } catch { return message.error('代理配置无法解析') }
  if (p.mode !== 'custom') return message.error(p.mode === 'direct' ? '该窗口为直连' : '该窗口跟随全局，请测试全局代理');
  testingName.value = row.name;
  try {
    testResults.value[row.name] = await window.myApi.testProxy({
      type: p.type, host: p.host, port: p.port, username: p.username, password: p.password,
    });
  } catch (e) {
    testResults.value[row.name] = { ok: false, error: String(e) };
  } finally {
    testingName.value = '';
  }
};

// 行内编辑代理
const editModal = ref({
  show: false, row: null, mode: 'global', type: 'socks5',
  host: '', port: '', username: '', password: '', testing: false, result: null,
});
const openEdit = (row) => {
  const value = String(row.proxy || '');
  let mode = 'global', type = 'socks5', host = '', port = '', username = '', password = '';
  if (value.startsWith('{')) {
    try {
      const p = JSON.parse(value);
      mode = p.mode || 'global';
      if (p.type && p.type !== 'none' && p.mode === 'custom') {
        type = p.type; host = p.host || ''; port = String(p.port || '');
        username = p.username || ''; password = p.password || '';
      }
    } catch { /* 默认 */ }
  } else if (value) {
    mode = 'custom';
    type = value.startsWith('socks') ? 'socks5' : 'http';
    const withoutAuth = value.replace(/^\w+:\/\//, '').split('@').pop();
    const parts = withoutAuth.split(':');
    host = parts[0] || ''; port = parts[1] || '';
  }
  editModal.value = { show: true, row, mode, type, host, port, username, password, testing: false, result: null };
};

const saveEdit = async () => {
  const m = editModal.value;
  let proxyValue;
  if (m.mode === 'custom') {
    if (!m.host.trim() || !parseInt(m.port, 10)) return message.error('自定义代理需填写主机和端口');
    proxyValue = JSON.stringify({
      mode: 'custom', type: m.type, host: m.host.trim(),
      port: parseInt(m.port, 10), username: m.username, password: m.password,
    });
  } else {
    proxyValue = JSON.stringify({ mode: m.mode });
  }
  window.myApi.updateMenu({ ...m.row, proxy: proxyValue });
  message.success('代理已保存');
  m.show = false;
  setTimeout(load, 300);
};

const testEditProxy = async () => {
  const m = editModal.value;
  if (!m.host.trim() || !parseInt(m.port, 10)) return message.error('请先填写主机和端口');
  m.testing = true;
  m.result = null;
  try {
    m.result = await window.myApi.testProxy({
      type: m.type, host: m.host.trim(), port: parseInt(m.port, 10),
      username: m.username, password: m.password,
    });
  } catch (e) {
    m.result = { ok: false, error: String(e) };
  } finally {
    m.testing = false;
  }
};

const toneColor = { default: '#86909c', success: '#00b42a', info: '#2f54eb' };
const columns = [
  {
    title: '窗口', key: 'tag', width: 200, ellipsis: { tooltip: true },
    render: (row) => h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
      h('img', {
        src: row.img || 'webappbox-logo.png',
        style: { width: '22px', height: '22px', borderRadius: '6px', objectFit: 'cover', flex: 'none', background: '#f0f1f5' },
      }),
      h('span', { style: { fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, row.tag || row.name),
    ]),
  },
  {
    title: '代理', key: 'proxy', width: 210,
    render: (row) => {
      const s = proxySummary(row.proxy);
      return h('span', { style: { fontSize: '12px', color: toneColor[s.tone], fontWeight: 600 } }, s.label);
    },
  },
  {
    title: '测试结果', key: 'test', minWidth: 240,
    render: (row) => {
      const r = testResults.value[row.name];
      if (testingName.value === row.name) return h('span', { style: { fontSize: '12px', color: '#858f9f' } }, '测试中…');
      if (!r) return h('span', { style: { color: '#c1c7d0', fontSize: '12px' } }, '—');
      if (r.ok) return h('span', { style: { fontSize: '12px', color: '#059669' } },
        `✅ 出口 ${r.ip} · ${r.country}（${r.countryCode}）· ${r.latencyMs}ms`);
      return h('span', { style: { fontSize: '12px', color: '#dc2626' } }, `❌ ${r.error}`);
    },
  },
  {
    title: '操作', key: 'actions', width: 150,
    render: (row) => h('div', { style: { display: 'flex', gap: '6px' } }, [
      h('button', {
        style: ghostBtn,
        onClick: () => testRowProxy(row),
      }, '测试'),
      h('button', {
        style: ghostBtn,
        onClick: () => openEdit(row),
      }, '编辑代理'),
    ]),
  },
];

const ghostBtn = {
  height: '26px', padding: '0 10px', borderRadius: '7px', cursor: 'pointer',
  fontSize: '12px', fontWeight: 500, background: 'transparent',
  border: '1px solid rgba(25,33,46,.14)', color: '#566071',
};
</script>

<template>
  <div class="pc-page">
    <div class="pc-header">
      <div>
        <h2 class="pc-title">代理IP</h2>
        <p class="pc-desc">全局网络出口与每个窗口的独立代理，支持 SOCKS5 / HTTP 与账密认证。</p>
      </div>
    </div>

    <!-- 全局代理 -->
    <section class="pc-card">
      <h3 class="pc-card-title">全局代理</h3>
      <n-radio-group v-model:value="globalForm.type" size="small">
        <n-radio-button value="none">直接连接</n-radio-button>
        <n-radio-button value="socks5">SOCKS5</n-radio-button>
        <n-radio-button value="http">HTTP</n-radio-button>
      </n-radio-group>
      <template v-if="globalForm.type !== 'none'">
        <div class="pc-form-row">
          <n-input size="small" placeholder="主机 如 127.0.0.1" v-model:value="globalForm.host" style="flex: 2;" />
          <n-input size="small" placeholder="端口" v-model:value="globalForm.port" style="flex: 1;" />
          <n-input size="small" placeholder="用户名（可空）" v-model:value="globalForm.username" style="flex: 1.4;" />
          <n-input size="small" type="password" show-password-on="click" placeholder="密码（可空）"
            v-model:value="globalForm.password" style="flex: 1.4;" />
        </div>
      </template>
      <div class="pc-form-row" style="margin-top: 12px;">
        <n-button size="small" type="primary" @click="saveGlobalProxy">保存全局代理</n-button>
        <n-button size="small" secondary :loading="globalTesting" @click="testGlobalProxy"
          v-if="globalForm.type !== 'none'">测试连接</n-button>
      </div>
      <n-alert v-if="globalTestResult && globalTestResult.ok" type="success" style="margin-top: 10px;" :show-icon="false">
        ✅ 出口 IP：{{ globalTestResult.ip }} · {{ globalTestResult.country }}（{{ globalTestResult.countryCode }}）·
        {{ globalTestResult.city }} · {{ globalTestResult.isp }} · 延迟 {{ globalTestResult.latencyMs }}ms
      </n-alert>
      <n-alert v-if="globalTestResult && !globalTestResult.ok" type="error" style="margin-top: 10px;" :show-icon="false">
        ❌ {{ globalTestResult.error }}
      </n-alert>
    </section>

    <!-- 每个窗口 -->
    <section class="pc-card">
      <div class="pc-card-head">
        <h3 class="pc-card-title">窗口代理</h3>
        <n-button size="small" secondary :loading="loading" @click="load">刷新</n-button>
      </div>
      <n-data-table :columns="columns" :data="list" :row-key="(r) => r.name" size="small" :scroll-x="720">
        <template #empty>
          <n-empty description="暂无窗口" style="padding: 40px 0;" />
        </template>
      </n-data-table>
      <p class="pc-hint">说明：默认「跟随全局」；「直连」强制不走代理；「自定义」仅对该窗口生效，支持账密认证的 SOCKS5（自动经本地中继转发）。</p>
    </section>

    <!-- 编辑代理弹窗 -->
    <n-modal v-model:show="editModal.show" preset="dialog" title="编辑窗口代理" positive-text="保存"
      negative-text="取消" @positive-click="saveEdit" style="width: 460px;">
      <div class="pc-modal-body">
        <n-radio-group v-model:value="editModal.mode" size="small">
          <n-radio-button value="global">跟随全局</n-radio-button>
          <n-radio-button value="direct">直连</n-radio-button>
          <n-radio-button value="custom">自定义代理</n-radio-button>
        </n-radio-group>
        <template v-if="editModal.mode === 'custom'">
          <div class="pc-form-row" style="margin-top: 12px;">
            <n-select size="small" style="width: 110px" v-model:value="editModal.type"
              :options="[{ label: 'SOCKS5', value: 'socks5' }, { label: 'HTTP', value: 'http' }]" />
            <n-input size="small" placeholder="主机 如 127.0.0.1" v-model:value="editModal.host" style="flex: 2;" />
            <n-input size="small" placeholder="端口" v-model:value="editModal.port" style="flex: 1;" />
          </div>
          <div class="pc-form-row" style="margin-top: 10px;">
            <n-input size="small" placeholder="用户名（可空）" v-model:value="editModal.username" style="flex: 1;" />
            <n-input size="small" type="password" show-password-on="click" placeholder="密码（可空）"
              v-model:value="editModal.password" style="flex: 1;" />
          </div>
          <n-button size="small" style="margin-top: 10px" :loading="editModal.testing" @click="testEditProxy">测试连接</n-button>
          <n-alert v-if="editModal.result && editModal.result.ok" type="success" style="margin-top: 10px;" :show-icon="false">
            ✅ 出口 IP：{{ editModal.result.ip }} · {{ editModal.result.country }}（{{ editModal.result.countryCode }}）· 延迟 {{ editModal.result.latencyMs }}ms
          </n-alert>
          <n-alert v-if="editModal.result && !editModal.result.ok" type="error" style="margin-top: 10px;" :show-icon="false">
            ❌ {{ editModal.result.error }}
          </n-alert>
        </template>
      </div>
    </n-modal>
  </div>
</template>

<style scoped>
.pc-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.pc-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #151a23;
}

.pc-desc {
  margin: 4px 0 0;
  font-size: 12.5px;
  color: #858f9f;
}

.pc-card {
  border: 1px solid rgba(25, 33, 46, .08);
  border-radius: 12px;
  padding: 14px 16px;
  background: #fff;
}

.pc-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.pc-card-title {
  margin: 0 0 10px;
  font-size: 14.5px;
  font-weight: 650;
  color: #151a23;
}

.pc-card-head .pc-card-title {
  margin-bottom: 0;
}

.pc-form-row {
  display: flex;
  gap: 10px;
  margin-top: 12px;
  flex-wrap: wrap;
}

.pc-hint {
  margin: 10px 0 0;
  font-size: 12px;
  color: #858f9f;
}

.pc-modal-body {
  padding-top: 6px;
}
</style>

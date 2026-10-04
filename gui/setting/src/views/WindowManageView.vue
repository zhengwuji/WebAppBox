<script setup>
import { h } from 'vue'
import { NDropdown } from 'naive-ui'
import NewDrawer from "@/components/NewDrawer.vue";

const message = useMessage();
const dialog = useDialog();

// ---------- 数据 ----------
const list = ref([]);           // 全部窗口（站点 + 浏览器环境）
const groups = ref([]);         // 分组（sites 为名称 CSV）
const running = ref(new Set()); // 运行中的窗口名
const loading = ref(false);

const load = async () => {
  loading.value = true;
  try {
    const config = await window.myApi.getConfig();
    list.value = [...config.openMenus, ...config.closeMenus];
    groups.value = await window.myApi.getGroups();
    try {
      const names = await window.myApi.getRunningWindows();
      running.value = new Set(names || []);
    } catch { running.value = new Set() }
  } finally {
    loading.value = false;
  }
};
onMounted(load);

const nameOf = (g) => g.tag || g.name;
// 窗口 -> 分组名
const groupOf = (siteName) => {
  const g = groups.value.find(g => String(g.sites || '').split(',').filter(Boolean).includes(siteName));
  return g ? nameOf(g) : '';
};

// ---------- 筛选 / 分页 ----------
const keyword = ref('');
const filterGroup = ref('all');   // all | none | <group name>
const filterStatus = ref('all');  // all | open | closed
const page = ref(1);
const pageSize = ref(20);

const groupOptions = computed(() => [
  { label: '全部分组', value: 'all' },
  { label: '未分组', value: 'none' },
  ...groups.value.map(g => ({ label: nameOf(g), value: g.name })),
]);
const statusOptions = [
  { label: '全部状态', value: 'all' },
  { label: '已打开', value: 'open' },
  { label: '未打开', value: 'closed' },
];

const filtered = computed(() => {
  let rows = list.value;
  if (filterGroup.value === 'none') {
    rows = rows.filter(s => !groupOf(s.name));
  } else if (filterGroup.value !== 'all') {
    const g = groups.value.find(x => x.name === filterGroup.value);
    const names = g ? String(g.sites || '').split(',').filter(Boolean) : [];
    rows = rows.filter(s => names.includes(s.name));
  }
  if (filterStatus.value === 'open') rows = rows.filter(s => running.value.has(s.name));
  if (filterStatus.value === 'closed') rows = rows.filter(s => !running.value.has(s.name));
  const kw = keyword.value.trim().toLowerCase();
  if (kw) {
    rows = rows.filter(s =>
      (s.tag || '').toLowerCase().includes(kw) ||
      (s.remark || '').toLowerCase().includes(kw) ||
      String(s.order ?? '').includes(kw) ||
      (s.url || '').toLowerCase().includes(kw));
  }
  return rows;
});

const pagedRows = computed(() => {
  const start = (page.value - 1) * pageSize.value;
  return filtered.value.slice(start, start + pageSize.value);
});

const fmtTime = (ts) => {
  const n = Number(ts || 0);
  if (!n) return '—';
  const d = new Date(n);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

// ---------- 代理摘要 ----------
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

// ---------- 移动到分组 ----------
const moveToGroup = async (row, groupKey) => {
  for (const g of groups.value) {
    const names = String(g.sites || '').split(',').filter(Boolean);
    const has = names.includes(row.name);
    const target = groupKey !== 'none' && g.name === groupKey;
    if (target && !has) {
      names.push(row.name);
      await window.myApi.updateGroup({ name: g.name, sites: names.join(',') });
    } else if (!target && has) {
      await window.myApi.updateGroup({ name: g.name, sites: names.filter(n => n !== row.name).join(',') });
    }
  }
  message.success(groupKey === 'none' ? '已移入未分组' : '分组已更新');
  await load();
};

// ---------- 表格列 ----------
const toneColor = { default: '#86909c', success: '#00b42a', info: '#2f54eb' };

const columns = [
  { type: 'selection' },
  {
    title: '序号', key: 'order', width: 64,
    render: (row) => h('span', { style: { color: '#86909c', fontSize: '13px' } }, String(row.order ?? '-')),
  },
  {
    title: '窗口名称', key: 'tag', minWidth: 180, ellipsis: { tooltip: true },
    render: (row) => h('div', { style: { display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0 } }, [
      h('div', { style: { position: 'relative', flex: 'none' } }, [
        h('img', {
          src: row.img || 'webappbox-logo.png',
          style: { width: '28px', height: '28px', borderRadius: '6px', objectFit: 'cover', display: 'block', background: '#f2f3f5' },
        }),
        h('span', {
          title: running.value.has(row.name) ? '已打开' : '未打开',
          style: {
            position: 'absolute', right: '-2px', bottom: '-2px', width: '9px', height: '9px',
            borderRadius: '50%', border: '2px solid #fff',
            background: running.value.has(row.name) ? '#00b42a' : '#c9cdd4',
          },
        }),
      ]),
      h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500, color: '#1d2129' } },
        row.tag || row.name || '未命名窗口'),
    ]),
  },
  {
    title: '代理信息', key: 'proxy', width: 200,
    render: (row) => {
      const s = proxySummary(row.proxy);
      return h('span', { style: { fontSize: '13px', color: toneColor[s.tone] } }, s.label);
    },
  },
  {
    title: '所属分组', key: 'group', width: 120,
    render: (row) => {
      const g = groupOf(row.name);
      return h('span', {
        style: {
          fontSize: '12px', padding: '1px 8px', borderRadius: '4px',
          background: g ? 'rgba(47,84,235,.08)' : '#f2f3f5',
          color: g ? '#2f54eb' : '#86909c',
        },
      }, g || '未分组');
    },
  },
  {
    title: '备注', key: 'remark', minWidth: 110, ellipsis: { tooltip: true },
    render: (row) => h('span', {
      style: { color: row.remark ? '#4e5969' : '#c9cdd4', fontSize: '13px', cursor: 'text' },
      onClick: () => openRemark(row),
    }, row.remark || '点击填写'),
  },
  {
    title: '最近启动', key: 'lastOpenTime', width: 150,
    render: (row) => h('span', { style: { color: '#86909c', fontSize: '13px' } }, fmtTime(row.lastOpenTime)),
  },
  {
    title: '操作', key: 'actions', width: 200, fixed: 'right',
    render: (row) => h('div', { style: { display: 'flex', gap: '4px', alignItems: 'center' } }, [
      h('button', {
        style: {
          height: '28px', padding: '0 14px', borderRadius: '4px', border: 'none', cursor: 'pointer',
          fontSize: '13px', fontWeight: 500, color: '#fff', background: '#2f54eb',
        },
        onClick: () => openWindow(row),
      }, running.value.has(row.name) ? '打开' : '打开窗口'),
      h('button', { style: btnGhostStyle, onClick: () => handleEdit(row) }, '编辑'),
      h(NDropdown, {
        trigger: 'click',
        options: moreActionOptions(row),
        onSelect: (key) => handleMoreSelect(row, key),
      }, {
        default: () => h('button', {
          style: { ...btnGhostStyle, width: '28px', padding: 0, fontWeight: 700 },
        }, '⋯'),
      }),
    ]),
  },
];

const btnGhostStyle = {
  height: '28px', padding: '0 10px', borderRadius: '4px', cursor: 'pointer',
  fontSize: '13px', fontWeight: 500, background: 'transparent',
  border: '1px solid #e5e6eb', color: '#4e5969',
};

// ---------- 行操作 ----------
const openWindow = (row) => {
  window.myApi.openSite({ url: row.url, name: row.name });
  message.success(`正在打开「${row.tag || row.name}」`);
  setTimeout(load, 1200);
};

const ele = ref({});
const show = ref(false);
const handleEdit = (element) => {
  const copy = JSON.parse(JSON.stringify(element));
  if (!Object.hasOwn(copy, 'proxy')) copy.proxy = '';
  copy.isNew = false;
  ele.value = copy;
  show.value = true;
};

const addNewBrowser = async () => {
  let startUrl = '';
  let icon = '';
  try { startUrl = await window.myApi.getBrowserStartUrl() } catch { }
  try { const r = await window.myApi.getBrowserIcon(); icon = r && r.ret === 0 ? r.data : '' } catch { }
  const n = list.value.filter(item => item.isBrowser).length + 1;
  ele.value = { tag: `浏览器环境 ${n}`, url: startUrl, name: '', proxy: '', type: 'browser', extensions: [], remark: '', isOpen: true, isNew: true, img: icon };
  show.value = true;
};

const addNewSite = () => {
  ele.value = { tag: '', url: '', name: '', proxy: '', type: 'site', extensions: [], remark: '', isOpen: true, isNew: true, img: '' };
  show.value = true;
};

const handleSaveForm = async (element) => {
  if (element.isNew === true) {
    element.isNew = false;
    element.name = element.url;
    list.value.unshift(element);
    window.myApi.addMenu(toRaw(element));
  } else {
    list.value.forEach(item => {
      if (item.name === element.name) Object.assign(item, element);
    });
    window.myApi.updateMenu(toRaw(element));
  }
  setTimeout(load, 350);
};

const handleClone = (element) => {
  const newElement = {
    tag: element.tag + '-copy',
    name: element.url,
    url: element.url,
    img: element.img,
    isOpen: true,
  };
  if (element.isBrowser) {
    newElement.type = 'browser';
    newElement.extensions = Array.isArray(element.extensions) ? element.extensions : [];
    newElement.remark = element.remark || '';
  }
  window.myApi.addMenu(newElement);
  message.success('克隆成功');
  setTimeout(load, 350);
};

const handleRemove = (element) => {
  dialog.warning({
    title: '确认删除窗口',
    content: `「${element.tag || element.name}」将被删除，独立会话与配置不可恢复。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: () => {
      const index = list.value.findIndex(item => item.name === element.name);
      if (index !== -1) list.value.splice(index, 1);
      window.myApi.removeMenu(toRaw(element));
      message.success('已删除');
      setTimeout(load, 350);
    }
  });
};

const randomizeFingerprint = async (row) => {
  try {
    await window.myApi.randomizeSiteFingerprint(row.name);
    message.success('指纹已随机化，重新打开窗口生效');
  } catch { message.error('随机化失败') }
};

const moreActionOptions = (row) => [
  { label: '克隆窗口', key: 'clone' },
  { label: '随机指纹', key: 'random' },
  {
    label: '移动到分组', key: 'move',
    children: [
      { label: '未分组', key: 'move:none' },
      ...groups.value.map(g => ({ label: nameOf(g), key: 'move:' + g.name })),
    ],
  },
  { type: 'divider', key: 'd1' },
  { label: '编辑', key: 'edit' },
  { label: '删除', key: 'delete' },
];
const handleMoreSelect = (row, key) => {
  if (!row) return;
  if (key === 'clone') handleClone(row);
  else if (key === 'random') randomizeFingerprint(row);
  else if (key.startsWith('move:')) moveToGroup(row, key.slice(5));
  else if (key === 'edit') handleEdit(row);
  else if (key === 'delete') handleRemove(row);
};

// ---------- 备注 ----------
const remarkModal = ref({ show: false, value: '', row: null });
const openRemark = (row) => {
  remarkModal.value = { show: true, value: row.remark || '', row };
};
const saveRemark = () => {
  const { row, value } = remarkModal.value;
  if (!row) return;
  window.myApi.updateMenu(toRaw({ ...row, remark: value }));
  message.success('备注已保存');
  remarkModal.value.show = false;
  setTimeout(load, 300);
};
</script>

<template>
  <div class="wm-page">
    <!-- 工具栏（BitBrowser 同款） -->
    <div class="wm-toolbar">
      <n-input v-model:value="keyword" placeholder="搜索窗口名称 / 备注 / 序号" clearable size="small"
        style="width: 240px;">
        <template #prefix>🔍</template>
      </n-input>
      <n-select v-model:value="filterGroup" :options="groupOptions" size="small" style="width: 150px;" />
      <n-select v-model:value="filterStatus" :options="statusOptions" size="small" style="width: 120px;" />

      <div class="wm-toolbar-right">
        <n-button size="small" secondary :loading="loading" @click="load">刷新</n-button>
        <n-button size="small" secondary @click="addNewSite">新增站点</n-button>
        <n-button size="small" type="primary" @click="addNewBrowser" style="padding: 0 16px;">
          创建窗口
        </n-button>
      </div>
    </div>

    <!-- 窗口表格 -->
    <n-data-table :columns="columns" :data="pagedRows" :row-key="(r) => r.name"
      :loading="loading" :scroll-x="1120" size="small">
      <template #empty>
        <n-empty description="暂无数据" style="padding: 60px 0;" />
      </template>
    </n-data-table>

    <!-- 底部统计 + 分页 -->
    <div class="wm-footer">
      <span class="wm-total">全部 {{ filtered.length }} 条</span>
      <n-pagination v-model:page="page" v-model:page-size="pageSize" :item-count="filtered.length"
        :page-sizes="[20, 50, 100]" show-size-picker show-quick-jumper />
    </div>

    <!-- 新建/编辑窗口 -->
    <NewDrawer :element="ele" v-model:show="show" @saveForm="handleSaveForm" />

    <!-- 备注编辑 -->
    <n-modal v-model:show="remarkModal.show" preset="dialog" title="修改备注" positive-text="保存" negative-text="取消"
      @positive-click="saveRemark">
      <n-input v-model:value="remarkModal.value" type="textarea" :rows="3" placeholder="填写备注，便于区分多个窗口" />
    </n-modal>
  </div>
</template>

<style scoped>
.wm-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 100%;
}

/* 工具栏 */
.wm-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.wm-toolbar-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
}

/* 底部统计 + 分页 */
.wm-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.wm-total {
  font-size: 13px;
  color: #86909c;
}
</style>

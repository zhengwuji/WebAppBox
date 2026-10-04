<script setup>
import { h } from 'vue'
import { NDropdown } from 'naive-ui'
import NewDrawer from "@/components/NewDrawer.vue";

const message = useMessage();
const dialog = useDialog();

// ---------- 数据 ----------
const list = ref([]);          // 全部窗口（站点 + 浏览器环境）
const groups = ref([]);        // 分组（sites 为名称 CSV）
const running = ref(new Set());// 运行中的窗口名
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

// ---------- 分组 ----------
// activeGroup: undefined=全部窗口, 'none'=未分组, 其它=分组 name
const activeGroup = ref(undefined);
const groupCounts = computed(() => {
  const map = {};
  const memberOf = new Set();
  groups.value.forEach(g => String(g.sites || '').split(',').filter(Boolean).forEach(n => memberOf.add(n)));
  groups.value.forEach(g => {
    map[g.name] = list.value.filter(s => String(g.sites || '').split(',').filter(Boolean).includes(s.name)).length;
  });
  map.__none = list.value.filter(s => !memberOf.has(s.name)).length;
  return map;
});
const groupNameOf = (g) => g.tag || g.name;

const selectGroup = (key) => { activeGroup.value = key; page.value = 1; };

const groupModal = ref({ show: false, tag: '', editing: null });
const openCreateGroup = () => { groupModal.value = { show: true, tag: '', editing: null }; };
const openRenameGroup = (g) => { groupModal.value = { show: true, tag: groupNameOf(g), editing: g.name }; };
const saveGroup = async () => {
  const tag = groupModal.value.tag.trim();
  if (!tag) return message.error('请输入分组名称');
  if (groupModal.value.editing) {
    await window.myApi.updateGroup({ name: groupModal.value.editing, tag });
    message.success('分组已重命名');
  } else {
    await window.myApi.updateGroup({ tag, sites: '', isOpen: false });
    message.success('分组已创建');
  }
  groupModal.value.show = false;
  await load();
};
const removeGroup = (g) => {
  dialog.warning({
    title: '确认删除窗口分组',
    content: `分组「${groupNameOf(g)}」内的窗口将移入未分组，窗口本身不会被删除。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await window.myApi.removeGroup({ name: g.name });
      if (activeGroup.value === g.name) activeGroup.value = undefined;
      message.success('窗口分组已删除');
      await load();
    }
  });
};

// 移动到分组
const moveToGroup = async (row, groupKey) => {
  const memberOf = new Map(); // name -> [group]
  groups.value.forEach(g => String(g.sites || '').split(',').filter(Boolean).forEach(n => {
    if (!memberOf.has(n)) memberOf.set(n, []);
    memberOf.get(n).push(g.name);
  }));
  for (const g of groups.value) {
    const names = String(g.sites || '').split(',').filter(Boolean);
    const has = names.includes(row.name);
    const target = groupKey !== 'none' && g.name === groupKey;
    if (target && !has) names.push(row.name);
    if (!target && has) {
      const next = names.filter(n => n !== row.name);
      await window.myApi.updateGroup({ name: g.name, sites: next.join(',') });
    } else if (target && has) {
      // 已在目标分组
    } else if (target) {
      await window.myApi.updateGroup({ name: g.name, sites: names.join(',') });
    }
  }
  message.success(groupKey === 'none' ? '已移入未分组' : '窗口分组已更新');
  await load();
};

// ---------- 筛选 / 分页 ----------
const keyword = ref('');
const page = ref(1);
const pageSize = ref(20);

const filtered = computed(() => {
  let rows = list.value;
  if (activeGroup.value === 'none') {
    const memberOf = new Set();
    groups.value.forEach(g => String(g.sites || '').split(',').filter(Boolean).forEach(n => memberOf.add(n)));
    rows = rows.filter(s => !memberOf.has(s.name));
  } else if (activeGroup.value !== undefined) {
    const g = groups.value.find(x => x.name === activeGroup.value);
    const names = g ? String(g.sites || '').split(',').filter(Boolean) : [];
    rows = rows.filter(s => names.includes(s.name));
  }
  const kw = keyword.value.trim().toLowerCase();
  if (kw) {
    rows = rows.filter(s =>
      (s.tag || '').toLowerCase().includes(kw) ||
      (s.url || '').toLowerCase().includes(kw) ||
      (s.remark || '').toLowerCase().includes(kw));
  }
  rows.forEach((r, i) => { r.__idx = i + 1; });
  return rows;
});

const pagination = computed(() => ({
  page: page.value,
  pageSize: pageSize.value,
  itemCount: filtered.value.length,
  showSizePicker: true,
  pageSizes: [20, 50, 100],
  showQuickJumper: true,
  prefix: ({ page: p }) => `第 ${p} / ${Math.max(1, Math.ceil(filtered.value.length / pageSize.value))} 页`,
  suffix: ({ itemCount }) => `共 ${itemCount} 条`,
  onChange: (p) => { page.value = p; },
  onUpdatePageSize: (ps) => { pageSize.value = ps; page.value = 1; },
}));

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

const extensionsCount = (row) => {
  if (!row.isBrowser) return 0;
  let ext = row.extensions;
  if (!Array.isArray(ext)) {
    try { ext = ext ? JSON.parse(ext) : [] } catch { ext = [] }
  }
  return Array.isArray(ext) ? ext.length : 0;
};

// ---------- 表格列 ----------
const renderProxyTag = (row) => {
  const s = proxySummary(row.proxy);
  const colorMap = { default: '#858f9f', success: '#059669', info: '#6d28d9' };
  return h('span', {
    style: { display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: colorMap[s.tone], cursor: 'pointer' },
    onClick: () => handleEdit(row),
  }, [
    h('span', { style: { width: '6px', height: '6px', borderRadius: '50%', background: colorMap[s.tone], opacity: .8, display: 'inline-block' } }),
    s.label,
  ]);
};

const columns = [
  { type: 'selection' },
  {
    title: '编号', key: '__idx', width: 62,
    render: (row) => h('span', { style: { color: '#858f9f', fontSize: '12px' } }, String(row.__idx ?? '-')),
  },
  {
    title: '窗口标题', key: 'tag', width: 190, minWidth: 140, ellipsis: { tooltip: true },
    render: (row) => h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 } }, [
      h('img', {
        src: row.img || 'webappbox-logo.png',
        style: { width: '24px', height: '24px', borderRadius: '6px', objectFit: 'cover', flex: 'none', background: '#f0f1f5' },
        onerror: `this.onerror=null;this.src='webappbox-logo.png'`,
      }),
      h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 } }, row.tag || row.name || '未命名窗口'),
    ]),
  },
  {
    title: '所属用户', key: 'owner', width: 96,
    render: () => h('span', {
      style: { fontSize: '12px', padding: '1px 8px', borderRadius: '999px', background: 'rgba(124,58,237,.1)', color: '#6d28d9', fontWeight: 600 },
    }, '本地'),
  },
  { title: '代理', key: 'proxy', width: 190, render: renderProxyTag },
  {
    title: '平台账号', key: 'account', width: 100,
    render: () => h('span', { style: { color: '#c1c7d0', fontSize: '12px' } }, '—'),
  },
  {
    title: '拓展插件', key: 'extensions', width: 100,
    render: (row) => {
      const n = extensionsCount(row);
      if (!n) return h('span', { style: { color: '#c1c7d0', fontSize: '12px' } }, '—');
      return h('span', {
        style: { fontSize: '12px', padding: '1px 8px', borderRadius: '999px', background: 'rgba(2,132,199,.1)', color: '#0369a1', fontWeight: 600, cursor: 'pointer' },
        onClick: () => handleEdit(row),
      }, `${n} 个`);
    },
  },
  {
    title: '备注', key: 'remark', minWidth: 120, ellipsis: { tooltip: true },
    render: (row) => h('span', {
      style: { color: row.remark ? '#566071' : '#c1c7d0', fontSize: '12px', cursor: 'text' },
      onClick: () => openRemark(row),
    }, row.remark || '点击填写'),
  },
  {
    title: '状态', key: 'status', width: 92,
    render: (row) => {
      const on = running.value.has(row.name);
      return h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: on ? '#059669' : '#858f9f' } }, [
        h('span', { style: { width: '7px', height: '7px', borderRadius: '50%', background: on ? '#10b981' : '#cbd2da', display: 'inline-block' } }),
        on ? '运行中' : '未运行',
      ]);
    },
  },
  {
    title: '操作', key: 'actions', width: 210, fixed: 'right',
    render: (row) => h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, [
      h('button', {
        style: {
          height: '26px', padding: '0 12px', borderRadius: '7px', border: 'none', cursor: 'pointer',
          fontSize: '12px', fontWeight: 600, color: '#fff',
          background: running.value.has(row.name) ? 'linear-gradient(135deg,#7e57ff,#7c3aed)' : 'linear-gradient(135deg,#8b5cf6,#7c3aed)',
        },
        onClick: () => openWindow(row),
      }, '打开窗口'),
      h('button', {
        style: btnGhostStyle,
        onClick: () => handleEdit(row),
      }, '编辑'),
      h(NDropdown, {
        trigger: 'click',
        options: moreActionOptions(row),
        onSelect: (key) => handleMoreSelect(row, key),
      }, {
        default: () => h('button', {
          style: { ...btnGhostStyle, width: '28px', padding: 0, fontSize: '14px', fontWeight: 700 },
        }, '⋯'),
      }),
    ]),
  },
];

const btnGhostStyle = {
  height: '26px', padding: '0 10px', borderRadius: '7px', cursor: 'pointer',
  fontSize: '12px', fontWeight: 500, background: 'transparent',
  border: '1px solid rgba(25,33,46,.14)', color: '#566071',
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

// 更多下拉（⋯ 按钮挂 n-dropdown）
const moreActionOptions = (row) => [
  { label: '克隆', key: 'clone' },
  { label: '随机指纹', key: 'random' },
  {
    label: '移动到分组', key: 'move',
    children: [
      { label: '未分组', key: 'move:none' },
      ...groups.value.map(g => ({ label: groupNameOf(g), key: 'move:' + g.name })),
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
    <!-- 页头 -->
    <div class="wm-header">
      <div>
        <h2 class="wm-title">窗口管理</h2>
        <p class="wm-desc">当前工作空间的窗口、会话与指纹配置。</p>
      </div>
      <div class="wm-actions">
        <n-button type="primary" @click="addNewBrowser" style="padding: 0 18px;">
          + 创建窗口
        </n-button>
        <n-button secondary @click="addNewSite">新增站点</n-button>
      </div>
    </div>

    <!-- 分组标签 -->
    <div class="wm-tabs">
      <div class="wm-tabs-list">
        <div class="wm-tab-shell">
          <button type="button" class="wm-tab" :class="{ active: activeGroup === undefined }" @click="selectGroup(undefined)">
            全部窗口
            <small>{{ list.length }}</small>
          </button>
        </div>
        <div v-for="g in groups" :key="g.name" class="wm-tab-shell">
          <button type="button" class="wm-tab" :class="{ active: activeGroup === g.name }" @click="selectGroup(g.name)">
            {{ groupNameOf(g) }}
            <small>{{ groupCounts[g.name] ?? 0 }}</small>
          </button>
          <n-dropdown trigger="click" :options="[{ label: '重命名', key: 'rename' }, { label: '删除分组', key: 'delete' }]"
            @select="(k) => k === 'rename' ? openRenameGroup(g) : removeGroup(g)">
            <button type="button" class="wm-tab-more" title="分组操作">⋯</button>
          </n-dropdown>
        </div>
        <div class="wm-tab-shell">
          <button type="button" class="wm-tab" :class="{ active: activeGroup === 'none' }" @click="selectGroup('none')">
            未分组
            <small>{{ groupCounts.__none ?? 0 }}</small>
          </button>
        </div>
        <button type="button" class="wm-tab-add" title="新建分组" @click="openCreateGroup">＋</button>
      </div>

      <div class="wm-toolbar">
        <n-input v-model:value="keyword" placeholder="搜索关键词" clearable size="small"
          style="width: 220px; border-radius: 8px;">
          <template #prefix>🔍</template>
        </n-input>
        <n-button size="small" secondary :loading="loading" @click="load">刷新</n-button>
      </div>
    </div>

    <!-- 表格 -->
    <n-data-table :columns="columns" :data="filtered" :pagination="pagination" :row-key="(r) => r.name"
      :loading="loading" :scroll-x="1180" size="small" striped>
      <template #empty>
        <n-empty description="暂无数据" style="padding: 60px 0;" />
      </template>
    </n-data-table>

    <!-- 新建/编辑窗口 -->
    <NewDrawer :element="ele" v-model:show="show" @saveForm="handleSaveForm" />

    <!-- 新建/重命名分组 -->
    <n-modal v-model:show="groupModal.show" preset="dialog" :title="groupModal.editing ? '重命名分组' : '新建分组'"
      positive-text="保存" negative-text="取消" @positive-click="saveGroup">
      <n-input v-model:value="groupModal.tag" placeholder="请输入分组名称" @keyup.enter="saveGroup" />
    </n-modal>

    <!-- 备注编辑 -->
    <n-modal v-model:show="remarkModal.show" preset="dialog" title="编辑备注" positive-text="保存" negative-text="取消"
      @positive-click="saveRemark">
      <n-input v-model:value="remarkModal.value" type="textarea" :rows="3" placeholder="填写备注，便于区分多个窗口" />
    </n-modal>
  </div>
</template>

<style scoped>
.wm-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 100%;
}

.wm-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.wm-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #151a23;
}

.wm-desc {
  margin: 4px 0 0;
  font-size: 12.5px;
  color: #858f9f;
}

.wm-actions {
  display: flex;
  gap: 10px;
  flex: none;
}

/* 分组标签行 */
.wm-tabs {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.wm-tabs-list {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.wm-tab-shell {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.wm-tab {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 30px;
  padding: 0 13px;
  border-radius: 999px;
  border: 1px solid rgba(25, 33, 46, .1);
  background: #fff;
  color: #566071;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all .15s;
}

.wm-tab small {
  font-size: 11px;
  color: #858f9f;
  background: rgba(25, 33, 46, .06);
  border-radius: 999px;
  padding: 0 6px;
  line-height: 16px;
}

.wm-tab:hover {
  border-color: rgba(124, 58, 237, .4);
  color: #4c1d95;
}

.wm-tab.active {
  background: rgba(124, 58, 237, .12);
  border-color: rgba(124, 58, 237, .45);
  color: #6d28d9;
  font-weight: 600;
}

.wm-tab.active small {
  background: rgba(124, 58, 237, .16);
  color: #6d28d9;
}

.wm-tab-more {
  position: absolute;
  right: -4px;
  top: -6px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1px solid rgba(25, 33, 46, .14);
  background: #fff;
  color: #858f9f;
  font-size: 10px;
  line-height: 1;
  cursor: pointer;
  display: none;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.wm-tab-shell:hover .wm-tab-more {
  display: inline-flex;
}

.wm-tab-add {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1px dashed rgba(25, 33, 46, .2);
  background: transparent;
  color: #858f9f;
  font-size: 15px;
  cursor: pointer;
  transition: all .15s;
}

.wm-tab-add:hover {
  border-color: #7c3aed;
  color: #6d28d9;
  background: rgba(124, 58, 237, .06);
}

.wm-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
}
</style>

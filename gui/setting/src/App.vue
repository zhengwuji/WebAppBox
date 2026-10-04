<script setup>
import { useRoute } from 'vue-router'
import { darkTheme } from "naive-ui";
import logoUrl from "@/assets/webappbox-logo.png";

const theme = ref({});
// 检测系统主题
const checkTheme = () => {
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  theme.value = isDark ? darkTheme : {};
};
const handleChange = () => checkTheme();
const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
onMounted(() => {
  checkTheme();
  mediaQuery.addEventListener('change', handleChange);
});
onUnmounted(() => mediaQuery.removeEventListener('change', handleChange));

// Naive UI 主题覆盖 — NexBrowser 风格紫色系
const themeOverrides = {
  common: {
    primaryColor: '#7c3aed',
    primaryColorHover: '#6d28d9',
    primaryColorPressed: '#5b21b6',
    primaryColorSuppl: '#7e57ff',
    borderRadius: '8px',
    borderRadiusSmall: '6px',
  },
  Button: {
    borderRadiusMedium: '8px',
    borderRadiusSmall: '6px',
    fontWeight: '500',
  },
  Card: { borderRadius: '14px' },
  Tag: { borderRadius: '6px' },
  Menu: { itemBorderRadius: '8px', itemHeight: '38px' },
  Input: { borderRadius: '8px' },
  Drawer: { borderRadius: '12px' },
  Modal: { borderRadius: '14px' },
  DataTable: { borderRadius: '12px', thPaddingMedium: '12px 10px', tdPaddingMedium: '10px' },
  Pagination: { itemBorderRadius: '8px' },
}

const route = useRoute();

// 侧栏导航 — 与 NexBrowser 同构的分组布局
const navGroups = [
  {
    title: '环境管理',
    items: [
      { key: 'window', label: '窗口管理', to: '/', icon: 'grid' },
      { key: 'fingerprint', label: '指纹环境', to: '/fingerprint', icon: 'finger' },
      { key: 'group', label: '站点分组', to: '/group', icon: 'folder' },
    ]
  },
  {
    title: '资源管理',
    items: [
      { key: 'proxy', label: '代理中心', to: '/proxy', icon: 'globe' },
      { key: 'plugin', label: '拓展市场', to: '/plugin', icon: 'puzzle' },
    ]
  },
  {
    title: '系统中心',
    items: [
      { key: 'set', label: '用户配置', to: '/set', icon: 'gear' },
      { key: 'kernel', label: '版本更新', to: '/kernel', icon: 'refresh' },
      { key: 'shortcut', label: '改快捷键', to: '/shortcut', icon: 'keyboard' },
      { key: 'clipboard', label: '剪贴板', to: '/clipboard', icon: 'clip' },
      { key: 'feedback', label: '使用反馈', to: '/feedback', icon: 'message' },
    ]
  },
];

const icons = {
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  finger: 'M12 3a8 8 0 0 1 8 8M12 7a4 4 0 0 1 4 4v6M12 11v8M8 11a4 4 0 0 1 .5-2M4 13a8 8 0 0 1 .3-2.3M8 15v3M16 15c0 2 .3 3.4.8 4.6',
  folder: 'M4 6a2 2 0 0 1 2-2h3.2l2 2.4H18a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M3 12h18M12 3c2.5 2.4 4 5.6 4 9s-1.5 6.6-4 9c-2.5-2.4-4-5.6-4-9s1.5-6.6 4-9',
  puzzle: 'M9 4h3a2 2 0 1 1 4 0h3v4a2 2 0 1 1 0 4v4h-4a2 2 0 1 0-4 0H7v-4a2 2 0 1 1 0-4V4z',
  gear: 'M12 8.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 0 0 12 8.5M12 3l1.2 2.4 2.6-.6 1 2.5 2.4 1.2-.6 2.5.6 2.5-2.4 1.2-1 2.5-2.6-.6L12 21l-1.2-2.4-2.6.6-1-2.5-2.4-1.2.6-2.5-.6-2.5 2.4-1.2 1-2.5 2.6.6z',
  refresh: 'M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4',
  keyboard: 'M4 7h16v10H4zM7 10h.01M10 10h.01M13 10h.01M16 10h.01M8 14h8',
  clip: 'M9 4h6v3H9zM8 5H6a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2M9 12h6M9 16h4',
  message: 'M4 5h16v11H9l-5 4z',
};

// 顶栏状态
const version = ref('');
const netMode = ref('直接连接');
onMounted(async () => {
  try { version.value = await window.myApi.getVersion() } catch { }
  try {
    const gp = await window.myApi.getGlobalProxy();
    netMode.value = gp && gp.type && gp.type !== 'none' ? '全局代理' : '直接连接';
  } catch { }
});
</script>

<template>
  <n-message-provider>
    <n-dialog-provider>
      <n-config-provider :theme="theme" :theme-overrides="themeOverrides">
      <div class="app-shell">
        <header class="topbar">
          <div class="brand">
            <img :src="logoUrl" alt="WebAppBox" />
            <span class="brand-name">WebAppBox</span>
          </div>
          <div class="top-right">
            <span class="net-chip" :class="netMode === '直接连接' ? 'direct' : 'proxied'">
              <i class="dot"></i>网络模式 · {{ netMode }}
            </span>
            <span class="ver" v-if="version">v{{ version }}</span>
            <div class="avatar" title="本地模式">本</div>
          </div>
        </header>

        <aside class="sidebar">
          <div v-for="g in navGroups" :key="g.title" class="nav-group">
            <div class="nav-group-title">{{ g.title }}</div>
            <router-link v-for="item in g.items" :key="item.key" :to="item.to" class="nav-item"
              :class="{ active: route.path === item.to }">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
                stroke-linecap="round" stroke-linejoin="round">
                <path :d="icons[item.icon]" />
              </svg>
              <span>{{ item.label }}</span>
            </router-link>
          </div>
        </aside>

        <main class="content">
          <RouterView />
        </main>
      </div>
      </n-config-provider>
    </n-dialog-provider>
  </n-message-provider>
</template>

<style scoped>
.app-shell {
  height: 100vh;
  display: grid;
  grid-template-columns: clamp(198px, 11vw, 216px) 1fr;
  grid-template-rows: 48px 1fr;
  background: var(--wbx-page, #f4f6f9);
  color: #151a23;
}

/* ---------- 顶栏 ---------- */
.topbar {
  grid-column: 1 / 3;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  background: rgba(255, 255, 255, .92);
  border-bottom: 1px solid rgba(25, 33, 46, .08);
}

.brand {
  display: flex;
  align-items: center;
  gap: 9px;
  font-weight: 700;
  font-size: 15px;
}

.brand img {
  width: 26px;
  height: 26px;
  border-radius: 7px;
}

.top-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.net-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}

.net-chip .dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.net-chip.direct {
  color: #047857;
  background: rgba(16, 185, 129, .12);
}

.net-chip.direct .dot {
  background: #10b981;
}

.net-chip.proxied {
  color: #6d28d9;
  background: rgba(124, 58, 237, .12);
}

.net-chip.proxied .dot {
  background: #7c3aed;
}

.ver {
  font-size: 12px;
  color: #858f9f;
}

.avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: linear-gradient(135deg, #7e57ff, #7c3aed);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ---------- 侧栏 ---------- */
.sidebar {
  grid-column: 1;
  grid-row: 2;
  margin: 10px 0 10px 10px;
  padding: 10px 9px;
  background: rgba(255, 255, 255, .9);
  border: 1px solid rgba(25, 33, 46, .07);
  border-radius: 14px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-group {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-bottom: 8px;
}

.nav-group-title {
  font-size: 12px;
  color: #858f9f;
  padding: 6px 10px 5px;
  font-weight: 600;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 36px;
  padding: 0 10px;
  border-radius: 9px;
  color: #566071;
  text-decoration: none;
  font-size: 13.5px;
  font-weight: 500;
  transition: background .15s, color .15s;
}

.nav-item svg {
  width: 17px;
  height: 17px;
  flex: none;
}

.nav-item:hover {
  background: rgba(124, 58, 237, .08);
  color: #4c1d95;
}

.nav-item.active {
  background: rgba(124, 58, 237, .12);
  color: #6d28d9;
  font-weight: 600;
}

/* ---------- 内容 ---------- */
.content {
  grid-column: 2;
  grid-row: 2;
  margin: 10px 10px 10px 0;
  padding: 18px 20px;
  background: rgba(255, 255, 255, .9);
  border: 1px solid rgba(25, 33, 46, .07);
  border-radius: 14px;
  overflow-y: auto;
}
</style>

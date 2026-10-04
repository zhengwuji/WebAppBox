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

// Naive UI 主题覆盖 — BitBrowser 风格蓝色系（主色 #2f54eb）
const themeOverrides = {
  common: {
    primaryColor: '#2f54eb',
    primaryColorHover: '#1d39c4',
    primaryColorPressed: '#0958d9',
    primaryColorSuppl: '#4096ff',
    borderRadius: '6px',
    borderRadiusSmall: '4px',
  },
  Button: {
    borderRadiusMedium: '6px',
    borderRadiusSmall: '4px',
    fontWeight: '500',
  },
  Card: { borderRadius: '8px' },
  Tag: { borderRadius: '4px' },
  Input: { borderRadius: '6px' },
  Drawer: { borderRadius: '8px' },
  Modal: { borderRadius: '8px' },
  DataTable: { borderRadius: '6px', thPaddingMedium: '10px 8px', tdPaddingMedium: '8px' },
  Pagination: { itemBorderRadius: '4px' },
}

const route = useRoute();

// 侧栏导航 — BitBrowser 同款扁平一级菜单
const navItems = [
  { key: 'window', label: '浏览器窗口', to: '/', icon: 'grid' },
  { key: 'group', label: '分组管理', to: '/group', icon: 'folder' },
  { key: 'proxy', label: '代理IP', to: '/proxy', icon: 'globe' },
  { key: 'plugin', label: '扩展中心', to: '/plugin', icon: 'puzzle' },
  { key: 'fingerprint', label: '指纹环境', to: '/fingerprint', icon: 'finger' },
  { key: 'set', label: '系统设置', to: '/set', icon: 'gear' },
  { key: 'kernel', label: '版本更新', to: '/kernel', icon: 'refresh' },
  { key: 'shortcut', label: '改快捷键', to: '/shortcut', icon: 'keyboard' },
  { key: 'clipboard', label: '剪贴板', to: '/clipboard', icon: 'clip' },
  { key: 'feedback', label: '使用反馈', to: '/feedback', icon: 'message' },
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
          <!-- 顶栏 -->
          <header class="topbar">
            <div class="brand">
              <img :src="logoUrl" alt="WebAppBox" />
              <span class="brand-name">WebAppBox</span>
              <span class="brand-sub">多开网页盒子</span>
            </div>
            <div class="top-right">
              <span class="net-chip" :class="netMode === '直接连接' ? 'direct' : 'proxied'">
                <i class="dot"></i>网络模式 · {{ netMode }}
              </span>
              <span class="ver" v-if="version">v{{ version }}</span>
              <div class="avatar" title="本地模式">本</div>
            </div>
          </header>

          <!-- 左侧扁平菜单 -->
          <aside class="sidebar">
            <router-link v-for="item in navItems" :key="item.key" :to="item.to" class="nav-item"
              :class="{ active: route.path === item.to }">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
                stroke-linecap="round" stroke-linejoin="round">
                <path :d="icons[item.icon]" />
              </svg>
              <span>{{ item.label }}</span>
            </router-link>

            <div class="sidebar-foot">
              <span>本地模式 · 无需登录</span>
            </div>
          </aside>

          <!-- 内容区 -->
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
  grid-template-columns: 200px 1fr;
  grid-template-rows: 52px 1fr;
  background: #f0f2f5;
  color: #1f2329;
}

/* ---------- 顶栏 ---------- */
.topbar {
  grid-column: 1 / 3;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: #fff;
  border-bottom: 1px solid #e5e6eb;
}

.brand {
  display: flex;
  align-items: center;
  gap: 9px;
  font-weight: 700;
  font-size: 15px;
  color: #1d2129;
}

.brand img {
  width: 28px;
  height: 28px;
  border-radius: 6px;
}

.brand-sub {
  font-size: 12px;
  font-weight: 400;
  color: #86909c;
  border-left: 1px solid #e5e6eb;
  padding-left: 9px;
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
  color: #00b42a;
  background: rgba(0, 180, 42, .1);
}

.net-chip.direct .dot {
  background: #00b42a;
}

.net-chip.proxied {
  color: #2f54eb;
  background: rgba(47, 84, 235, .08);
}

.net-chip.proxied .dot {
  background: #2f54eb;
}

.ver {
  font-size: 12px;
  color: #86909c;
}

.avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: #2f54eb;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ---------- 侧栏（BitBrowser 扁平菜单） ---------- */
.sidebar {
  grid-column: 1;
  grid-row: 2;
  background: #fff;
  border-right: 1px solid #e5e6eb;
  padding: 12px 10px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 40px;
  padding: 0 12px;
  border-radius: 6px;
  color: #4e5969;
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  transition: background .15s, color .15s;
}

.nav-item svg {
  width: 18px;
  height: 18px;
  flex: none;
}

.nav-item:hover {
  background: #f2f3f5;
  color: #1d2129;
}

.nav-item.active {
  background: rgba(47, 84, 235, .08);
  color: #2f54eb;
  font-weight: 600;
}

.sidebar-foot {
  margin-top: auto;
  padding: 10px 12px 4px;
  font-size: 12px;
  color: #c9cdd4;
}

/* ---------- 内容区 ---------- */
.content {
  grid-column: 2;
  grid-row: 2;
  margin: 12px;
  padding: 16px 18px;
  background: #fff;
  border: 1px solid #e5e6eb;
  border-radius: 8px;
  overflow-y: auto;
}
</style>

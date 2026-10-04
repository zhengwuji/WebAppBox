<script setup>
const message = useMessage();

// ---------- 应用信息 ----------
const appVersion = ref('');
const info = ref(null);
const kernelList = ref([]);
const selectedVersion = ref('');
const downloading = ref(false);
const progress = ref({ percent: 0, received: 0, total: 0, version: '' });
const applying = ref(false);
const restoring = ref(false);

const loadAll = async () => {
  try { appVersion.value = await window.myApi.getVersion() } catch { }
  try { info.value = await window.myApi.getKernelInfo() } catch { info.value = null }
  try {
    kernelList.value = await window.myApi.listKernels() || [];
  } catch { kernelList.value = [] }
};
onMounted(loadAll);

window.myApi?.onKernelProgress?.((p) => { progress.value = p || {} });

const download = async () => {
  if (!selectedVersion.value) return message.error('请先选择要下载的内核版本');
  downloading.value = true;
  progress.value = { percent: 0, received: 0, total: 0, version: selectedVersion.value };
  try {
    const r = await window.myApi.downloadKernel(selectedVersion.value);
    if (r && r.ok === false) {
      message.error(r.error || '下载失败');
    } else {
      message.success(`内核 ${selectedVersion.value} 下载完成，可点击「应用并重启」切换`);
      await loadAll();
    }
  } catch (e) {
    message.error(String(e));
  } finally {
    downloading.value = false;
  }
};

const apply = async () => {
  applying.value = true;
  try {
    const r = await window.myApi.applyKernel(info.value?.stagedVersion);
    if (r && r.ok === false) message.error(r.error || '应用失败');
    // 应用成功会退出并重启应用
  } catch (e) {
    message.error(String(e));
  } finally {
    applying.value = false;
  }
};

const restore = async () => {
  restoring.value = true;
  try {
    const r = await window.myApi.restoreKernel();
    if (r && r.ok === false) message.error(r.error || '恢复失败');
    else message.success('已恢复内置内核，重启应用后生效');
    await loadAll();
  } catch (e) {
    message.error(String(e));
  } finally {
    restoring.value = false;
  }
};
</script>

<template>
  <div class="vu-page">
    <div class="vu-header">
      <div>
        <h2 class="vu-title">版本更新</h2>
        <p class="vu-desc">查看应用与内核版本，手动更新 Chromium / Chrome 内核到指定版本。</p>
      </div>
    </div>

    <!-- 应用版本 -->
    <section class="vu-card">
      <h3 class="vu-card-title">应用版本</h3>
      <div class="vu-kv">
        <span class="k">WebAppBox</span>
        <span class="v">v{{ appVersion }}</span>
      </div>
      <div class="vu-kv" v-if="info">
        <span class="k">内核（Electron / Chromium）</span>
        <span class="v">{{ info.electron }} / Chromium {{ info.chrome }}</span>
      </div>
      <div class="vu-kv" v-if="info">
        <span class="k">运行环境</span>
        <span class="v">{{ info.packaged ? '已打包' : '开发模式' }} · {{ info.platform }}-{{ info.arch }}</span>
      </div>
    </section>

    <!-- 内核管理 -->
    <section class="vu-card">
      <h3 class="vu-card-title">浏览器内核更新</h3>
      <n-alert v-if="info && !info.supported" type="warning" :show-icon="false" style="margin-bottom: 12px;">
        内核更换仅支持打包后的 Windows 版本；开发模式下仅供查看。
      </n-alert>
      <div class="vu-form-row">
        <n-select v-model:value="selectedVersion" filterable placeholder="选择内核版本"
          :options="kernelList.map(v => ({ label: 'v' + v, value: v }))" style="width: 240px;" />
        <n-button type="primary" :loading="downloading" @click="download" :disabled="!info?.supported">下载内核</n-button>
        <n-button v-if="info?.stagedVersion" secondary @click="apply" :loading="applying">
          应用并重启（已就绪 v{{ info.stagedVersion }}）
        </n-button>
        <n-button v-if="info?.hasBackup" quaternary type="warning" @click="restore" :loading="restoring">
          恢复内置内核
        </n-button>
      </div>

      <div v-if="downloading" style="margin-top: 14px;">
        <n-progress type="line" :percentage="Math.floor(progress.percent || 0)" indicator-placement="inside" processing />
        <p class="vu-progress-text">
          正在下载 v{{ progress.version }} · {{ (progress.received / 1048576).toFixed(1) }}MB /
          {{ (progress.total / 1048576).toFixed(1) }}MB
        </p>
      </div>

      <p class="vu-hint">
        下载完成后点击「应用并重启」，程序会退出、替换内核文件并自动重启；替换前自动备份，可随时恢复。
        源：npmmirror / GitHub 官方发布，下载后做 SHA256 校验。
      </p>
    </section>
  </div>
</template>

<style scoped>
.vu-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.vu-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #151a23;
}

.vu-desc {
  margin: 4px 0 0;
  font-size: 12.5px;
  color: #858f9f;
}

.vu-card {
  border: 1px solid rgba(25, 33, 46, .08);
  border-radius: 12px;
  padding: 14px 16px;
  background: #fff;
}

.vu-card-title {
  margin: 0 0 12px;
  font-size: 14.5px;
  font-weight: 650;
  color: #151a23;
}

.vu-kv {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 5px 0;
  font-size: 13px;
}

.vu-kv .k {
  color: #858f9f;
  width: 200px;
  flex: none;
}

.vu-kv .v {
  color: #151a23;
  font-weight: 600;
}

.vu-form-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.vu-progress-text {
  margin: 6px 0 0;
  font-size: 12px;
  color: #858f9f;
}

.vu-hint {
  margin: 14px 0 0;
  font-size: 12px;
  color: #858f9f;
}
</style>

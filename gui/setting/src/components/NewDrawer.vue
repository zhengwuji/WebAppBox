<script setup>
import iconCancel from "@/components/icons/cancel.vue";
import iconSave from "@/components/icons/save.vue";

const message = useMessage();
const props = defineProps({
  element: Object,
  show: Boolean
})

const uploader = ref(null)
const formData = reactive({tag: '', url: '', proxy: '', type: 'site', extensions: []})
watch(() => props.element, (newVal) => {
  Object.assign(formData, newVal || {})
  formData.type = newVal?.type || 'site'
  if (Array.isArray(newVal?.extensions)) {
    formData.extensions = [...newVal.extensions]
  } else {
    try { formData.extensions = newVal?.extensions ? JSON.parse(newVal.extensions) : [] } catch { formData.extensions = [] }
  }
  parseProxy(newVal?.proxy || '')
}, { immediate: true })

const emit = defineEmits(['update:show', 'saveForm'])
const title = computed(() => {
  if (formData.type === 'browser') {
    return props.element.isNew !== false ? '新增浏览器环境' : '编辑浏览器环境'
  }
  return props.element.isNew !== false ? '新增站点' : '编辑站点'
})

// ---------- 代理（结构化：SOCKS5/HTTP + 账密，存储为 JSON） ----------
const proxyMode = ref('global')
const proxyForm = reactive({ type: 'socks5', host: '', port: '', username: '', password: '' })
const testing = ref(false)
const testResult = ref(null)

const parseProxy = (raw) => {
  testResult.value = null
  proxyMode.value = 'global'
  proxyForm.type = 'socks5'; proxyForm.host = ''; proxyForm.port = ''
  proxyForm.username = ''; proxyForm.password = ''
  const value = String(raw || '')
  if (!value) return
  if (value.startsWith('{')) {
    try {
      const p = JSON.parse(value)
      proxyMode.value = p.mode || 'global'
      if (p.type && p.type !== 'none') {
        proxyForm.type = p.type
        proxyForm.host = p.host || ''
        proxyForm.port = String(p.port || '')
        proxyForm.username = p.username || ''
        proxyForm.password = p.password || ''
      }
      return
    } catch { /* 落到默认 */ }
  }
  // 兼容旧字符串格式：socks5://user:pass@host:port / http://host:port / host:port
  proxyMode.value = 'custom'
  const withoutScheme = value.replace(/^\w+:\/\//, '')
  const withoutAuth = withoutScheme.split('@').pop()
  const parts = withoutAuth.split(':')
  proxyForm.type = value.startsWith('socks') ? 'socks5' : 'http'
  proxyForm.host = parts[0] || ''
  proxyForm.port = parts[1] || ''
}

const cleanForm = () => ({
  type: proxyForm.type, host: proxyForm.host.trim(), port: parseInt(proxyForm.port, 10),
  username: proxyForm.username, password: proxyForm.password
})

const buildProxyValue = () => {
  if (proxyMode.value === 'custom') {
    if (!proxyForm.host.trim() || !parseInt(proxyForm.port, 10)) {
      message.error('自定义代理需填写主机和端口')
      return null
    }
    return JSON.stringify({
      mode: 'custom', type: proxyForm.type, host: proxyForm.host.trim(),
      port: parseInt(proxyForm.port, 10), username: proxyForm.username, password: proxyForm.password
    })
  }
  return JSON.stringify({ mode: proxyMode.value })
}

const testingProxy = async () => {
  if (!proxyForm.host.trim() || !parseInt(proxyForm.port, 10)) {
    return message.error('请先填写主机和端口')
  }
  testing.value = true
  testResult.value = null
  try {
    testResult.value = await window.myApi.testProxy(cleanForm())
  } catch (e) {
    testResult.value = { ok: false, error: String(e) }
  } finally {
    testing.value = false
  }
}

// ---------- 扩展（浏览器环境） ----------
const pluginOptions = ref([])
onMounted(async () => {
  try {
    const plugins = await window.myApi.getPlugins()
    pluginOptions.value = plugins.map(p => ({
      label: p.name + (p.enabled ? '' : '（全局未启用，本环境仍可挂载）'),
      value: p.id
    }))
  } catch { pluginOptions.value = [] }
})

// ---------- 保存 ----------
const isValidUrl = (url) => { try { new URL(url); return true } catch { return false } }
const normalizeUrl = (url) => {
  const v = String(url || '').trim()
  if (!v) return v
  if (/^https?:\/\//i.test(v) || /^file:/i.test(v)) return v
  return 'https://' + v
}

const handleSave = () => {
  if (!formData.tag) {
    return message.error("名称不能为空");
  }
  if (formData.type !== 'browser') {
    formData.url = normalizeUrl(formData.url)
    if (!isValidUrl(formData.url)) {
      return message.error("请输入合法 URL");
    }
  }
  const proxyValue = buildProxyValue()
  if (proxyValue === null) return
  formData.proxy = proxyValue
  formData.img = uploader.value.getUrl();
  emit('saveForm', JSON.parse(JSON.stringify(formData)))
  emit('update:show', false)
  return message.success("保存成功");
}
</script>

<template>
  <n-drawer :show="show" @update:show="(value) => emit('update:show', value)" :width="502" placement="right">
    <n-drawer-content :title="title" closable>
      <div class="flex-row">
        <ImageUpload ref="uploader" :imgUrl="element.img" />
        <n-input type="text" placeholder="名称" v-model:value="formData.tag" clearable />
      </div>

      <template v-if="formData.type !== 'browser'">
        <div class="flex-row" style="margin-top: 30px">
          <n-input type="text" size="large" placeholder="网页地址（如 www.google.com，自动补全 https://）" v-model:value="formData.url" clearable />
        </div>
      </template>
      <n-alert v-else :show-icon="false" style="margin-top: 20px;">
        <p style="color: var(--color-text-secondary);">
          浏览器环境 = 一台全新的浏览器：独立 Cookie 会话、独立指纹、独立代理、可挂载扩展。<br>
          打开后从起始页输入网址上网；需要多开时再次「新增浏览器环境」即可。
        </p>
      </n-alert>

      <template v-if="formData.type === 'browser'">
        <div class="flex-row" style="margin-top: 20px">
          <n-select v-model:value="formData.extensions" multiple clearable filterable
                    :options="pluginOptions" placeholder="挂载扩展（可多选，仅本环境生效）" />
        </div>
      </template>

      <div class="flex-row" style="margin-top: 20px">
        <n-radio-group v-model:value="proxyMode" size="small">
          <n-radio-button value="global">跟随全局</n-radio-button>
          <n-radio-button value="direct">直连</n-radio-button>
          <n-radio-button value="custom">自定义代理</n-radio-button>
        </n-radio-group>
      </div>

      <template v-if="proxyMode === 'custom'">
        <div class="flex-row" style="margin-top: 14px">
          <n-select size="small" style="max-width: 140px" v-model:value="proxyForm.type"
                    :options="[{label:'SOCKS5',value:'socks5'},{label:'HTTP',value:'http'}]" />
          <n-input size="small" placeholder="主机 如 127.0.0.1" v-model:value="proxyForm.host" />
          <n-input size="small" placeholder="端口" v-model:value="proxyForm.port" />
        </div>
        <div class="flex-row" style="margin-top: 10px">
          <n-input size="small" placeholder="用户名（可空）" v-model:value="proxyForm.username" />
          <n-input size="small" type="password" show-password-on="click" placeholder="密码（可空）" v-model:value="proxyForm.password" />
        </div>
        <n-button size="small" style="margin-top: 10px" :loading="testing" @click="testingProxy">测试连接</n-button>
        <n-alert v-if="testResult && testResult.ok" type="success" style="margin-top: 10px;" :show-icon="false">
          ✅ 出口 IP：{{ testResult.ip }} · {{ testResult.country }}（{{ testResult.countryCode }}）· {{ testResult.city }} · 延迟 {{ testResult.latencyMs }}ms
        </n-alert>
        <n-alert v-if="testResult && !testResult.ok" type="error" style="margin-top: 10px;" :show-icon="false">
          ❌ {{ testResult.error }}
        </n-alert>
      </template>

      <br>
      <n-alert :show-icon="false">
        <p style="color: var(--color-text-secondary);">
          代理说明：默认跟随「指纹环境 → 全局代理」；直连则不走代理；自定义仅对本条目生效。<br>
          支持 SOCKS5 / HTTP 及用户名密码认证，带密码的 SOCKS5 自动经本地中继转发。
        </p>
      </n-alert>

      <template #footer>
        <div class="flex-footer">
          <n-button @click="handleClose">
            <template #icon>
              <n-icon color="#fff"> <iconCancel /> </n-icon>
            </template>
            取消
          </n-button>

          <n-button type="primary" @click="handleSave">
            <template #icon>
              <n-icon color="#fff"> <iconSave /> </n-icon>
            </template>
            保存
          </n-button>
        </div>
      </template>
    </n-drawer-content>
  </n-drawer>
</template>

<style scoped>
.flex-row{
  display: flex;
  flex-direction: row;
  gap: 1rem;
  align-items: flex-end;
}

.flex-footer{
  display: flex;
  flex-direction: row;
  gap: 1rem;
  align-items: center;
}
</style>

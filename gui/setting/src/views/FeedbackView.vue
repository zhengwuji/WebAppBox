<script setup>

</script>

<template>
  <div id="content-main">
      <n-alert :show-icon="false" type="info" style="margin-bottom: 1rem;">
        <n-h3 style="margin-bottom: 0;">使用反馈</n-h3>
      </n-alert>

    <n-card title="🌐 问题反馈" embedded :bordered="true">
      <n-space size="small" style="margin-top: 10px">
        <n-tag :bordered="false" type="info" size="small">GitHub Issues:</n-tag>
        <a target="_blank" href="https://github.com/zhengwuji/WebAppBox/issues">github.com/zhengwuji/WebAppBox/issues</a><br>
      </n-space>
      <n-p style="color: var(--color-text-secondary);">提交反馈时请尽量附上复现步骤、预期结果与实际结果</n-p>
    </n-card>
  </div>
</template>

<style scoped>
.n-card{
  margin-top: 1rem;
}
</style>

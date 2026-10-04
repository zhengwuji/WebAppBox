<script setup>
import {onMounted} from "vue";

const list = ref([]);
onMounted(async () => {
  list.value = await window.myApi.getShortcuts();
});
</script>

<template>
  <div id="content-main">
    <n-alert :show-icon="false" type="info" style="margin-bottom: 1rem;">
      <n-h3 style="margin-bottom: 0;">快捷键</n-h3>
    </n-alert>

    <n-alert :show-icon="false">
      1.🌐标记为全局快捷键，程序失去焦点后也能使用。<br>
      2.在macOS系统：Ctrl === Command键，Alt === Option键；<br>
      3.自定义快捷键时，先获取焦点，然后在输入框中按其它快捷键；<br>
    </n-alert>

    <div class="box">
      <div class="title">
        <div style="width:250px;"> 功能描述 </div>
        <div style="width: 200px;"> 自定义快捷键 </div>
        <div class="switch"> 是否禁用 </div>
      </div>
      <div class="box-card" v-auto-height="{ offset: 20 }">
        <template v-for="element in list">
          <ShortItem :element="element" />
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.box{
  margin-top: 1rem;
  border: 1px solid var(--new-color-border);
  min-width: 600px;
  overflow: hidden;
}

.box-card{
  overflow: hidden;
  overflow-y: scroll;
}

.title{
  font-size: 15px;
  padding: 0.5em;
  border-bottom: 1px solid var(--new-color-border);
  background-color: var(--color-background-mute);
  display: flex;
  justify-content: flex-start;
  flex-wrap: wrap;
  align-items: center;
}
.switch{
  margin-left: auto;
  width: 100px;
  text-align: center;
}
</style>
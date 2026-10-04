<script setup>
import { ref, onMounted } from 'vue';
import draggable from "vuedraggable"
const message = useMessage();

const list1 = ref(null);
const list2 = ref(null);

onMounted(async () => {
  const config = await window.myApi.getConfig();
  list1.value = config.openMenus;
  list2.value = config.closeMenus;
});

const updateOpenMenu = async (e) => {
  try{
    const plainList1 = JSON.parse(JSON.stringify(list1.value));
    plainList1.forEach(item => {
      item.order = plainList1.indexOf(item) + 1;
    });
    await window.myApi.batchMenus(plainList1);
  }catch (error){
    message.error("操作失败:"+error);
  }
}

</script>

<template>

  <div id="content-main">
    <n-alert :show-icon="false" type="info" style="margin-bottom: 1rem;">
      <n-h3 style="margin-bottom: 0;">移动排序</n-h3>
    </n-alert>

    <n-alert :show-icon="false">
      1.在图标上按住鼠标左键拖动可排序；<br />
      2.部分站点需要魔法上网，请自行解决。
    </n-alert>
  <n-flex>
    <div class="box">
      <h3>移动排序</h3>
      <draggable
        class="list-group"
        :list="list1"
        group="people"
        @change="updateOpenMenu"
        itemKey="name"
      >
        <template #item="{ element, index }">
          <AiItem :element="element" />
        </template>
      </draggable>
    </div>
  </n-flex>
  </div>
</template>

<style scoped>
.box{
  margin-top: 1rem;
  flex: 1;
  border: 1px solid var(--color-border);
}

.box:first-child{
  margin-right: 0;
}

.box h3{
  font-size: 15px;
  padding: 0.5em;
  border-bottom: 1px solid var(--color-border);
  background-color: var(--color-background-mute);
}

.list-group{
  min-height: 300px;
  display: flex;
  flex-wrap: wrap;
  padding-right: 10px;
  justify-content: flex-start;
  align-content: flex-start;
  overflow-x: hidden;
}

.list-group::after{
  content: "";
  width: 20px;
}

.close-area{
  filter: grayscale(100%);
}
</style>
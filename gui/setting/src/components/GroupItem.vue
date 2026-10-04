<script setup>
import iconOptions from "./icons/options1.vue"
import draggable from "vuedraggable"

import {onMounted} from "vue";
const message = useMessage();

const emit = defineEmits(['edit', 'remove', 'change'])
const props = defineProps({
  element: Object,
  list: Array
})

const myList = ref([]);
const show = ref(false);
const isSwitchShow = ref(false);
const options = [
  {
    label: "修改",
    key: "modify"
  },
  {
    label: "删除",
    key: "remove"
  }
];

const reComputed = (list, arrSites)=>{
  myList.value= [];

  const listMap = new Map();
  list.forEach(item => {listMap.set(item.name, item);})
  myList.value = arrSites.map(name => listMap.get(name)).filter(Boolean);
}

watch(() => props.element, (newVal) => {
  const arrSites = newVal.sites.split(',');
  reComputed(props.list, arrSites);
  isSwitchShow.value = newVal.isOpen;
}, { immediate: true })

onMounted(() => {
  isSwitchShow.value = props.element.isOpen;
  const arrSites = props.element.sites.split(',');
  reComputed(props.list, arrSites)
});


const handleSelect = (key) => {
   if(key === 'modify'){
      emit('edit', props.element)
   }else{
      emit('remove', props.element)
   }
};
const handleClick = ()=> {
  show.value = !show.value;
};

const changeSwitch = async (val)=>{
  const group = Object.assign(toRaw(props.element), {isOpen: val});
  await window.myApi.updateGroup(group);
  emit('change');
  message.success("操作成功");
}

const changeGroup = async (e)=>{
  try{
    const sites = myList.value.map(item => item.name).join(',');
    await window.myApi.updateGroup(Object.assign(toRaw(props.element), {sites}))
    message.success("保存成功");
  }catch (e){
    message.error("保存失败"+e)
  }
}
</script>

<template>
  <div class="wrapper">
    <div class="title">
      <div class="tag_name">{{ element.tag }}</div>
      <div class="operate">
        <n-dropdown trigger="click" :options="options" @select="handleSelect">
        <span @click="handleClick">
          <n-icon size="20"> <iconOptions /> </n-icon>
        </span>
        </n-dropdown>
      </div>
      <div class="switch">
        <n-switch size="small" v-model:value="isSwitchShow" @update:value="changeSwitch" style="font-size:10px;" >
          <template #checked>启用</template>
          <template #unchecked>关闭</template>
        </n-switch>
      </div>
    </div>
    <div class="box">
      <draggable
          class="list-group"
          :list="myList"
          :group="element.name"
          @change="changeGroup"
          itemKey="name"
      >
        <template #item="{element, index }">
          <GroupIcon :element="element" />
        </template>
      </draggable>
    </div>
  </div>
</template>

<style scoped>
.wrapper {
  background-color: var(--color-background-soft);
  border: 1px solid var(--color-border);
  margin-bottom: 10px;
}

.wrapper:hover {
  background-color: var(--color-background-mute);
}

.title{
  display: flex;
  flex-direction: row;
  justify-content: flex-start;
  align-items: center;
  border-bottom: 1px dashed var(--color-border);
  padding: 2px 10px;
}
.box{
  padding: 10px;
  overflow-x: auto;
}
.tag_name{
  font-size: 14px;
  font-weight: bold;
}
.operate{
  margin-left: auto;
  text-align: right;
  vertical-align: center;
  width: 80px;
  flex-shrink: 0;
}

.operate span{
  display: inline-block;
  padding-top:5px;
  width: 20px;
  cursor: pointer;
}

.switch{
  text-align: right;
  vertical-align: center;
  width: 80px;
  flex-shrink: 0;
}


.list-group{
  min-height: 60px;
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  align-content: center;
  gap: 5px;
}
</style>

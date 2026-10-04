<script setup>
const message = useMessage();
const props = defineProps({
  element: Object
})

let cmd = (props.element.cmd).replace(/CommandOrControl/ig, 'Ctrl');
const shortCut = ref(cmd);

const handleKeydown = (e)=>{
  e.preventDefault()
  e.stopPropagation();

  const modifiers = [];
  e.ctrlKey && modifiers.push('Ctrl');
  e.metaKey && modifiers.push('Ctrl');
  e.altKey && modifiers.push('Alt');
  e.shiftKey && modifiers.push('Shift');

  if(modifiers.length >= 3 || (modifiers.length < 1)) return;
  let key = (e.key === ' ') ? 'Space' : capitalize(e.key)
  key = key.replace(/^Arrow/, '')
  shortCut.value = modifiers.join("+")+"+";
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) return;
  shortCut.value = [...modifiers, key].join('+');

  const cmdKey = shortCut.value.replace(/Ctrl/ig, 'CommandOrControl');
  const short = Object.assign(toRaw(props.element), { cmd: cmdKey, flag:false});
  sendShortcut(short)
}

const handleKeyup = (e)=>{
  e.preventDefault()
  e.stopPropagation();
  const shortKey = shortCut.value.split("+").filter((item) => item !== '')
  const modifierKeys = ['Ctrl', 'Shift', 'Alt'];

  if(shortKey.every(key => modifierKeys.includes(key))){
    shortCut.value = cmd
  }
}
const capitalize = (str) => {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const sendShortcut = (shortcut) => {
  window.myApi.updateShortcut(shortcut).then(res => {
    if(res.code === 0){
      message.success(res.msg);
      cmd = (res.data.cmd).replace(/CommandOrControl/ig, 'Ctrl');
    }else{
      message.error(res.msg);
      shortCut.value = cmd
    }
  })
}

const changeSwitch = (val)=>{
  const cmdKey = shortCut.value.replace(/Ctrl/ig, 'CommandOrControl');
  let short = Object.assign(toRaw(props.element), { cmd:cmdKey, isOpen:val, flag:true});
  sendShortcut(short);
}

</script>

<template>
  <div class="wrap">
    <div style="width: 250px;"><span v-if="element.isGlobal">🌐</span>{{ element.tag }}</div>
    <div>
      <n-input-group>
        <n-input
            :style="{ width: '90%' }"
            size="small"
            readonly
            v-model:value="shortCut"
            @keydown="handleKeydown"
            @keyup="handleKeyup"
        />
      </n-input-group>
    </div>
    <div class="switch">
      <n-switch size="medium" v-model:value="element.isOpen" @update:value="changeSwitch" style="font-size:12px;" >
        <template #checked>
          开启
        </template>
        <template #unchecked>
          禁用
        </template>
      </n-switch>
    </div>
  </div>
</template>

<style scoped>
.wrap {
  padding: 0.5em;
  margin-left: 10px;
  display: flex;
  flex-direction: row;
  justify-content: flex-start;
  align-items: center;
  place-items: center;
  flex-wrap: wrap;
  border-bottom: 1px solid var(--new-color-border);
}
.wrap:hover {
  background-color: var(--color-background-soft);
}

.switch{
  text-align: right;
  vertical-align: center;
  width: 80px;
  margin-left: auto;
  flex-shrink: 0;
}
</style>

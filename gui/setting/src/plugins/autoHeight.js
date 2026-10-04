// src/plugins/autoHeight.js
import { ref, onMounted, onUnmounted } from 'vue'

export const useAutoHeight = (offset = 20) => {
    const dynamicHeight = ref(0)
    const adjustHeight = (element) => {
        if (!element) return
        const viewportHeight = window.innerHeight
        const divTop = element.getBoundingClientRect().top
        const height = Math.max(0, viewportHeight - divTop)
        element.style.height = `${height - offset}px`
        dynamicHeight.value = height - offset
    }

    const init = (element) => {
        adjustHeight(element)
        window.addEventListener('resize', () => adjustHeight(element))
        window.addEventListener('scroll', () => adjustHeight(element))
    }

    const destroy = () => {
        window.removeEventListener('resize', adjustHeight)
        window.removeEventListener('scroll', adjustHeight)
    }

    return { dynamicHeight, init, destroy }
}

// 注册为全局指令
export const autoHeightDirective = {
    mounted(el, binding) {
        const offset = binding.value?.offset || 20
        const { init, destroy } = useAutoHeight(offset)

        init(el)

        // 保存清理函数到元素属性
        el.__autoHeightCleanup__ = destroy
    },
    unmounted(el) {
        if (el.__autoHeightCleanup__) {
            el.__autoHeightCleanup__()
        }
    }
}

// 默认安装方法
export default {
    install(app) {
        app.directive('auto-height', autoHeightDirective)
    }
}
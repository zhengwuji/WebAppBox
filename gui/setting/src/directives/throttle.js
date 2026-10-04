export const throttleDirective = {
    mounted(el, binding) {
        const delay = binding.value || 2000
        const handlerType = 'click'

        // 获取 Vue 3 事件处理器
        const eventHandlers = el.__vei || {}
        const originalHandler = eventHandlers[handlerType]?.value

        if (!originalHandler) {
            console.warn(`v-throttle 需要配合 @${handlerType} 使用`)
            return
        }

        const throttledHandler = () => {
            if (!el._throttleTimer) {
                el._throttleTimer = setTimeout(() => {
                    el._throttleTimer = null
                }, delay)
                originalHandler.apply(this, arguments)
            }
        }

        // 更新 Vue 内部事件记录
        el.__vei[handlerType].value = throttledHandler
    },

    unmounted(el) {
        clearTimeout(el._throttleTimer)
        el._throttleTimer = null
    }
}